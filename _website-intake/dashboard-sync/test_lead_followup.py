from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import tempfile
import unittest
import lead_followup as fu

START = datetime(2026, 10, 17, 5, 0, tzinfo=timezone.utc)  # 01:00 EDT


def at(minutes):
    return START + timedelta(minutes=minutes)


def lead(key='b1', minutes=1, **extra):
    row = {'id': 'beside:chat:' + key, 'source': 'beside', 'received_at': at(minutes).isoformat().replace('+00:00', 'Z'),
           'stage': 'current_review', 'classification': 'review', 'historical': False, 'owner_updated_at': None,
           'name': 'Synthetic Caller', 'phone': '(239) 555-0100', 'email': 'caller@example.com',
           'vehicle': '2003 Ford F-250 V10', 'concern': 'Overheating and losing coolant. Call me at 239-555-0100.'}
    row.update(extra)
    return row


def baseline(*rows):
    return {'complete': True, 'limit': 1000, 'leads': list(rows), 'sources': []}


CONFIG = {'url': 'https://owner.example.test/api/sync', 'service_token': 'x' * 20, 'sync_token': 'y' * 20,
          'followup': {'enabled': True, 'start_at': START.isoformat(), 'dashboard_url': 'https://owner.example.test/',
                       'tony_push_url': 'https://push.example.test/tony', 'raj_push_url': 'https://push.example.test/raj'}}


class Harness:
    def __init__(self, rows, online=True, fail=False):
        self.rows, self.online, self.fail, self.sent = rows, online, fail, []
        self.dir = tempfile.TemporaryDirectory()
        unittest.addModuleCleanup(self.dir.cleanup)

    def tick(self, minutes, config=CONFIG):
        def post(url, message):
            if self.fail:
                return False
            self.sent.append((url.rsplit('/', 1)[1], message))
            return True
        before = len(self.sent)
        receipt = fu.run(config, lambda: (baseline(*self.rows), self.online), self.dir.name, now=at(minutes), post=post)
        return receipt, self.sent[before:]


class PriorityTests(unittest.TestCase):
    def test_overheating_coolant_is_big_job(self):
        self.assertEqual(fu.priority(lead()), 'big_job')

    def test_stranded_no_start_is_emergency(self):
        self.assertEqual(fu.priority(lead(concern='Car will not move', stranded='yes', starts='no')), 'emergency')
        self.assertEqual(fu.priority(lead(concern='Stranded on the side of the road')), 'emergency')

    def test_other_big_jobs(self):
        for text in ('Rod knock at idle', 'Transmission slipping', 'Cranks but no start', 'Blown head gasket'):
            self.assertEqual(fu.priority(lead(concern=text, vehicle='Synthetic')), 'big_job', text)

    def test_routine_is_normal(self):
        self.assertEqual(fu.priority(lead(concern='Oil change and tire rotation', vehicle='2015 Honda Civic')), 'normal')


