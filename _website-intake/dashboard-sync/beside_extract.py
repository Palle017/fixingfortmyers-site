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
MAKE_WORD = re.compile(r'\b(?:'+'|'.join(map(re.escape,MAKES))+r')\b',re.I)


def _clean(value, limit):
    value = ' '.join(str(value).split()).strip(' .,-')
    return value[:limit]


def extract(body,*,explicit_only=False):
    """Return (vehicle, issue); either may be ''."""
    if not isinstance(body, str) or not body.strip():
        return '', ''
    vehicle = ''
    match = VEHICLE_LABEL.search(body)
    if match:
        vehicle = _clean(match.group(1), 160)
        if explicit_only and not MAKE_WORD.search(vehicle):vehicle=''
    elif not explicit_only:
        match = YEAR_MAKE.search(body)
        if match:
            vehicle = _clean(match.group(1), 160)
    match = ISSUE_LABEL.search(body)
    issue = _clean(match.group(1), 700) if match else ''
    return vehicle, issue


SELF_NAME=re.compile(r"\b[Mm]y name is\s+([A-Z][a-z'-]{1,39}(?:\s+[A-Z][a-z'-]{1,39})?)(?=$|[,.!?]|\s+(?:and|I\b|my\b))")

def explicit_customer_name(item):
    # Flattened captures contain both the shop and caller's words. Only an
    # explicitly inbound message can identify the customer who introduced themself.
    names=set()
    for message in item.get('messages') or []:
        if not isinstance(message,dict) or message.get('direction')!='inbound':continue
        body=message.get('body') or message.get('text') or ''
        if not isinstance(body,str):continue
        names.update(match.group(1) for match in SELF_NAME.finditer(body))
    return next(iter(names)) if len(names)==1 else ''

def apply(item,*,explicit_only=False):
    """Fill vehicle (only when empty) and put the extracted issue first in concern; keep full text."""
    vehicle, issue = extract(item.get('concern', ''),explicit_only=explicit_only)
    out = dict(item)
    if not out.get('name') or out.get('name')=='Name not provided':
        name=explicit_customer_name(item)
        if name:out['name']=name
    if vehicle and not out.get('vehicle'):
        out['vehicle'] = vehicle
    if issue and not str(out.get('concern', '')).startswith('Issue: '):
        out['concern'] = 'Issue: ' + issue + '\n\n' + str(out.get('concern', ''))
    return out
