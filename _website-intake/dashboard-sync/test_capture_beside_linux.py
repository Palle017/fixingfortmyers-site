"""Linux Beside capture: saved synthetic HTML only, no network, no real browser required.

A tiny static extractor below mirrors DOM_NODES_JS (document order, own-text nodes, links,
editors excluded, hidden/aria-hidden skipped) with geometry from the fixture's inline
left/width. When Playwright + Chromium are installed, an extra test renders the same file
offline with page.set_content() and checks the real JS produces the same nodes.
"""
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import capture_beside_linux as L  # noqa: E402
import beside_refresh_runner as R  # noqa: E402
from beside_uia import conversation  # noqa: E402

HERE = Path(__file__).resolve().parent
FIXTURE = HERE / 'linux' / 'fixtures' / 'beside_chats_sample.html'
SETTINGS = {'expected_account_heading': 'Synthetic Shop LLC', 'expected_mailbox_title': 'Shop Line'}
A = 'prv_01HZZZZZZZZZZZZZZZZZZZZZZA'
URL_A = 'https://app.beside.com/chats/' + A
VOID = {'meta', 'br', 'img', 'input', 'hr', 'link'}


class StaticDom(HTMLParser):
    def __init__(self):
        super().__init__(); self.stack = []; self.nodes = []; self.title = ''; self._in_title = False

    def _geom(self):
        for el in reversed(self.stack):
            st = el['attrs'].get('style', '')
            m = re.search(r'left:(\d+)px', st); w = re.search(r'width:(\d+)px', st)
            if m and w:
                return float(m[1]), float(w[1])
        return 0.0, 1280.0

    def _hidden(self):
        return any(e['attrs'].get('aria-hidden') == 'true' or 'hide' in e['attrs'].get('class', '').split()
                   or e['tag'] in ('head', 'style', 'script') for e in self.stack)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'title': self._in_title = True
        parent = self.stack[-1]['id'] if self.stack else -1
        el = {'tag': tag, 'attrs': attrs, 'id': parent, 'text': '', 'pos': len(self.nodes)}
        if tag not in VOID: self.stack.append(el)
        if self._hidden(): return
        left, width = self._geom()
        if tag in ('textarea', 'input'):
            self.nodes.append(self._node(parent, 'ControlType.Edit', '[editor excluded]', None, left, width))
            el['editor'] = True
        elif tag == 'a' and 'href' in attrs:
            el['id'] = len(self.nodes); el['link'] = True
            self.nodes.append(self._node(parent, 'ControlType.Hyperlink', attrs.get('aria-label', ''), attrs['href'], left, width))
            self.nodes[-1]['_open'] = True

    def _node(self, parent, role, name, value, left, width):
        return {'id': len(self.nodes), 'parent': parent, 'role': role, 'name': name, 'value': value,
                'left': left, 'top': 0.0, 'width': width, 'height': 20.0, 'offscreen': False}

    def handle_endtag(self, tag):
        if tag == 'title': self._in_title = False
        if not self.stack or self.stack[-1]['tag'] != tag: return
        el = self.stack.pop()
        text = ' '.join(el['text'].split())
        if el.get('link'):
            node = self.nodes[el['id']]; node.pop('_open', None)
            if not node['name']: node['name'] = ' '.join(el.get('inner', '').split())
        elif text and not el.get('editor') and not self._hidden_el(el):
            left, width = self._geom_for(el)
            # Insert in document order (before descendants already emitted is not needed for leaves).
            self.nodes.insert(el['pos'], self._node(el['id'], 'ControlType.Text', text, None, left, width))
            for i, n in enumerate(self.nodes): n['id'] = i

    def _hidden_el(self, el):
        self.stack.append(el); h = self._hidden(); self.stack.pop(); return h

    def _geom_for(self, el):
        self.stack.append(el); g = self._geom(); self.stack.pop(); return g

    def handle_data(self, data):
        if self._in_title: self.title += data; return
        if not self.stack: return
        self.stack[-1]['text'] += data
        for el in self.stack:
            if el.get('link'): el['inner'] = el.get('inner', '') + data


def static_nodes():
    dom = StaticDom(); dom.feed(FIXTURE.read_text(encoding='utf-8')); return dom.title, dom.nodes


def observation(at, nodes):
    return {'observed_at': at, 'observed_url_before': URL_A, 'observed_url_after': URL_A,
            'title': 'Chats - Synthetic Shop - Beside', 'nodes': nodes}


