"""Optional vehicle / issue extraction from rendered Beside thread text. Pure, no network.

Conservative: only explicit labels ("Vehicle:", "Car:", "Issue:", "Reason for call:", ...) or a
"<year> <known make> [model]" mention are used. Nothing is inferred when unsure.
"""
from __future__ import annotations
import re

MAKES = ('acura alfa audi bmw buick cadillac chevrolet chevy chrysler dodge fiat ford genesis gmc honda hyundai '
         'infiniti jaguar jeep kia land lexus lincoln mazda mercedes mercedes-benz mini mitsubishi nissan porsche ram '
         'subaru tesla toyota volkswagen vw volvo').split()
VEHICLE_LABEL = re.compile(r'^\s*(?:vehicle|car|truck|make(?:\s*/\s*model)?|year\s*/\s*make\s*/\s*model|vehicle info(?:rmation)?)\s*[:\-]\s*(.+)$', re.I | re.M)
ISSUE_LABEL = re.compile(r'^\s*(?:issue|problem|concern|reason for (?:the )?call|service(?: needed| requested)?|repair(?: needed)?|symptoms?)\s*[:\-]\s*(.+)$', re.I | re.M)
# Make is case-insensitive; model tokens must start with a capital letter or digit (e.g. "F-150", "Accord").
YEAR_MAKE = re.compile(r'\b((?:19[89]\d|20[0-4]\d)\s+(?i:' + '|'.join(map(re.escape, MAKES)) + r')(?:\s+[A-Z0-9][\w\-]*){0,2})')


def _clean(value, limit):
    value = ' '.join(str(value).split()).strip(' .,-')
    return value[:limit]


def extract(body):
    """Return (vehicle, issue); either may be ''."""
    if not isinstance(body, str) or not body.strip():
        return '', ''
    vehicle = ''
    match = VEHICLE_LABEL.search(body)
    if match:
        vehicle = _clean(match.group(1), 160)
    else:
        match = YEAR_MAKE.search(body)
        if match:
            vehicle = _clean(match.group(1), 160)
    match = ISSUE_LABEL.search(body)
    issue = _clean(match.group(1), 700) if match else ''
    return vehicle, issue


def apply(item):
    """Fill vehicle (only when empty) and put the extracted issue first in concern; keep full text."""
    vehicle, issue = extract(item.get('concern', ''))
    out = dict(item)
    if vehicle and not out.get('vehicle'):
        out['vehicle'] = vehicle
    if issue and not str(out.get('concern', '')).startswith('Issue: '):
        out['concern'] = 'Issue: ' + issue + '\n\n' + str(out.get('concern', ''))
    return out