class LadderTests(unittest.TestCase):
    def test_ladder_fires_each_step_once(self):
        h = Harness([lead(minutes=0)])
        timeline = {m: [who for who, _ in h.tick(m)[1]] for m in (0, 1, 15, 16, 30, 31, 60, 61, 300)}
        self.assertEqual(timeline, {0: ['tony'], 1: [], 15: ['tony'], 16: [], 30: ['tony'], 31: [], 60: ['raj'], 61: [], 300: []})

    def test_runs_overnight(self):
        h = Harness([lead(minutes=60)])  # 02:00 EDT: there are no quiet hours
        self.assertEqual([w for w, _ in h.tick(60)[1]], ["tony"])

    def test_touched_lead_stops(self):
        row = lead(minutes=0)
        h = Harness([row])
        h.tick(0)
        row['owner_updated_at'] = at(5).isoformat()
        self.assertEqual(h.tick(15)[1], [])
        self.assertEqual(h.tick(60)[1], [])

    def test_stage_change_stops(self):
        row = lead(minutes=0)
        h = Harness([row])
        h.tick(0)
        row['stage'] = 'contacted'
        self.assertEqual(h.tick(30)[1], [])

    def test_late_arrival_sends_one_push_per_person(self):
        h = Harness([lead(minutes=0)])
        pushes = [(w, m) for w, m in h.tick(22 * 60)[1] if m['title'] != 'Open leads this morning']
        self.assertEqual(sorted(w for w, _ in pushes), ['raj', 'tony'])  # 22 hours late, like the F-250 card
        self.assertEqual(h.tick(22 * 60 + 1)[1], [])

    def test_backlog_before_start_never_escalates(self):
        h = Harness([lead(minutes=-6000)])
        self.assertEqual([m['title'] for _, m in h.tick(0)[1]], [])

    def test_historical_and_spam_ignored(self):
        h = Harness([lead('h', source='beside-history'), lead('s', classification='spam'), lead('o', historical=True)])
        self.assertEqual(h.tick(60)[1], [])

    def test_junk_stops_ladder_and_restore_keeps_sent_steps(self):
        row = lead(minutes=0)
        h = Harness([row])
        self.assertEqual([who for who, _ in h.tick(0)[1]], ['tony'])
        row['folder'] = 'junk'
        self.assertEqual(h.tick(15)[1], [])
        self.assertEqual(h.tick(30)[1], [])
        row['folder'] = 'inbox'
        pushes = h.tick(31)[1]
        self.assertEqual([who for who, _ in pushes], ['tony'])
        self.assertIn('not contacted (30 min)', pushes[0][1]['title'])
        self.assertEqual(h.tick(32)[1], [])
        state = json.loads((Path(h.dir.name) / 'followup-state.json').read_text())
        self.assertEqual(state['sent'][row['id'] + ':0'], at(0).isoformat())
        self.assertEqual(set(state['sent']), {row['id'] + ':' + str(m) for m in (0, 15, 30)})

    def test_failed_send_retries_next_run(self):
        h = Harness([lead(minutes=0)], fail=True)
        receipt, _ = h.tick(0)
        self.assertFalse(receipt['ok'])
        h.fail = False
        self.assertEqual([w for w, _ in h.tick(1)[1]], ['tony'])


class MessageTests(unittest.TestCase):
    def test_push_has_no_customer_contact_details(self):
        h = Harness([lead(minutes=0)])
        _, pushes = h.tick(0)
        text = json.dumps(pushes)
        for secret in ('Synthetic Caller', '555-0100', '5550100', 'caller@example.com'):
            self.assertNotIn(secret, text)
        message = pushes[0][1]
        self.assertTrue(message['title'].startswith('BIG JOB: 2003 Ford F-250'))
        self.assertIn('Overheating', message['body'])
        self.assertEqual(message['click'], 'https://owner.example.test/')

    def test_raj_message_says_why(self):
        h = Harness([lead(minutes=0, concern='Oil change', vehicle='Civic')])
        raj = [m for w, m in h.tick(61)[1] if w == 'raj'][0]
        self.assertIn('not contacted in 60 min', raj['title'])

    def test_thirty_minute_push_is_urgent(self):
        h = Harness([lead(minutes=0, concern='Oil change', vehicle='Civic')])
        h.tick(0); h.tick(15)
        self.assertEqual(h.tick(30)[1][0][1]['priority'], 'urgent')