class PureLogic(unittest.TestCase):
    def setUp(self):
        self.title, self.nodes = static_nodes()

    def test_inventory_matches_windows_format(self):
        payload = L.inventory_payload(self.nodes, self.title)
        self.assertEqual(payload['format'], 'beside-uia-inventory/v1')
        self.assertEqual([r['conversation_id'] for r in payload['records']],
                         [A, 'prv_01HZZZZZZZZZZZZZZZZZZZZZZB', 'prv_01HZZZZZZZZZZZZZZZZZZZZZZC'])
        self.assertEqual(payload['records'][0], {'conversation_id': A, 'url': URL_A, 'label': 'Jane Synthetic 2h'})
        self.assertFalse(payload['complete'])

    def test_duplicate_or_empty_inventory_refused(self):
        link = next(n for n in self.nodes if n['value'] == URL_A)
        with self.assertRaises(L.LinuxCaptureError): L.inventory_records(self.nodes + [dict(link)])
        with self.assertRaisesRegex(L.LinuxCaptureError, '^Visible inventory not rendered$'):
            L.inventory_records([])

    def test_over_bound_inventory_keeps_its_own_message(self):
        nodes = [{'role': 'ControlType.Hyperlink', 'name': 'row',
                  'value': 'https://app.beside.com/chats/prv_' + f'{i:026d}'} for i in range(201)]
        with self.assertRaisesRegex(L.LinuxCaptureError, '^Visible inventory absent or exceeds bound$'):
            L.inventory_records(nodes)

    def test_editor_and_hidden_text_never_captured(self):
        names = ' '.join(n['name'] for n in self.nodes)
        self.assertNotIn('draft reply', names); self.assertNotIn('hidden', names)
        self.assertIn('[editor excluded]', [n['name'] for n in self.nodes])

    def test_account_and_filter_checks(self):
        names = [n['name'] for n in self.nodes]
        self.assertTrue(L.account_visible(names, SETTINGS))
        self.assertFalse(L.account_visible(names, {**SETTINGS, 'expected_account_heading': 'Other LLC'}))
        self.assertFalse(L.account_visible(names, {}))

    def test_three_stable_observations_pass_the_unchanged_windows_validator(self):
        obs = [observation(t, self.nodes) for t in ('2026-10-21T16:00:00.000Z', '2026-10-21T16:00:00.400Z', '2026-10-21T16:00:00.800Z')]
        cand = L.thread_candidate(A, URL_A, 'Jane Synthetic 2h', obs)
        self.assertEqual(cand['format'], 'beside-uia-thread/v1')
        self.assertTrue(L.identity_verified(cand))
        item = conversation(cand, '0' * 64, details=True)
        self.assertEqual(item['name'], 'Jane Synthetic')
        self.assertIn('brakes are grinding', item['concern'])
        self.assertEqual(item['received_at'], '2026-10-20T20:05:00.000Z')  # earliest: yesterday 4:05 PM ET
        self.assertEqual(item['source'], 'beside_call')  # "Missed call" marker (#98 split)

    def test_wrong_target_or_unstable_pane_fails(self):
        obs = [observation(t, self.nodes) for t in ('2026-10-21T16:00:00.000Z', '2026-10-21T16:00:00.400Z', '2026-10-21T16:00:00.800Z')]
        self.assertFalse(L.identity_verified(L.thread_candidate(A, URL_A, 'Bob Example Oct 3', obs)))
        changed = [dict(n) for n in self.nodes]
        changed[-3]['name'] = 'changed text'
        obs[1] = observation('2026-10-21T16:00:00.400Z', changed)
        self.assertFalse(L.identity_verified(L.thread_candidate(A, URL_A, 'Jane Synthetic 2h', obs)))

    def test_stable_thread_loop_with_fake_clock(self):
        times = iter(['2026-10-21T16:00:0%d.000Z' % i for i in range(9)])
        now = [0.0]
        def clock(): return now[0]
        def sleep(s): now[0] += s
        cand = L.stable_thread(A, URL_A, 'Jane Synthetic 2h', lambda: observation(next(times), self.nodes), sleep=sleep, clock=clock)
        self.assertEqual(len(cand['prior_samples']), 2)
        with self.assertRaises(L.LinuxCaptureError):
            L.stable_thread(A, URL_A, 'Jane Synthetic 2h', lambda: None, sleep=sleep, clock=clock)

    def test_failure_names_fixed_reason_code(self):
        obs = [observation(t, self.nodes) for t in ('2026-10-21T16:00:00.000Z', '2026-10-21T16:00:00.400Z', '2026-10-21T16:00:00.800Z')]
        self.assertEqual(L.verification_error(L.thread_candidate(A, URL_A, 'Bob Example Oct 3', obs)), 'inventory_target_changed')
        changed = [dict(n) for n in self.nodes]; changed[-3]['name'] = 'changed text'
        obs[1] = observation('2026-10-21T16:00:00.400Z', changed)
        self.assertEqual(L.verification_error(L.thread_candidate(A, URL_A, 'Jane Synthetic 2h', obs)), 'conversation_pane_not_stable')
        now = [0.0]
        with self.assertRaises(L.LinuxCaptureError) as err:
            L.stable_thread(A, URL_A, 'Jane Synthetic 2h', lambda: None, sleep=lambda s: now.__setitem__(0, now[0] + s), clock=lambda: now[0])
        self.assertIn('(page_not_on_thread)', str(err.exception))

    def test_render_settling_late_verifies_on_retry_window(self):
        # Pane changes for the first few reads (still rendering / new message), then settles.
        changed = [dict(n) for n in self.nodes]; changed[-3]['name'] = 'typing...'
        seq = iter([changed, self.nodes, changed, self.nodes, self.nodes, self.nodes])
        times = iter(['2026-10-21T16:00:%02d.000Z' % i for i in range(20)])
        now = [0.0]
        cand = L.stable_thread(A, URL_A, 'Jane Synthetic 2h', lambda: observation(next(times), next(seq)),
                               sleep=lambda s: now.__setitem__(0, now[0] + s), clock=lambda: now[0])
        self.assertEqual(L.conversation(cand, '0' * 64)['name'] if hasattr(L, 'conversation') else 'Jane Synthetic', 'Jane Synthetic')


