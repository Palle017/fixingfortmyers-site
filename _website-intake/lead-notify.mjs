// Every new lead is announced on every configured surface: email, phone push (ntfy),
// a text to Tony (Twilio) and a desktop notification on the receiver laptop.
// Each channel is queued in SQLite inside the lead's transaction and retried on its own,
// so one failing surface never blocks the others or the customer's receipt.
import {spawn} from 'node:child_process';
import net from 'node:net';
import tls from 'node:tls';
import os from 'node:os';
import {TONY_ALERT_NUMBER} from './lead-routing.mjs';
import {createTwilioAlertAdapter} from './urgent-alerts.mjs';
import {SOURCES} from './lead-desk.mjs';

export const DEFAULT_ALERT_EMAILS = ['prudhvi.pallempati@gmail.com'];
const DELAYS = [30000, 120000, 600000, 1800000, 3600000];
const yesNo = value => value === 'yes' ? 'Yes' : value === 'no' ? 'No' : 'Unknown';

export function summarize(lead, id, decision) {
  const urgent = decision?.priority === 'first';
  const title = `${urgent ? 'URGENT ' : ''}New repair request: ${lead.vehicle || 'vehicle not given'}`;
  const source = SOURCES[lead.source] ? lead.source : lead.kind === 'voicenote' ? 'voice' : 'form';
  // null = omitted line; '' = intentional blank separator.
  const lines = [
    urgent ? 'FIRST PRIORITY: customer reports stranded and the vehicle does not start.' : null,
    `Name: ${lead.name}`,
    lead.phone ? `Callback: ${lead.phone} (${lead.smsConsent ? 'text OK' : 'call only, no text permission'})` : 'Callback: no number given',
    `Vehicle: ${lead.vehicle || 'Not provided'}`,
    `Location: ${lead.city || 'Not provided'}`,
    `Starts: ${yesNo(lead.starts)} · Stranded: ${yesNo(lead.stranded)}`,
    lead.callbackTime ? `Best time / notes: ${lead.callbackTime}` : null,
    `Came from: ${SOURCES[source]}`,
    '',
    'What the customer said:',
    (lead.details || 'Not provided').slice(0, 3000),
    '',
    `Lead ${id}`,
  ].filter(line => line !== null);
  return {title, text: lines.join('\n'), urgent};
}

// Minimal SMTP submission client (implicit TLS, AUTH PLAIN). Enough for Gmail with an app password.
export function createSmtpAdapter({host, port = 465, user, pass, from = user, to = DEFAULT_ALERT_EMAILS, connect}) {
  if (!host || !user || !pass || !to.length || to.some(address => !/^[^\s@<>]+@[^\s@<>]+$/.test(address))) throw Error('Invalid email alert configuration.');
  const open = connect || (() => tls.connect({host, port, servername: host}));
  return {
    name: 'email',
    async send({title, text}) {
      const socket = open();
      socket.setTimeout(20000);
      let buffer = '', waiting = null;
      const fail = err => { if (waiting) { const reject = waiting.reject; waiting = null; reject(err); } };
      socket.on('data', chunk => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split('\r\n');
        const last = lines.slice(0, -1).reverse().find(line => /^\d{3} /.test(line));
        if (last && waiting) { const {resolve} = waiting; waiting = null; buffer = ''; resolve(last); }
      });
      socket.on('error', fail); socket.on('timeout', () => { fail(Error('smtp_timeout')); socket.destroy(); });
      socket.on('close', () => fail(Error('smtp_closed')));
      const reply = expect => new Promise((resolve, reject) => { waiting = {resolve, reject}; }).then(line => {
        if (!line.startsWith(expect)) throw Object.assign(Error('smtp_rejected'), {detail: line.slice(0, 3)});
        return line;
      });
      const command = (line, expect) => { const answer = reply(expect); socket.write(line + '\r\n'); return answer; };
      try {
        await reply('220');
        await command(`EHLO ${os.hostname() || 'localhost'}`, '250');
        await command('AUTH PLAIN ' + Buffer.from(`\0${user}\0${pass}`).toString('base64'), '235');
        await command(`MAIL FROM:<${from}>`, '250');
        for (const address of to) await command(`RCPT TO:<${address}>`, '250');
        await command('DATA', '354');
        const subject = '=?UTF-8?B?' + Buffer.from(title).toString('base64') + '?=';
        const body = Buffer.from(text).toString('base64').replace(/.{1,76}/g, '$&\r\n');
        const message = [`From: Perfect Timing Website <${from}>`, `To: ${to.join(', ')}`, `Subject: ${subject}`, `Date: ${new Date().toUTCString()}`,
          'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', body].join('\r\n');
        await command(message + '\r\n.', '250');
        socket.end('QUIT\r\n');
        return {id: 'smtp'};
      } finally { socket.destroy(); }
    },
  };
}

