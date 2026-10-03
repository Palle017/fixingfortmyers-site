const invalid = message => { throw Object.assign(new Error(message), {status:400}); };
const text = (value, max) => {
  if (typeof value !== 'string') invalid('Use text for the car location.');
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g,' ').trim();
  if (cleaned.length > max) invalid('The car location is too long.');
  return cleaned;
};

// Additive for older form/chat clients: provided location records are always validated.
export function normalizeCarLocation(value) {
  // Multipart recording fields arrive as text; keep the same validated record as JSON requests.
  if (typeof value === 'string') {
    if (value.length > 4096) invalid('The car location is too long.');
    try { value = JSON.parse(value); } catch { invalid('Choose the car location or shop drop-off.'); }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('Choose the car location or shop drop-off.');
  if (value.type === 'dropoff') return {type:'dropoff',preferredTime:text(value.preferredTime ?? '',160)};
  if (value.type === 'address') {
    const address=text(value.address,500);
    if (!address) invalid('Enter the car’s address or use current location.');
    return {type:'address',address};
  }
  if (value.type === 'device') {
    const {latitude,longitude,accuracyMeters}=value;
    if (![latitude,longitude,accuracyMeters].every(Number.isFinite) || Math.abs(latitude)>90 || Math.abs(longitude)>180 || accuracyMeters<0 || value.carAtDevice!==true) invalid('Please share the car’s location again or type its address.');
    const capturedAt=text(value.capturedAt,40);
    if (!capturedAt || !Number.isFinite(Date.parse(capturedAt)) || Date.parse(capturedAt)>Date.now()+300000) invalid('Please share the car’s location again.');
    return {type:'device',latitude,longitude,accuracyMeters,capturedAt,carAtDevice:true};
  }
  invalid('Choose the car location or shop drop-off.');
}

export function carLocationLabel(value) {
  if (value.type==='dropoff') return `Shop drop-off requested${value.preferredTime ? '; preferred time: '+value.preferredTime : ''}. Tony to confirm.`;
  if (value.type==='device') return `Current device location (${value.latitude.toFixed(6)}, ${value.longitude.toFixed(6)}; accuracy about ${Math.max(1,Math.round(value.accuracyMeters))} metres)`;
  return value.address;
}

export function carLocationMap(value) {
  if (!value || value.type==='dropoff') return '';
  const query=value.type==='device' ? value.latitude+','+value.longitude : value.address;
  return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(query);
}
