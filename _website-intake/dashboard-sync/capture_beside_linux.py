"""Linux port of capture_beside.ps1: read the signed-in Beside web app with Playwright.

Same contract as the Windows UI Automation capture, so beside_refresh_runner.py and
run_sync.py keep working unchanged:

  python3 capture_beside_linux.py -Mode inventory -OutputPath P -SettingsPath S
  python3 capture_beside_linux.py -Mode thread -ConversationId prv_... -InventoryPath I -OutputPath P -SettingsPath S

writes `beside-uia-inventory/v1` / `beside-uia-thread/v1` JSON (nodes shaped like the UIA
nodes: role ControlType.Text / ControlType.Hyperlink / ControlType.Edit, name, value,
left/top/width/height, offscreen) and prints the same one-line status JSON.

Extra modes: --login (visible browser, sign in once), --keepalive (opt-in session check),
--service (systemd entry point: runner + failure alerts).

OFF BY DEFAULT: every capture mode refuses unless the private settings file has
"beside_linux_capture_enabled": true. Read-only: no sends, edits, deletions, cookie or
credential access. Opening an unread conversation may mark it read (same as Windows).

Selector provenance: the documented selectors come from scripts/beside-import
browser_readers.js (a[href*="/chats/prv_"], `time`, thread container) and from the names
capture_beside.ps1 already relies on (document title "Chats - ... - Beside",
"Filter chats: All", account heading / mailbox title). Anything marked TODO-verify is an
assumption about how those UIA names map onto the DOM and must be checked on the live app.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import time

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from beside_uia import CaptureError, conversation  # noqa: E402  (same validator as Windows)

APP = 'https://app.beside.com'
CHATS = APP + '/chats'
CHAT_URL = re.compile(r'^https://app\.beside\.com/chats/(prv_[A-Z0-9]{26})$')
CID = re.compile(r'^prv_[A-Z0-9]{26}$')
CHATS_TITLE = re.compile(r'^Chats - .+ - Beside$')  # same check as capture_beside.ps1
ALL_FILTER_NAME = 'Filter chats: All'               # same accessible name as capture_beside.ps1
DEFAULT_PROFILE = '~/.config/beside-chrome'
MAX_NODES = 2500
MAX_DEPTH = 45
# Low-memory flags for a 2 vCPU / ~1 GB VM.
CHROMIUM_ARGS = ['--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check',
                 '--disable-extensions', '--disable-background-networking', '--disable-sync',
                 '--renderer-process-limit=1', '--disable-gpu', '--disable-features=Translate,MediaRouter', '--js-flags=--max-old-space-size=256']

# Runs in the page. Walks the rendered DOM in document order (the same order UIA uses for a
# Chromium document) and emits UIA-shaped nodes. aria-hidden/hidden subtrees are skipped
# (UIA does not expose them); editors are recorded as "[editor excluded]" without content.
DOM_NODES_JS = r"""
({maxNodes, maxDepth}) => {
  const out = [];
  const vw = window.innerWidth, vh = window.innerHeight;
  const fin = v => Number.isFinite(v) ? v : null;
  const hidden = el => {
    if (el.getAttribute('aria-hidden') === 'true' || el.hidden) return true;
    const s = getComputedStyle(el);
    return s.display === 'none' || s.visibility === 'hidden';
  };
  const push = (el, parent, role, name, value) => {
    if (out.length >= maxNodes) throw new Error('Rendered capture exceeded bounds');
    const r = el.getBoundingClientRect();
    out.push({id: out.length, parent, role, name, value,
      left: fin(r.left), top: fin(r.top), width: fin(r.width), height: fin(r.height),
      offscreen: r.bottom < 0 || r.right < 0 || r.top > vh || r.left > vw || r.width === 0 || r.height === 0});
    return out.length - 1;
  };
  const ownText = el => Array.from(el.childNodes).filter(n => n.nodeType === 3)
    .map(n => n.textContent).join('').replace(/\s+/g, ' ').trim();
  const decorativeHeaderAvatar = el => {
    // The live contact header exposes its fallback initials as ordinary DOM text,
    // unlike UIA. Recognize the rendered avatar container, not arbitrary short text.
    const link = el.parentElement, row = link && link.parentElement;
    if (el.tagName !== 'SPAN' || !link || link.tagName !== 'A' || !link.hasAttribute('href') ||
        /\/chats\/prv_/.test(link.href) || !row || !['DIV', 'HEADER'].includes(row.tagName)) return false;
    const s = getComputedStyle(el), r = el.getBoundingClientRect(), header = row.getBoundingClientRect();
    if (s.flexShrink !== '0' || s.overflow !== 'hidden' || r.width < 16 || r.width > 64 ||
        Math.abs(r.width - r.height) > 1 || header.height < r.height || header.height > 96 ||
        r.top < header.top || r.bottom > header.bottom || !(parseFloat(getComputedStyle(row).borderBottomWidth) > 0))
      return false;
    const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
    return /^\p{L}{1,2}$/u.test(text) && Array.from(link.children).some(sibling =>
      sibling !== el && (sibling.innerText || '').trim() && sibling.getBoundingClientRect().width > 0);
  };
  const walk = (el, parent, depth) => {
    if (depth > maxDepth) throw new Error('Rendered capture exceeded bounds');
    if (hidden(el) || decorativeHeaderAvatar(el)) return;
    const tag = el.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEMPLATE') return;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable) {
      push(el, parent, 'ControlType.Edit', '[editor excluded]', null);
      return;
    }
    let id = parent;
    if (tag === 'A' && el.hasAttribute('href')) {
      const name = (el.getAttribute('aria-label') || el.innerText || '').replace(/\s+/g, ' ').trim();
      id = push(el, parent, 'ControlType.Hyperlink', name, el.href);
    } else {
      const text = ownText(el);
      if (text) id = push(el, parent, 'ControlType.Text', text, null);
    }
    for (const child of el.children) walk(child, id, depth + 1);
  };
  walk(document.body, -1, 0);
  return out;
}
"""

# Accessible-ish names used only for the account/mailbox/filter checks.
# TODO-verify: on Windows these come from UIA Names; on the web we read aria-label, title
# and short visible text. Confirm the account heading and mailbox title appear this way.
PAGE_NAMES_JS = r"""
() => {
  const names = new Set();
  for (const el of document.querySelectorAll('body *')) {
    for (const v of [el.getAttribute('aria-label'), el.getAttribute('title')]) if (v) names.add(v.trim());
    const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
    if (t && t.length <= 200) names.add(t);
  }
  return Array.from(names);
}
"""


class LinuxCaptureError(RuntimeError):
    pass


def stamp():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def load_settings(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def require_enabled(settings):
    if settings.get('beside_linux_capture_enabled') is not True:
        raise LinuxCaptureError('Linux Beside capture is disabled (beside_linux_capture_enabled is not true)')


def private_output(path, settings):
    private = Path(settings['private_archive_root']).expanduser().resolve()
    out = Path(path).expanduser().resolve()
    if not out.is_relative_to(private):
        raise LinuxCaptureError('Private output path required')
    if out.exists():
        raise LinuxCaptureError('Existing evidence must not be overwritten')
    return out


def write_create_only(path, value):
    data = json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False).encode()
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(data); stream.flush(); os.fsync(stream.fileno())


def observed_inventory_url(inventory_path, settings, cid):
    if not CID.fullmatch(cid or ''):
        raise LinuxCaptureError('Invalid conversation identity')
    private = Path(settings['private_archive_root']).expanduser().resolve()
    if not inventory_path or not Path(inventory_path).expanduser().resolve().is_relative_to(private):
        raise LinuxCaptureError('Private observed inventory required')
    inventory = load_settings(inventory_path)
    observed = [r for r in inventory.get('records', []) if r.get('conversation_id') == cid]
    if len(observed) != 1:
        raise LinuxCaptureError('Conversation not uniquely observed in inventory')
    if observed[0].get('url') != CHATS + '/' + cid:
        raise LinuxCaptureError('Unexpected observed conversation URL')
    return observed[0]


# ---------- pure functions (unit-tested without a browser) ----------

def account_visible(names, settings):
    """Same rule as capture_beside.ps1: some name ends with ' '+heading and some starts with mailbox+' '."""
    heading = settings.get('expected_account_heading') or ''
    mailbox = settings.get('expected_mailbox_title') or ''
    if not heading or not mailbox:
        return False
    return any(n.endswith(' ' + heading) for n in names) and any(n.startswith(mailbox + ' ') for n in names)


def inventory_records(nodes):
    records = []; seen = set()
    for node in nodes:
        if node.get('role') != 'ControlType.Hyperlink':
            continue
        match = CHAT_URL.fullmatch(node.get('value') or '')
        if not match:
            continue
        cid = match[1]
        if cid in seen:
            raise LinuxCaptureError('Duplicate visible conversation identity')
        seen.add(cid)
        records.append({'conversation_id': cid, 'url': node['value'], 'label': node.get('name') or ''})
    if not 1 <= len(records) <= 200:
        raise LinuxCaptureError('Visible inventory absent or exceeds bound')
    return records


def inventory_payload(nodes, title):
    return {'format': 'beside-uia-inventory/v1', 'captured_at': stamp(), 'title': title,
            'method': 'authorized_browser', 'complete': False, 'records': inventory_records(nodes)}


def thread_candidate(cid, url, label, samples):
    last = samples[-1]
    return {'format': 'beside-uia-thread/v1', 'identity_format': 'beside-uia-identity/v1',
            'conversation_id': cid, 'source_url': url, 'inventory_label': label,
            'observed_at': last['observed_at'], 'observed_url_before': last['observed_url_before'],
            'observed_url_after': last['observed_url_after'], 'title': last['title'], 'nodes': last['nodes'],
            'prior_samples': [samples[-3], samples[-2]],
            'coverage': {'complete': False, 'method': 'authorized_browser',
                         'scope': 'Three identity-matched stable rendered observations only; no older-history paging or recording downloads.'},
            'customer_messages_sent': False, 'capture_backend': 'linux-playwright'}


def identity_verified(candidate):
    """Same pure validator the PowerShell loop calls through `beside_uia.py --verify-stdin`."""
    raw = json.dumps(candidate, ensure_ascii=False).encode()
    try:
        conversation(candidate, hashlib.sha256(raw).hexdigest())
        return True
    except (CaptureError, ValueError, TypeError, KeyError, AttributeError):
        return False


def stable_thread(cid, url, label, observe, *, deadline_seconds=12, spacing=0.3, sleep=time.sleep, clock=time.monotonic):
    """Collect observations until three consecutive ones verify (same loop as the PS1)."""
    end = clock() + deadline_seconds; samples = []
    while clock() < end:
        sleep(spacing)
        try:
            sample = observe()
        except Exception:
            samples = []; continue
        if not sample:
            samples = []; continue
        samples = samples[-2:] + [sample]
        if len(samples) != 3:
            continue
        candidate = thread_candidate(cid, url, label, samples)
        if identity_verified(candidate):
            return candidate
    raise LinuxCaptureError('Selected conversation identity or stable content could not be verified')


# ---------- browser ----------

def profile_dir(settings):
    path = Path(settings.get('beside_linux_profile_dir') or DEFAULT_PROFILE).expanduser()
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    return path


def open_context(settings, *, headless):
    from playwright.sync_api import sync_playwright  # imported lazily: tests need no browser
    pw = sync_playwright().start()
    try:
        context = pw.chromium.launch_persistent_context(
            str(profile_dir(settings)), headless=headless, args=CHROMIUM_ARGS,
            viewport={'width': 1280, 'height': 900}, executable_path=settings.get('beside_linux_chromium') or None)
    except Exception:
        pw.stop(); raise
    return pw, context


def chats_page(context, settings):
    # Single tab: close any extra restored tabs to stay inside the 1 GB cap.
    page = context.pages[0] if context.pages else context.new_page()
    for extra in context.pages[1:]:
        extra.close()
    if not CHATS_TITLE.fullmatch(page.title() or ''):
        page.goto(CHATS, wait_until='domcontentloaded', timeout=15000)
    for _ in range(40):
        if CHATS_TITLE.fullmatch(page.title() or ''):
            break
        page.wait_for_timeout(250)
    else:
        raise LinuxCaptureError('Chats view did not become ready (signed out? run --login)')
    names = page.evaluate(PAGE_NAMES_JS)
    if not account_visible(names, settings):
        raise LinuxCaptureError('Expected signed-in Beside account/mailbox unavailable')
    # TODO-verify: UIA found an element *named* "Filter chats: All"; assumed here to be its aria-label.
    if ALL_FILTER_NAME not in names:
        raise LinuxCaptureError('Expected All-conversations filter unavailable')
    return page


def observe_page(page, url):
    before = page.url
    if before != url:
        return None
    title = page.title() or ''
    if not CHATS_TITLE.fullmatch(title):
        return None
    nodes = page.evaluate(DOM_NODES_JS, {'maxNodes': MAX_NODES, 'maxDepth': MAX_DEPTH})
    return {'observed_at': stamp(), 'observed_url_before': before, 'observed_url_after': page.url,
            'title': title, 'nodes': nodes}


def capture(mode, output, settings, *, cid=None, inventory_path=None):
    require_enabled(settings)
    out = private_output(output, settings)
    observed = observed_inventory_url(inventory_path, settings, cid) if mode == 'thread' else None
    pw, context = open_context(settings, headless=settings.get('beside_linux_headless', False) is True)
    try:
        page = chats_page(context, settings)
        if mode == 'inventory':
            nodes = page.evaluate(DOM_NODES_JS, {'maxNodes': MAX_NODES, 'maxDepth': MAX_DEPTH})
            payload = inventory_payload(nodes, page.title())
            write_create_only(out, payload)
            return {'ok': True, 'mode': mode, 'conversations_read': len(payload['records']), 'complete': False,
                    'customer_messages_sent': False}
        url = observed['url']
        # Documented selector (browser_readers.js): a[href*="/chats/prv_"]; exact match on the resolved href.
        links = [a for a in page.query_selector_all('a[href*="/chats/prv_"]') if a.evaluate('a => a.href') == url]
        if not links:
            raise LinuxCaptureError('Observed conversation link not currently present')
        links[0].click()  # opens the thread; may mark it read. No sends, edits or deletions.
        payload = stable_thread(cid, url, observed['label'], lambda: observe_page(page, url))
        write_create_only(out, payload)
        return {'ok': True, 'mode': mode, 'conversation_id': cid, 'captured_nodes': len(payload['nodes']),
                'identity_verified': True, 'stable_observations': 3, 'complete': False, 'customer_messages_sent': False}
    finally:
        context.close(); pw.stop()


def login(settings):
    """Visible browser on the persistent profile so Raj can sign in once. Nothing is captured."""
    pw, context = open_context(settings, headless=False)
    try:
        page = context.pages[0] if context.pages else context.new_page()
        page.goto(CHATS, wait_until='domcontentloaded', timeout=30000)
        print('Sign in to Beside in the opened window, then close the window to finish.', file=sys.stderr)
        while context.pages:
            try:
                context.pages[0].wait_for_timeout(1000)
            except Exception:
                break
    finally:
        try: context.close()
        except Exception: pass
        pw.stop()
    return {'ok': True, 'mode': 'login', 'profile': str(profile_dir(settings))}


def keepalive(settings):
    """Opt-in (beside_keepalive_enabled, as in #97): load Chats on the profile so the session stays warm."""
    if settings.get('beside_keepalive_enabled') is not True:
        return {'ok': True, 'enabled': False}
    require_enabled(settings)
    pw, context = open_context(settings, headless=settings.get('beside_linux_headless', False) is True)
    try:
        chats_page(context, settings)
        return {'ok': True, 'enabled': True, 'action': 'checked'}
    except LinuxCaptureError as exc:
        return {'ok': False, 'enabled': True, 'error': 'sign_in_needed' if 'signed' in str(exc).lower() else 'chats_unavailable'}
    finally:
        context.close(); pw.stop()


def service(settings_path):
    """systemd entry point: keep-alive check, the unchanged refresh runner, then failure alerts."""
    settings = load_settings(settings_path)
    if settings.get('beside_linux_capture_enabled') is not True:
        return {'ok': True, 'enabled': False}
    import beside_heartbeat_linux
    lock = beside_heartbeat_linux.capture_lock(settings)
    if lock is None:
        return {'ok': True, 'enabled': True, 'skipped': 'capture_already_running'}
    try:
        return _service_locked(settings_path, settings)
    finally:
        lock.close()


def _service_locked(settings_path, settings):
    os.environ['BESIDE_REFRESH_SETTINGS'] = str(Path(settings_path).resolve())
    import beside_refresh_runner
    status = {'checked_at': stamp(), 'keepalive': keepalive(settings)}
    status['beside_refresh'] = beside_refresh_runner.run(settings_path=Path(settings_path), budget_seconds=int(settings.get('beside_linux_budget_seconds', 150)))
    try:
        import beside_alerts
        sync_config = load_settings(settings['beside_alerts_config']) if settings.get('beside_alerts_config') else {}
        status['beside_alerts'] = beside_alerts.run(sync_config, status['beside_refresh'], Path(settings_path).parent)
    except Exception:
        status['beside_alerts'] = {'ok': False, 'error': 'beside_alerts_failed'}
    status['ok'] = bool(status['beside_refresh'].get('ok'))
    return status


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    # Same parameter names as capture_beside.ps1 so the runner passes identical arguments.
    parser.add_argument('-Mode', '--mode', choices=('inventory', 'thread'), default='inventory')
    parser.add_argument('-ConversationId', '--conversation-id')
    parser.add_argument('-OutputPath', '--output-path')
    parser.add_argument('-InventoryPath', '--inventory-path')
    parser.add_argument('-SettingsPath', '--settings-path', required=True)
    parser.add_argument('-PythonExecutable', '--python-executable', help='Accepted for parity with the PS1; unused.')
    parser.add_argument('--login', action='store_true')
    parser.add_argument('--keepalive', action='store_true')
    parser.add_argument('--service', action='store_true')
    args = parser.parse_args(argv)
    try:
        if args.service:
            result = service(args.settings_path)
        else:
            settings = load_settings(args.settings_path)
            if args.login:
                result = login(settings)
            elif args.keepalive:
                result = keepalive(settings)
            else:
                if not args.output_path:
                    raise LinuxCaptureError('OutputPath required')
                result = capture(args.mode, args.output_path, settings, cid=args.conversation_id, inventory_path=args.inventory_path)
    except Exception as exc:
        # Never print captured content or private paths; first line only, bounded.
        msg = str(exc).splitlines()[0][:180] if isinstance(exc, LinuxCaptureError) else type(exc).__name__
        print(msg, file=sys.stderr)
        return 1
    print(json.dumps(result, separators=(',', ':')))
    return 0 if result.get('ok') else 1


if __name__ == '__main__':
    raise SystemExit(main())