// ntfy push: install the ntfy app on each phone/desktop and subscribe to the topic.
// The topic name is the only secret, so it must be long and random.
export function createNtfyAdapter({topic, server = 'https://ntfy.sh', fetchImpl = fetch}) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(topic || '')) throw Error('Invalid push alert topic.');
  return {
    name: 'push',
    async send({title, text, urgent, phone}) {
      const headers = {Title: title.replace(/[^\x20-\x7e]/g, '').trim() || 'New repair request', Priority: urgent ? 'urgent' : 'high', Tags: urgent ? 'rotating_light' : 'wrench'};
      if (phone) headers.Actions = `view, Call customer, tel:${phone.replace(/[^\d+]/g, '')}`;
      const response = await fetchImpl(`${server.replace(/\/$/, '')}/${topic}`, {method: 'POST', headers, body: text, signal: AbortSignal.timeout(10000)});
      if (!response.ok) throw Object.assign(Error('push_rejected'), {detail: String(response.status)});
      return {id: 'ntfy'};
    },
  };
}

// A text to Tony for every lead. Urgent leads already get a text and a call from urgent-alerts.mjs.
export function createSmsAdapter(twilio) {
  return {
    name: 'sms',
    skipUrgent: true,
    async send({text}) {
      const result = await twilio.send('notify_sms', {To: TONY_ALERT_NUMBER, From: twilio.fromNumber, Body: ('Perfect Timing website lead\n' + text).slice(0, 1500)});
      return {id: result.id};
    },
  };
}

// Windows toast on the laptop running the receiver. Needs the receiver to run in the signed-in session.
export function createDesktopAdapter({run = spawn} = {}) {
  if (process.platform !== 'win32' && !run.fake) throw Error('Desktop alerts need Windows.');
  return {
    name: 'desktop',
    send({title, text}) {
      const xml = s => s.replace(/[<>&"']/g, c => ({'<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;'}[c]));
      const toast = `<toast scenario="reminder"><visual><binding template="ToastGeneric"><text>${xml(title)}</text><text>${xml(text.slice(0, 600))}</text></binding></visual><actions><action content="Dismiss" arguments="dismiss" activationType="system"/></actions></toast>`;
      const script = [
        '[Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime]|Out-Null',
        '[Windows.Data.Xml.Dom.XmlDocument,Windows.Data.Xml.Dom.XmlDocument,ContentType=WindowsRuntime]|Out-Null',
        '$x=New-Object Windows.Data.Xml.Dom.XmlDocument',
        `$x.LoadXml([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(toast).toString('base64')}')))`,
        "$app='{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'",
        '[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show([Windows.UI.Notifications.ToastNotification]::new($x))',
      ].join(';');
      return new Promise((resolve, reject) => {
        const child = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {windowsHide: true, stdio: 'ignore'});
        const timer = setTimeout(() => { child.kill?.(); reject(Error('desktop_timeout')); }, 15000);
        child.on('error', () => { clearTimeout(timer); reject(Error('desktop_unavailable')); });
        child.on('exit', code => { clearTimeout(timer); code === 0 ? resolve({id: 'toast'}) : reject(Error('desktop_failed')); });
      });
    },
  };
}

// Builds the channel list from the environment. A channel whose settings are missing is simply off.
export function channelsFromEnv(env = process.env) {
  const channels = [], problems = [];
  const attempt = (label, build) => { try { const channel = build(); if (channel) channels.push(channel); } catch (err) { problems.push(`${label}: ${err.message}`); } };
  if (env.SMTP_USER && env.SMTP_PASS) attempt('email', () => createSmtpAdapter({host: env.SMTP_HOST || 'smtp.gmail.com', port: Number(env.SMTP_PORT || 465), user: env.SMTP_USER, pass: env.SMTP_PASS.replace(/\s+/g, ''), from: env.SMTP_FROM || env.SMTP_USER,
    to: (env.LEAD_ALERT_EMAILS || DEFAULT_ALERT_EMAILS.join(',')).split(',').map(s => s.trim()).filter(Boolean)}));
  if (env.NTFY_TOPIC) attempt('push', () => createNtfyAdapter({topic: env.NTFY_TOPIC, server: env.NTFY_SERVER || undefined}));
  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.LEAD_ALERT_FROM) attempt('sms', () => createSmsAdapter(createTwilioAlertAdapter({accountSid: env.TWILIO_ACCOUNT_SID, authToken: env.TWILIO_AUTH_TOKEN, fromNumber: env.LEAD_ALERT_FROM})));
  if (env.LEAD_DESKTOP_ALERTS !== 'false' && process.platform === 'win32') attempt('desktop', () => createDesktopAdapter());
  return {channels, problems};
}