class AlarmAndDigestTests(unittest.TestCase):
    def test_offline_scan_alarm_once_per_outage(self):
        h = Harness([], online=False)
        self.assertEqual(h.tick(0)[1], [])
        self.assertEqual(len(h.tick(15)[1]), 2)
        self.assertEqual(h.tick(30)[1], [])
        h.online = True; h.tick(31); h.online = False
        h.tick(32)
        self.assertEqual(len(h.tick(47)[1]), 2)

    def test_digest_only_when_open_and_once_a_day(self):
        h = Harness([])
        morning = 7 * 60  # 2026-10-17 08:00 EDT
        self.assertEqual(h.tick(morning)[1], [])
        h.rows = [lead(minutes=morning - 120, owner_updated_at=None)]
        h.tick(morning - 120)
        sent = [m['title'] for _, m in h.tick(morning + 1)[1]]
        self.assertEqual(sent.count('Open leads this morning'), 2)
        self.assertNotIn('Open leads this morning', [m['title'] for _, m in h.tick(morning + 2)[1]])

    def test_junk_never_enters_current_or_older_review_digest(self):
        h = Harness([lead('current', minutes=0, folder='junk'),
                     lead('older', minutes=-6000, folder='junk')])
        self.assertEqual(h.tick(7 * 60)[1], [])
        h.rows[1]['folder'] = 'inbox'
        messages = h.tick(7 * 60 + 1)[1]
        self.assertEqual(len(messages), 2)
        self.assertTrue(all(message['body'].startswith('1 older card(s)') for _, message in messages))

    def test_eastern_time_handles_dst(self):
        self.assertEqual(fu.eastern(datetime(2026, 7, 1, 12, tzinfo=timezone.utc)).hour, 8)
        self.assertEqual(fu.eastern(datetime(2026, 12, 1, 13, tzinfo=timezone.utc)).hour, 8)


class CounterAndConfigTests(unittest.TestCase):
    def test_counters(self):
        rows = [lead('a', 0, owner_updated_at=at(10).isoformat(), stage='contacted'),
                lead('b', 0, owner_updated_at=at(45).isoformat(), stage='send_quote'),
                lead('c', 0)]
        stats = fu.counters(rows, START, at(120))
        self.assertEqual(stats, {'leads_since_start': 3, 'uncontacted_now': 1, 'touched_within_15_min_pct': 33,
                                 'touched_within_60_min_pct': 67, 'median_minutes_to_first_touch': 27.5,
                                 'quoted': 1, 'booked': 0})

    def test_junk_does_not_change_followup_totals_or_first_touch_metrics(self):
        inbox = lead('active', 0, folder='inbox')
        rows = [inbox, lead('junk-open', 0, folder='junk'),
                lead('junk-quote', 0, folder='junk', stage='send_quote', owner_updated_at=at(2).isoformat()),
                lead('junk-booked', 0, folder='junk', stage='scheduled', owner_updated_at=at(3).isoformat())]
        self.assertEqual(fu.counters(rows, START, at(120)), fu.counters([inbox], START, at(120)))
        self.assertEqual(fu.counters(rows, START, at(120))['leads_since_start'], 1)

    def test_off_by_default(self):
        h = Harness([lead(minutes=0)])
        receipt, pushes = h.tick(0, config={**CONFIG, 'followup': {}})
        self.assertEqual((receipt['ok'], receipt['enabled'], pushes), (True, False, []))

    def test_rejects_bad_push_urls(self):
        bad = {**CONFIG, 'followup': {**CONFIG['followup'], 'raj_push_url': 'http://insecure.test/raj'}}
        receipt, _ = Harness([]).tick(0, config=bad)
        self.assertEqual(receipt['error'], 'invalid_push_urls')

    def test_incomplete_baseline_sends_nothing(self):
        h = Harness([lead(minutes=0)])
        receipt = fu.run(CONFIG, lambda: ({'complete': False, 'leads': []}, True), h.dir.name, now=at(0), post=lambda *_: True)
        self.assertEqual(receipt['error'], 'dashboard_readback_incomplete')

    def test_receipt_has_counts_not_customer_details(self):
        h = Harness([lead(minutes=0)])
        h.tick(0)
        text = (Path(h.dir.name) / 'followup-status.json').read_text()
        self.assertNotIn('Synthetic Caller', text)
        self.assertIn('uncontacted_now', text)


if __name__ == '__main__':
    unittest.main()
