"""Synthetic service-budget wiring checks; never opens a browser or real settings."""
import os
from pathlib import Path
import re
import sys
from types import SimpleNamespace
import unittest
from unittest import mock

import capture_beside_linux as capture


class ServiceBudgetEnvelopeTests(unittest.TestCase):
    def supplied_budget(self, settings, keepalive_seconds=0):
        worker = mock.Mock(return_value={'ok': True, 'fresh_scan_performed': False})
        modules = {
            'beside_refresh_runner': SimpleNamespace(run=worker),
            'beside_alerts': SimpleNamespace(run=lambda *args: {'ok': True}),
        }
        with mock.patch.dict(sys.modules, modules), mock.patch.dict(os.environ), \
             mock.patch.object(capture, 'keepalive', return_value={'ok': True}), \
             mock.patch.object(capture.time, 'monotonic', side_effect=[100, 100 + keepalive_seconds]):
            capture._service_locked(Path('synthetic-settings.json'), settings)
        return worker.call_args.kwargs['budget_seconds']

    def test_default_budget_fits_service_and_timer_envelope(self):
        budget = self.supplied_budget({})
        unit = (Path(capture.__file__).parent / 'linux' / 'beside-capture.service').read_text()
        timer = (Path(capture.__file__).parent / 'linux' / 'beside-capture.timer').read_text()
        service_limit = int(re.search(r'^TimeoutStartSec=(\d+)$', unit, re.M).group(1))
        interval = int(re.search(r'^OnUnitActiveSec=(\d+)min$', timer, re.M).group(1)) * 60
        self.assertGreaterEqual(budget, 315 + 90 + 24, 'readiness and HTTP calls must leave the default claim slot')
        self.assertGreaterEqual(service_limit, budget + 90, 'keepalive needs headroom before the runner')
        self.assertLess(service_limit, interval, 'default deadline must fit the existing timer period')

    def test_explicit_private_budget_is_preserved(self):
        self.assertEqual(self.supplied_budget({'beside_linux_budget_seconds': 150}), 150)

    def test_oversized_budget_is_capped(self):
        self.assertEqual(self.supplied_budget({'beside_linux_budget_seconds': 900}), 540)

    def test_slow_keepalive_consumes_service_envelope(self):
        self.assertEqual(self.supplied_budget({}, keepalive_seconds=200), 430)
        self.assertEqual(self.supplied_budget({}, keepalive_seconds=700), 0)


if __name__ == '__main__':
    unittest.main()