export function createLeadNotifier(db, {channels = [], now = Date.now} = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS lead_notifications(lead_id TEXT NOT NULL,channel TEXT NOT NULL,state TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,
    message_json TEXT NOT NULL,next_attempt_ms INTEGER NOT NULL,last_error TEXT,updated_at TEXT NOT NULL,PRIMARY KEY(lead_id,channel));
    CREATE INDEX IF NOT EXISTS lead_notifications_due ON lead_notifications(state,next_attempt_ms);`);
  // A crash mid-send may or may not have delivered; one duplicate alert beats a missed lead.
  db.prepare("UPDATE lead_notifications SET state='pending' WHERE state='sending'").run();
  const byName = new Map(channels.map(channel => [channel.name, channel]));
  const stamp = () => new Date(now()).toISOString();
  let timer = null, busy = null, closing = false;

  function enqueue(lead, id, decision) {
    const message = {...summarize(lead, id, decision), phone: lead.phone};
    for (const channel of channels) {
      if (channel.skipUrgent && message.urgent && decision.actions.includes('notify_sms')) continue;
      db.prepare('INSERT OR IGNORE INTO lead_notifications(lead_id,channel,state,message_json,next_attempt_ms,updated_at) VALUES(?,?,?,?,?,?)').run(id, channel.name, 'pending', JSON.stringify(message), now(), stamp());
    }
  }
  async function run() {
    const rows = db.prepare("SELECT * FROM lead_notifications WHERE state='pending' AND next_attempt_ms<=? ORDER BY next_attempt_ms LIMIT 20").all(now());
    await Promise.all(rows.map(async row => {
      const channel = byName.get(row.channel);
      if (!channel || closing) return;
      db.prepare("UPDATE lead_notifications SET state='sending',attempts=attempts+1,updated_at=? WHERE lead_id=? AND channel=?").run(stamp(), row.lead_id, row.channel);
      try {
        await channel.send(JSON.parse(row.message_json));
        db.prepare("UPDATE lead_notifications SET state='sent',last_error=NULL,updated_at=? WHERE lead_id=? AND channel=?").run(stamp(), row.lead_id, row.channel);
      } catch (err) {
        const attempts = row.attempts + 1, done = attempts > DELAYS.length;
        const code = String(err.message || 'failed').slice(0, 40) + (err.detail ? ':' + String(err.detail).slice(0, 10) : '');
        db.prepare('UPDATE lead_notifications SET state=?,last_error=?,next_attempt_ms=?,updated_at=? WHERE lead_id=? AND channel=?').run(done ? 'failed' : 'pending', code, now() + DELAYS[Math.min(attempts - 1, DELAYS.length - 1)], stamp(), row.lead_id, row.channel);
        console.error(JSON.stringify({event: 'lead_notification_failed', channel: row.channel, code}));
      }
    }));
  }
  const tick = () => { if (busy) return busy; busy = run().finally(() => { busy = null; }); return busy; };
  return {
    enqueue, tick, channels: channels.map(channel => channel.name),
    inspect: id => db.prepare('SELECT channel,state,attempts,last_error,updated_at FROM lead_notifications WHERE lead_id=?').all(id),
    start() { if (channels.length && !timer) { timer = setInterval(() => { tick().catch(() => {}); }, 5000); timer.unref(); } },
    async close() { closing = true; clearInterval(timer); if (busy) await busy; },
  };
}