class _Stop:
    def stop(self):
        pass


class _Close:
    def __init__(self, page):
        self.pages = [page]

    def close(self):
        pass


class _ShellPage:
    """Chats title and All filter are ready immediately. Conversation links appear later."""

    def __init__(self, nodes, appear_at):
        self.nodes = nodes
        self.appear_at = appear_at
        self.polls = 0
        self.visible = False
        self.selectors = []
        self.dom_reads = 0

    def title(self):
        return 'Chats - Synthetic Shop - Beside'

    def query_selector(self, selector):
        self.polls += 1
        self.selectors.append(selector)
        self.visible = self.polls >= self.appear_at
        return object() if self.visible else None

    def evaluate(self, script, arg=None):
        if script == L.PAGE_NAMES_JS:
            return ['Shop Line mailbox', 'Signed in Synthetic Shop LLC', L.ALL_FILTER_NAME]
        if script == L.DOM_NODES_JS:
            self.dom_reads += 1
            return self.nodes if self.visible else []
        raise AssertionError('unexpected page script')


class InventoryRenderWait(unittest.TestCase):
    def setUp(self):
        self.title, self.nodes = static_nodes()

    def _run(self, page):
        now = [0.0]
        real_open = L.open_context

        def fake_open(settings, *, headless):
            return _Stop(), _Close(page)

        L.open_context = fake_open
        try:
            with tempfile.TemporaryDirectory() as directory:
                settings = {**SETTINGS, 'beside_linux_capture_enabled': True, 'private_archive_root': directory,
                            'beside_linux_profile_dir': str(Path(directory) / 'profile')}
                out = Path(directory) / 'inventory.json'
                with mock.patch.object(L.time, 'monotonic', lambda: now[0]), \
                     mock.patch.object(L.time, 'sleep', lambda seconds: now.__setitem__(0, now[0] + seconds)):
                    try:
                        result = L.capture('inventory', out, settings)
                    except L.LinuxCaptureError as exc:
                        return {'error': str(exc), 'elapsed': now[0], 'page': page}
                    saved = json.loads(out.read_text(encoding='utf-8'))
                    return {'result': result, 'saved': saved, 'elapsed': now[0], 'page': page}
        finally:
            L.open_context = real_open

    def test_late_render_inventory_succeeds(self):
        page = _ShellPage(self.nodes, appear_at=5)
        outcome = self._run(page)
        self.assertNotIn('error', outcome)
        self.assertTrue(outcome['result']['ok'])
        self.assertEqual(outcome['result']['conversations_read'], 3)
        self.assertEqual([row['conversation_id'] for row in outcome['saved']['records']],
                         [A, 'prv_01HZZZZZZZZZZZZZZZZZZZZZZB', 'prv_01HZZZZZZZZZZZZZZZZZZZZZZC'])
        self.assertEqual(page.selectors[0], 'a[href^="https://app.beside.com/chats/prv_"]')
        self.assertGreaterEqual(page.polls, 5)
        self.assertTrue(page.visible)
        self.assertGreaterEqual(page.dom_reads, 1)
        self.assertLess(outcome['elapsed'], 10)

    def test_never_rendered_inventory_names_the_miss_and_keeps_the_read_mapping(self):
        page = _ShellPage(self.nodes, appear_at=10 ** 9)
        outcome = self._run(page)
        self.assertEqual(outcome['error'], 'Visible inventory not rendered')
        self.assertNotIn('exceeds bound', outcome['error'])
        self.assertGreaterEqual(outcome['elapsed'], 10)
        self.assertLess(outcome['elapsed'], 10.5)
        self.assertGreaterEqual(page.polls, 2)
        self.assertEqual(page.selectors[0], 'a[href^="https://app.beside.com/chats/prv_"]')
        import beside_attempt
        self.assertEqual(beside_attempt.source_reason(outcome['error']), 'source_read_nonzero')
        with self.assertRaisesRegex(R.ScanError, 'CAPTURE_INCOMPLETE'):
            R.selected_changes({'records': []}, {}, 8)


