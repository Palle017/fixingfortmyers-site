// Reference Node runtime qualification only. This is not the separately hosted Bay One export.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createLeadServers} from '../../_website-intake/server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const PURPOSE = 'bayone-vm101-synthetic-staging-v1';
export const MARKER = '.bayone-staging.json';

function port(value, fallback) {
  const text = String(value ?? fallback);
  if (!/^\d+$/.test(text)) throw Error('Invalid staging port');
  const number = Number(text);
  if (number !== 0 && (number < 1024 || number > 65535)) throw Error('Invalid staging port');
  return number;
}

export function readConfig(env = process.env) {
  if (!env.BAYONE_STAGE_DATA_DIR || !path.isAbsolute(env.BAYONE_STAGE_DATA_DIR)) {
    throw Error('BAYONE_STAGE_DATA_DIR must name a separate absolute staging directory');
  }
  const dataDir = path.resolve(env.BAYONE_STAGE_DATA_DIR);
  if (dataDir === ROOT || dataDir.startsWith(ROOT + path.sep) || dataDir === path.parse(dataDir).root) {
    throw Error('Staging data must be outside the source checkout');
  }
  const model = env.BAYONE_STAGE_MODEL || 'disabled';
  if (!['disabled', 'ollama'].includes(model)) throw Error('Unsupported staging model mode');
  const modelUrl = new URL(env.BAYONE_STAGE_OLLAMA_URL || 'http://127.0.0.1:11434');
  if (modelUrl.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(modelUrl.hostname) ||
      modelUrl.username || modelUrl.password || modelUrl.search || modelUrl.hash || modelUrl.pathname !== '/') {
    throw Error('Staging inference must use a literal loopback HTTP endpoint or SSH tunnel');
  }
  const modelName = env.BAYONE_STAGE_OLLAMA_MODEL || '';
  if (model === 'ollama' && (!modelName || modelName.length > 160 || /[\r\n]/.test(modelName))) {
    throw Error('Select an already installed Ollama model explicitly');
  }
  const publicPort = port(env.BAYONE_STAGE_PUBLIC_PORT, 28795);
  const adminPort = port(env.BAYONE_STAGE_INBOX_PORT, 28798);
  if (publicPort !== 0 && publicPort === adminPort) throw Error('Staging ports must differ');
  return {dataDir, model, modelUrl: modelUrl.origin, modelName, publicPort, adminPort};
}

export function ensureStagingData(dataDir) {
  fs.mkdirSync(dataDir, {recursive: true, mode: 0o700});
  if (fs.lstatSync(dataDir).isSymbolicLink() || fs.realpathSync(dataDir) !== dataDir) {
    throw Error('Staging data directory must not resolve through a symlink');
  }
  const marker = path.join(dataDir, MARKER);
  if (fs.existsSync(marker)) {
    if (fs.lstatSync(marker).isSymbolicLink()) throw Error('Unrecognized staging marker');
    const identity = JSON.parse(fs.readFileSync(marker, 'utf8'));
    if (identity.purpose !== PURPOSE || identity.syntheticOnly !== true) {
      throw Error('Unrecognized staging marker');
    }
  } else {
    // Never open an old customer DB: the reference runtime performs retention cleanup at startup.
    if (fs.readdirSync(dataDir).length) throw Error('Refusing unmarked, nonempty data directory');
    fs.writeFileSync(marker, JSON.stringify({purpose: PURPOSE, syntheticOnly: true}) + '\n', {flag: 'wx', mode: 0o600});
  }
  function inspect(directory) {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      if (entry.isSymbolicLink()) throw Error('Staging state must not contain symlinks');
      if (entry.isDirectory()) inspect(path.join(directory, entry.name));
      else if (!entry.isFile()) throw Error('Unexpected staging state entry');
    }
  }
  inspect(dataDir);
  fs.chmodSync(dataDir, 0o700);
}

export async function startStaging(config = readConfig()) {
  ensureStagingData(config.dataDir);
  // The Bay One chat was retired on 2026-10-19; the receiver no longer runs any model, so the
  // validated model settings are accepted for compatibility but unused.
  // Explicit factory options prevent any inherited notification, Beside, Zoho, or provider credentials
  // from activating production integrations. No public website origin is accepted.
  const app = createLeadServers({
    dataDir: config.dataDir,
    origins: [`http://127.0.0.1:${config.publicPort || 28795}`, `http://localhost:${config.publicPort || 28795}`],
    besideToken: '', operatorToken: '',
    alerts: {enabled: false}, notifyChannels: [], customerTextAdapter: null,
    zohoReader: null, deskDigest: null, alertWorker: false,
  });
  app.publicServer.prependListener('request', (_request, response) => response.setHeader('X-BayOne-Staging', PURPOSE));
  let ports;
  try { ports = await app.start(config.publicPort, config.adminPort); }
  catch (error) { await app.close(); throw error; }
  return {app, ports, config};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.umask(0o077);
  let active, closing = false;
  async function stop() {
    if (closing) return;
    closing = true;
    const deadline = setTimeout(() => process.exit(1), 12000);
    deadline.unref();
    if (active) await active.app.close();
    process.exit(0);
  }
  try {
    active = await startStaging();
    console.log(JSON.stringify({event: 'vm101_staging_ready', purpose: PURPOSE, model: active.config.model,
      publicAddress: '127.0.0.1', inboxAddress: '127.0.0.1', ...active.ports}));
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
  } catch (error) {
    console.error(JSON.stringify({event: 'vm101_staging_start_failed', error: error.message}));
    process.exitCode = 1;
  }
}
