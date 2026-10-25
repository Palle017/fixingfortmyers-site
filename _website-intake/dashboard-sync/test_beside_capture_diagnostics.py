"""Synthetic failures only. Never starts a browser or contacts a provider."""
import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock
from types import SimpleNamespace
from urllib.parse import urljoin
import beside_capture_diagnostics as D
import beside_attempt as A
import capture_beside_linux as L

SECRET = 'synthetic-secret /private/profile https://invalid.test/?token=synthetic-secret'


class Diagnostics(unittest.TestCase):
    def test_original_exception_is_chained_but_only_fixed_code_is_serialized(self):
        cases = [
            ('launch', FileNotFoundError(SECRET), 'browser_executable_missing'),
            ('launch', RuntimeError('Missing X server or $DISPLAY '+SECRET), 'browser_display_unavailable'),
            ('launch', RuntimeError('ProcessSingleton '+SECRET), 'browser_profile_locked'),
            ('launch', PermissionError(SECRET), 'browser_permission_denied'),
            ('launch', TimeoutError(SECRET), 'browser_launch_timeout'),
            ('navigation', RuntimeError('net::ERR_CONNECTION_REFUSED '+SECRET), 'source_connection_refused'),
            ('navigation', RuntimeError('net::ERR_NAME_NOT_RESOLVED '+SECRET), 'source_dns_failed'),
            ('navigation', TimeoutError(SECRET), 'source_navigation_timeout'),
        ]
        for stage, original, code in cases:
            def fail(): raise original
            with self.assertRaises(D.CaptureDiagnostic) as caught:
                D.run_stage(stage, fail)
            self.assertIs(caught.exception.__cause__, original)
            line = D.diagnostic_line(caught.exception)
            self.assertNotIn('synthetic-secret', line)
            self.assertEqual(A.source_reason(line), code)
            with tempfile.TemporaryDirectory() as folder:
                attempt=A.Attempt(Path(folder), lambda:0)
                attempt.event('capture.inventory', source=A.source_reason(line))
                self.assertEqual(attempt.data['events'][-1]['source_reason'],code)

    def test_unknown_or_injected_payload_cannot_enter_diagnostics(self):
        self.assertIsNone(D.parse_code(D.PREFIX+json.dumps({'code':SECRET,'stage':'launch','exception':'Error'})))
        self.assertIsNone(D.parse_code(D.PREFIX+json.dumps({'code':'browser_launch_failed','stage':'launch','exception':'Error','raw':SECRET})))
        self.assertEqual(A.source_reason(SECRET),'source_read_nonzero')
        self.assertIsNone(D.parse_code(D.PREFIX+json.dumps({'code':[],'stage':'launch','exception':'Error'})))
        e=D.readiness_diagnostic(L.LinuxCaptureError('Chats view did not become ready (signed out? run --login)'))
        self.assertEqual(e.code,'source_chats_not_ready')
        self.assertNotIn('sign_in_required',D.diagnostic_line(e))

    def test_cli_retains_inventory_readiness_cause_without_raw_stderr(self):
        out=io.StringIO()
        with mock.patch.object(L,'load_settings',return_value={}), mock.patch.object(L,'capture',side_effect=L.LinuxCaptureError('Visible inventory not rendered')), contextlib.redirect_stderr(out):
            rc=L.main(['-Mode','inventory','-OutputPath','synthetic.json','-SettingsPath','synthetic-settings.json'])
        self.assertEqual(rc,1)
        self.assertEqual(A.source_reason(out.getvalue()),'source_inventory_not_rendered')

    def test_inventory_wait_resolves_relative_and_absolute_links_and_rejects_other_origins(self):
        # Models browser href resolution separately from raw href-attribute matching.
        cid='prv_'+'A'*26
        for href in ['/chats/'+cid, 'https://app.beside.com/chats/'+cid]:
            class Page:
                def query_selector_all(self, selector):
                    self.selector=selector
                    matches=('/chats/prv_' in href) if selector=='a[href*="/chats/prv_"]' else href.startswith('https://app.beside.com/chats/prv_')
                    return [SimpleNamespace(evaluate=lambda _:urljoin(L.APP,href))] if matches else []
            page=Page()
            L.wait_for_visible_inventory(page,timeout_seconds=0)
            self.assertEqual(page.selector,'a[href*="/chats/prv_"]')
        page=SimpleNamespace(query_selector_all=lambda _:[SimpleNamespace(evaluate=lambda _:'https://other.invalid/chats/'+cid)])
        with self.assertRaises(L.LinuxCaptureError):
            L.wait_for_visible_inventory(page,timeout_seconds=0)

if __name__=='__main__': unittest.main()
