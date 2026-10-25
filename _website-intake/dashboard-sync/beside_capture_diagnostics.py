"""Fixed diagnostic vocabulary. Never serialize exception text, URLs or browser output."""
import json

PREFIX = 'BESIDE_CAPTURE_DIAGNOSTIC '
CODES = frozenset({
    'browser_executable_missing', 'browser_display_unavailable', 'browser_profile_locked',
    'browser_permission_denied', 'browser_launch_timeout', 'browser_launch_failed',
    'source_connection_refused', 'source_dns_failed', 'source_navigation_timeout',
    'source_navigation_failed', 'source_chats_not_ready', 'source_account_unavailable',
    'source_filter_unavailable', 'source_inventory_not_rendered',
})
TYPES = frozenset({'Error', 'TimeoutError', 'TargetClosedError', 'FileNotFoundError',
                   'PermissionError', 'OSError', 'LinuxCaptureError', 'RuntimeError'})
STAGES = frozenset({'launch', 'navigation', 'readiness'})


def classify(exc, stage):
    # Inspect locally; retain only a fixed category, never the matched message.
    text = str(exc).lower()
    if stage == 'launch':
        if isinstance(exc, FileNotFoundError) or "executable doesn't exist" in text:
            return 'browser_executable_missing'
        if 'missing x server' in text or '$display' in text:
            return 'browser_display_unavailable'
        if 'processsingleton' in text or 'singletonlock' in text:
            return 'browser_profile_locked'
        if isinstance(exc, PermissionError) or 'permission denied' in text:
            return 'browser_permission_denied'
        if type(exc).__name__ == 'TimeoutError':
            return 'browser_launch_timeout'
        return 'browser_launch_failed'
    if 'err_connection_refused' in text:
        return 'source_connection_refused'
    if 'err_name_not_resolved' in text:
        return 'source_dns_failed'
    if type(exc).__name__ == 'TimeoutError':
        return 'source_navigation_timeout'
    return 'source_navigation_failed'


class CaptureDiagnostic(RuntimeError):
    def __init__(self, code, stage, exception='Error'):
        self.code = code if code in CODES else 'browser_launch_failed'
        self.stage = stage if stage in STAGES else 'launch'
        self.exception = exception if exception in TYPES else 'Error'
        super().__init__(self.code)


def run_stage(stage, action):
    try:
        return action()
    except CaptureDiagnostic:
        raise
    except Exception as exc:
        raise CaptureDiagnostic(classify(exc, stage), stage, type(exc).__name__) from exc


def diagnostic_line(exc):
    return PREFIX + json.dumps({'code': exc.code, 'stage': exc.stage,
                                'exception': exc.exception}, sort_keys=True)


def parse_code(stderr):
    for line in (stderr or '').splitlines():
        if not line.startswith(PREFIX) or len(line) > 400:
            continue
        try:
            value = json.loads(line[len(PREFIX):])
        except (ValueError, TypeError):
            continue
        if (isinstance(value, dict) and set(value) == {'code', 'stage', 'exception'}
                and all(isinstance(value.get(k),str) for k in ('code','stage','exception'))
                and value.get('code') in CODES and value.get('stage') in STAGES
                and value.get('exception') in TYPES):
            return value['code']
    return None


def readiness_diagnostic(exc):
    if type(exc).__name__ != 'LinuxCaptureError':
        return None
    code = {
        'Chats view did not become ready (signed out? run --login)': 'source_chats_not_ready',
        'Expected signed-in Beside account/mailbox unavailable': 'source_account_unavailable',
        'Expected All-conversations filter unavailable': 'source_filter_unavailable',
        'Visible inventory not rendered': 'source_inventory_not_rendered',
    }.get(str(exc))
    return CaptureDiagnostic(code, 'readiness', 'LinuxCaptureError') if code else None
