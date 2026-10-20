"""Optional: POST verified Beside conversations to the intake hook /hooks/lead/beside/<token>.

Off unless refresh settings have beside_intake_post_enabled = true and beside_intake_hook_url.
Only conversations new to the dashboard baseline are posted, once each (tracked locally), with
event_id = the Beside prv_ id so the intake's own event dedupe makes replays harmless.
Failures are reported, never fatal, and never retried inside the same run.
"""
from __future__ import annotations
import json
from pathlib import Path
import re
from urllib import error, request
from urllib.parse import urlsplit

HOOK_PATH = re.compile(r'^/hooks/lead/beside/[^/?#%\s]{24,256}$')


def hook_url(settings):
    if settings.get('beside_intake_post_enabled') is not True:
        return None
    url = settings.get('beside_intake_hook_url')
    parts = urlsplit(url) if isinstance(url, str) else None
    if not parts or parts.scheme != 'https' or not parts.netloc or not HOOK_PATH.match(parts.path) or parts.query or parts.fragment:
        raise ValueError('invalid_intake_hook_url')
    return url


def event(item):
    kind = item.get('source')
    payload = {'source': 'beside', 'event_id': item['id'], 'direction': 'inbound',
               'type': 'text' if kind == 'beside_text' else 'call',
               'name': item.get('name') if item.get('name') and item.get('name') != 'Name not provided' else 'Beside caller',
               'phone': item.get('phone') or '', 'vehicle': item.get('vehicle') or '',
               'summary': (item.get('concern') or '')[:6000]}
    if item.get('received_at'):
        payload['occurred_at'] = item['received_at']
    return payload


def post_new(items, known_ids, settings, state_path, opener=None):
    url = hook_url(settings)
    if url is None:
        return {'enabled': False}
    state_path = Path(state_path)
    state = json.loads(state_path.read_text(encoding='utf-8')) if state_path.exists() else {'posted': {}}
    opener = opener or request.build_opener(request.ProxyHandler({}))
    posted = duplicate = failed = 0
    for item in items:
        cid = item['id']
        if ('beside:chat:' + cid) in known_ids or cid in state['posted']:
            continue
        req = request.Request(url, data=json.dumps(event(item)).encode('utf-8'), method='POST',
                              headers={'Content-Type': 'application/json', 'Accept': 'application/json'})
        try:
            with opener.open(req, timeout=10) as response:
                body = json.loads(response.read(100_000) or b'{}')
                ok = 200 <= response.status < 300 and body.get('ok') is True
        except error.HTTPError as exc:
            ok = exc.code == 409  # same event id already recorded with other contents: do not replay
            duplicate += ok
        except (error.URLError, TimeoutError, OSError, ValueError):
            ok = False
        if ok:
            state['posted'][cid] = item.get('received_at') or True
            posted += 1
        else:
            failed += 1
    temp = state_path.with_name(state_path.name + '.tmp')
    temp.write_text(json.dumps(state, indent=2), encoding='utf-8'); temp.replace(state_path)
    return {'enabled': True, 'posted': posted, 'conflicts': duplicate, 'failed': failed}
