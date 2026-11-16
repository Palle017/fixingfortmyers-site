// Shared guard for Tony's rule: never publish a street address anywhere in the site or repo.
// The old addresses are stored only as SHA-256 hashes of normalized tokens, so this guard
// (and every test that uses it) never republishes the very text it is protecting.
import { createHash } from 'node:crypto';

const sha = s => createHash('sha256').update(s).digest('hex');
// Hashes of lower-cased single tokens and two-word phrases from former street addresses.
const PRIVATE = new Set([
  '520303b5b551ccab7a645730849bb475eab3d89383e9c1fadab40d84ae9e37cf',
  '912d67e0b151b234d87940ac8626dc5a97f6ba73e9def0cad64cc45f64dcbd13',
  '3a853a7072e167f437927599896d6df4b19d236765d69144f15739c3ce62b2f9',
  '642a9380f4f15a5cc6baf0693c5ae537f786282938b04ca1625a482791a0763b',
  'b9b5ab813b96933d6570fe71fc4d046127370defbc8a211c6826d1b48da8ab22',
]);
const SUFFIX = 'st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|ct|court|pkwy|parkway|hwy|highway|cir|circle|trl|trail|loop|ter|terrace|pl|place|way';
// House number + one to three words + street suffix, e.g. "[number] Main St" (case-insensitive).
const STREET_LINE = new RegExp(String.raw`\b\d{2,6}\s+(?:[nsew]\.?\s+)?(?:[a-z0-9]+\s+){1,3}(?:${SUFFIX})\b(?![-\w])`, 'i');
// Synthetic placeholders used by intake tests (e.g. "123 Example St") are not real addresses.
const PLACEHOLDER = /\b123 Example St\b/gi;

/** Returns a short description of the first private-address hit in text, or null. */
export function findPrivateAddress(text) {
  const clean = String(text).replace(PLACEHOLDER, '');
  if (/"streetAddress"\s*:/.test(clean)) return 'JSON-LD streetAddress';
  const words = clean.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    if (PRIVATE.has(sha(words[i]))) return `private address token at word ${i}`;
    if (i + 1 < words.length && PRIVATE.has(sha(`${words[i]} ${words[i + 1]}`))) return `private address phrase at word ${i}`;
  }
  const m = clean.match(STREET_LINE);
  return m ? `street-address pattern near index ${m.index}` : null;
}

export function assertNoPrivateAddress(assert, text, label = '') {
  const hit = findPrivateAddress(text);
  assert.equal(hit, null, `${label}${label ? ': ' : ''}publishes a street address (${hit})`);
}