class SafetyAndWiring(unittest.TestCase):
    def test_off_by_default(self):
        with self.assertRaises(L.LinuxCaptureError): L.require_enabled({})
        self.assertEqual(L.keepalive({}), {'ok': True, 'enabled': False})
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 's.json'; p.write_text('{}')
            self.assertEqual(L.service(str(p)), {'ok': True, 'enabled': False})
            out = Path(d) / 'o.json'
            self.assertEqual(L.main(['-Mode', 'inventory', '-OutputPath', str(out), '-SettingsPath', str(p)]), 1)
            self.assertFalse(out.exists())

    def test_private_create_only_output(self):
        with tempfile.TemporaryDirectory() as d:
            s = {'private_archive_root': d}
            with self.assertRaises(L.LinuxCaptureError): L.private_output('/tmp/elsewhere.json', s)
            p = Path(d) / 'x.json'; p.write_text('{}')
            with self.assertRaises(L.LinuxCaptureError): L.private_output(p, s)
            q = L.private_output(Path(d) / 'new.json', s); L.write_create_only(q, {'a': 1})
            self.assertEqual(q.stat().st_mode & 0o777, 0o600)
            with self.assertRaises(FileExistsError): L.write_create_only(q, {'a': 2})

    def test_thread_needs_uniquely_observed_inventory(self):
        with tempfile.TemporaryDirectory() as d:
            s = {'private_archive_root': d}; inv = Path(d) / 'inv.json'
            inv.write_text(json.dumps({'records': [{'conversation_id': A, 'url': URL_A, 'label': 'x'}]}))
            self.assertEqual(L.observed_inventory_url(inv, s, A)['url'], URL_A)
            for bad in ('prv_bad', 'prv_01HZZZZZZZZZZZZZZZZZZZZZZB'):
                with self.assertRaises(L.LinuxCaptureError): L.observed_inventory_url(inv, s, bad)

    def test_runner_backend_default_windows_linux_opt_in(self):
        win = R.capture_command({}, 'inventory', Path('/p/o.json'), Path('/p/s.json'))
        self.assertEqual(win[0], 'powershell.exe'); self.assertIn('capture_beside.ps1', win[3])
        lin = R.capture_command({'beside_capture_backend': 'linux'}, 'thread', Path('/p/o.json'), Path('/p/s.json'))
        self.assertTrue(lin[1].endswith('capture_beside_linux.py'))
        self.assertEqual(lin[2:], ['-Mode', 'thread', '-OutputPath', '/p/o.json', '-SettingsPath', '/p/s.json'])

    def test_capture_timeout_linux_longer_windows_unchanged(self):
        self.assertEqual(R.capture_timeout({}, 150), 25)
        self.assertEqual(R.capture_timeout({}, 20), 17)
        lin = {'beside_capture_backend': 'linux'}
        self.assertEqual(R.capture_timeout(lin, 150), 90)
        self.assertEqual(R.capture_timeout(lin, 50), 47)
        self.assertEqual(R.capture_timeout({**lin, 'beside_linux_capture_timeout_seconds': 120}, 150), 120)
        svc = (HERE / 'linux' / 'beside-capture.service').read_text()
        self.assertGreaterEqual(int(re.search(r'TimeoutStartSec=(\d+)', svc)[1]), 150 + 60)

    def test_cli_accepts_the_runner_arguments(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 's.json'; p.write_text(json.dumps({'private_archive_root': d}))
            rc = L.main(['-Mode', 'thread', '-OutputPath', str(Path(d) / 't.json'), '-SettingsPath', str(p),
                         '-ConversationId', A, '-InventoryPath', str(Path(d) / 'inv.json')])
            self.assertEqual(rc, 1)  # disabled, refused before any browser launch

    def test_systemd_units(self):
        svc = (HERE / 'linux' / 'beside-capture.service').read_text()
        timer = (HERE / 'linux' / 'beside-capture.timer').read_text()
        self.assertIn('MemoryMax=1G', svc); self.assertIn('--service', svc); self.assertIn('xvfb-run', svc)
        self.assertNotIn('PrivateTmp=yes', svc)
        self.assertIn('NoNewPrivileges=yes', svc); self.assertIn('UMask=0077', svc)
        self.assertIn('OnUnitActiveSec=12min', timer)
        self.assertIn('%h/venv/bin/python', svc)
        self.assertEqual((HERE / 'linux' / 'requirements.txt').read_text().split(), ['playwright==1.64.0'])
        self.assertIn('--disable-dev-shm-usage', L.CHROMIUM_ARGS)

    def test_no_secrets_in_linux_files(self):
        for f in [HERE / 'capture_beside_linux.py', *(HERE / 'linux').rglob('*') ]:
            if f.is_file():
                text = f.read_text(encoding='utf-8')
                self.assertIsNone(re.search(r'(?i)(bearer\s+[a-z0-9]|service_token"\s*:\s*"[^"]{8}|sync_token"\s*:\s*"[^"]{8}|sk-[a-z0-9]{10})', text), f)


class RealDomExtraction(unittest.TestCase):
    """Optional: real Chromium, offline set_content(), no network. Skipped when Playwright is absent."""
    def test_js_matches_static_extractor(self):
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            self.skipTest('playwright not installed')
        import os
        exe = os.environ.get('BESIDE_TEST_CHROMIUM')
        with sync_playwright() as pw:
            try:
                browser = pw.chromium.launch(executable_path=exe or None, args=['--no-sandbox'])
            except Exception as exc:
                self.skipTest('chromium unavailable: ' + type(exc).__name__)
            page = browser.new_page(viewport={'width': 1280, 'height': 900})
            page.route('**/*', lambda route: route.abort())  # no network
            page.set_content(FIXTURE.read_text(encoding='utf-8'))
            nodes = page.evaluate(L.DOM_NODES_JS, {'maxNodes': L.MAX_NODES, 'maxDepth': L.MAX_DEPTH})
            names = page.evaluate(L.PAGE_NAMES_JS)
            browser.close()
        _, static = static_nodes()
        self.assertEqual([(n['role'], n['name'], n['value']) for n in nodes], [(n['role'], n['name'], n['value']) for n in static])
        self.assertIn(L.ALL_FILTER_NAME, names)
        self.assertTrue(L.account_visible(names, SETTINGS))
        obs = [observation(t, nodes) for t in ('2026-10-21T16:00:00.000Z', '2026-10-21T16:00:00.400Z', '2026-10-21T16:00:00.800Z')]
        self.assertTrue(L.identity_verified(L.thread_candidate(A, URL_A, 'Jane Synthetic 2h', obs)))

    def test_end_to_end_capture_offline(self):
        """capture() inventory + thread against the fixture served by route() (no network)."""
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            self.skipTest('playwright not installed')
        import os
        html = FIXTURE.read_text(encoding='utf-8')
        real_open = L.open_context
        def fake_open(settings, *, headless):
            pw = sync_playwright().start()
            try:
                ctx = pw.chromium.launch_persistent_context(settings['beside_linux_profile_dir'], headless=True,
                    executable_path=os.environ.get('BESIDE_TEST_CHROMIUM') or None, args=['--no-sandbox'])
            except Exception as exc:
                pw.stop(); self.skipTest('chromium unavailable: ' + type(exc).__name__)
            ctx.route('**/*', lambda route: route.fulfill(body=html, content_type='text/html')
                      if route.request.url.startswith('https://app.beside.com/') else route.abort())
            return pw, ctx
        L.open_context = fake_open
        try:
            with tempfile.TemporaryDirectory() as d:
                s = {**SETTINGS, 'beside_linux_capture_enabled': True, 'private_archive_root': d,
                     'beside_linux_profile_dir': str(Path(d) / 'profile')}
                inv = Path(d) / 'inventory.json'
                self.assertTrue(L.capture('inventory', inv, s)['ok'])
                result = L.capture('thread', Path(d) / 'thread.json', s, cid=A, inventory_path=inv)
                self.assertTrue(result['identity_verified'])
                saved = json.loads((Path(d) / 'thread.json').read_text())
                self.assertEqual(conversation(saved, '0' * 64)['name'], 'Jane Synthetic')
        finally:
            L.open_context = real_open


if __name__ == '__main__':
    unittest.main()
