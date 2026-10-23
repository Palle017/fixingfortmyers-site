"""Validate supplied rendered-message evidence; this module performs no acquisition.

Current collectors supply only rendered-thread observations. A new reader must first
verify a real selected message surface; this contract does not invent a UI selector.
"""
from datetime import datetime, timedelta, timezone
import json

FIELDS = ('name', 'vehicle_year', 'vehicle_model', 'repair_request', 'callback_availability')


class MessageEvidenceError(ValueError):
    pass


def _instant(value):
    try:
        parsed = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        return parsed if parsed.utcoffset() is not None else None
    except (ValueError, TypeError):
        return None


def _utc(value):
    return value.astimezone(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def _unknown_fields():
    return {key: {'value': '', 'basis': 'unknown', 'direction': 'unknown',
                  'event_id': None, 'event_at': None, 'uncertainty': 'message_source_unverified'}
            for key in FIELDS}


def _observation(capture, observation):
    proof = observation.get('message_evidence')
    if not isinstance(proof, dict) or proof.get('format') != 'beside-message-evidence/v1':
        raise MessageEvidenceError('message_surface_unverified')
    if proof.get('source_url') != capture.get('source_url') or proof.get('observed_at') != observation.get('observed_at'):
        raise MessageEvidenceError('message_evidence_identity_mismatch')
    observed = _instant(proof['observed_at'])
    if observed is None:
        raise MessageEvidenceError('message_capture_time_unverified')
    surface = proof.get('surface')
    if not isinstance(surface, dict) or surface.get('kind') != 'messages' or surface.get('role') != 'Tab':
        raise MessageEvidenceError('message_surface_unverified')
    if (surface.get('selected') is not True or surface.get('verification') != 'rendered_selected_control'
            or not isinstance(surface.get('name'), str) or not 1 <= len(surface['name'].strip()) <= 100):
        raise MessageEvidenceError('message_surface_unverified')
    records = proof.get('messages')
    if not isinstance(records, list) or len(records) > 200:
        raise MessageEvidenceError('invalid_message_evidence')
    if not records and proof.get('empty_state_observed') is not True:
        raise MessageEvidenceError('message_content_unverified')
    normalized = []
    for record in records:
        if not isinstance(record, dict) or record.get('kind') != 'message':
            # Recap/call rows are not evidence that the message surface was acquired.
            raise MessageEvidenceError('message_content_unverified')
        text = record.get('text')
        if not isinstance(text, str) or len(text) > 4000:
            raise MessageEvidenceError('invalid_message_evidence')
        if not text.strip() and record.get('has_attachment') is not True:
            raise MessageEvidenceError('message_content_unverified')
        direction = record.get('direction', 'unknown')
        if direction not in ('inbound', 'outbound', 'unknown'):
            raise MessageEvidenceError('invalid_message_direction')
        event_id = record.get('id') if record.get('id_basis') == 'provider' else None
        if event_id is not None and (not isinstance(event_id, str) or not 1 <= len(event_id) <= 160):
            raise MessageEvidenceError('invalid_message_identity')
        event_at = _instant(record.get('at')) if record.get('time_basis') == 'provider_timestamp' else None
        if event_at and event_at > observed + timedelta(minutes=1):
            raise MessageEvidenceError('future_message_timestamp')
        facts = record.get('facts', {})
        if not isinstance(facts, dict) or any(key not in FIELDS for key in facts):
            raise MessageEvidenceError('invalid_message_facts')
        if any(not isinstance(value, str) or len(value) > 500 for value in facts.values()):
            raise MessageEvidenceError('invalid_message_facts')
        normalized.append({'id': event_id, 'at': _utc(event_at) if event_at else None,
                           'kind': 'message', 'direction': direction, 'text': text,
                           'basis': 'rendered_message', 'has_attachment': record.get('has_attachment') is True,
                           'facts': facts,
                           'uncertainty': 'source_time_unknown' if event_at is None else 'rendered_message'})
    if sum(len(record['text']) for record in normalized) > 32000:
        raise MessageEvidenceError('message_evidence_exceeds_bound')
    return {'surface': surface, 'messages': normalized, 'empty_state_observed': not normalized}


def acquisition(capture, *, requested_surface='rendered_thread'):
    if requested_surface not in ('rendered_thread', 'messages'):
        raise MessageEvidenceError('invalid_requested_surface')
    result = {'format': 'beside-acquisition/v1', 'requested_surface': requested_surface,
              'acquired_surface': 'rendered_thread', 'messages_verified': False,
              'source_captured_at': capture.get('observed_at'), 'source_event_at': None,
              'source_event_id': None, 'priority_evidence': _unknown_fields(),
              'messages': [], 'reason': 'message_surface_unverified',
              'limitations': ['Rendered thread text is not proof of message-tab acquisition.',
                              'No current message-tab selector or complete message history is verified.']}
    try:
        prior = capture.get('prior_samples')
        if not isinstance(prior, list) or len(prior) != 2:
            raise MessageEvidenceError('three_message_observations_required')
        observations = [_observation(capture, sample) for sample in [*prior, capture]]
        fingerprints = [json.dumps(value, sort_keys=True, ensure_ascii=False) for value in observations]
        if len(set(fingerprints)) != 1:
            raise MessageEvidenceError('message_evidence_not_stable')
    except MessageEvidenceError as exc:
        result['reason'] = str(exc)
        if requested_surface == 'messages':
            raise
        return result
    final = observations[-1]
    result.update(acquired_surface='messages', messages_verified=True, reason='verified_rendered_messages',
                  messages=final['messages'], limitations=['Rendered message window only; complete provider history is not verified.'])
    candidates = []; chosen = {}
    for message in final['messages']:
        if message['direction'] == 'outbound':
            continue
        for key, value in message['facts'].items():
            if not value.strip():
                continue
            rank = (message['direction'] == 'inbound', message['at'] is not None,
                    message['at'] or '', message['id'] or '', value)
            if key in chosen and rank <= chosen[key]:
                continue
            chosen[key] = rank
            result['priority_evidence'][key] = {
                'value': value, 'basis': 'rendered_message', 'direction': message['direction'],
                'event_id': message['id'], 'event_at': message['at'],
                'uncertainty': ('direction_unknown' if message['direction'] == 'unknown'
                                else 'event_identity_unknown' if message['id'] is None
                                else 'source_time_unknown' if message['at'] is None else '')}
        if (message['direction'] == 'inbound' and message['id'] and message['at']
                and any(value.strip() for value in message['facts'].values())):
            candidates.append(message)
    if candidates:
        latest = max(candidates, key=lambda value: (value['at'], value['id'] or ''))
        result.update(source_event_at=latest['at'], source_event_id=latest['id'])
    return result
