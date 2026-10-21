import re
import unittest
from pathlib import Path

HERE=Path(__file__).resolve().parent
SCRIPT=(HERE/'beside_keepalive.ps1').read_text(encoding='utf-8')
TASK=(HERE/'beside-keepalive-task.xml').read_text(encoding='utf-8')

class KeepAliveStaticTests(unittest.TestCase):
    def test_gated_off_by_default(self):
        self.assertIn('beside_keepalive_enabled -ne $true',SCRIPT)
    def test_never_handles_credentials_or_keystrokes(self):
        for banned in ('SendKeys','password','Cookies','Login Data','ValuePattern]::Pattern).SetValue','Invoke-WebRequest'):
            self.assertNotIn(banned.lower(),SCRIPT.lower().split('#>')[-1])
    def test_only_opens_beside_chats_in_dedicated_profile(self):
        urls=set(re.findall(r'https://[^\s\'"]+',SCRIPT.split('#>')[-1]))
        self.assertEqual(urls,{'https://app.beside.com/chats'})
        self.assertIn('--user-data-dir=',SCRIPT)
    def test_task_is_interactive_least_privilege(self):
        self.assertIn('<LogonType>InteractiveToken</LogonType>',TASK)
        self.assertIn('<RunLevel>LeastPrivilege</RunLevel>',TASK)
        self.assertIn('IgnoreNew',TASK)

if __name__=='__main__':unittest.main()
