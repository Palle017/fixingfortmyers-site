#!/usr/bin/env node
// Local metadata inventory only. No network, OCR, transcription, or model calls.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const permanentRoot = basename(dirname(repoRoot)) === '.worktrees' ? resolve(repoRoot, '../..') : repoRoot;
const args = process.argv.slice(2);
let base = join(permanentRoot, 'source-materials');
let rehash = false;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--base' && args[i + 1]) base = resolve(args[++i]);
  else if (args[i] === '--rehash') rehash = true;
  else if (args[i] === '--help') {
    console.log('node tools/index-source-materials.mjs [--base PRIVATE_FOLDER] [--rehash]\nReads PRIVATE_FOLDER/inbox; writes private index, annotations, and shortlist. No uploads.');
    process.exit(0);
  } else throw new Error('Unknown argument; use --help.');
}

function inside(parent, child) {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith(`..`) && !isAbsolute(rel));
}
if (inside(repoRoot, base) && basename(dirname(repoRoot)) === '.worktrees') {
  throw new Error('Intake must be outside the published worktree. Use the permanent project source-materials folder.');
}
// Refuse junctions/symlinks in intake ancestry and inside inbox, so a local inventory
// cannot silently leave the intended private tree or overwrite linked output files.
async function rejectLinkedAncestors(path) {
  let current = path;
  while (true) {
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error('Symbolic links/junctions are not allowed in the intake path.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const next = dirname(current);
    if (next === current) break;
    current = next;
  }
}
await rejectLinkedAncestors(base);
const inbox = join(base, 'inbox');
await rejectLinkedAncestors(inbox);
await mkdir(inbox, { recursive: true });
await mkdir(join(base, 'derived'), { recursive: true });
const files = {
  inventory: join(base, 'inventory.json'),
  annotations: join(base, 'annotations.json'),
  shortlist: join(base, 'shortlist.json'),
};
for (const file of Object.values(files)) await rejectLinkedAncestors(file);

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
async function saveJson(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, file);
}
const previous = await readJson(files.inventory, { version: 1, files: [] });
const annotations = await readJson(files.annotations, { version: 1, assets: {} });
if (previous.version !== 1 || !Array.isArray(previous.files) || annotations.version !== 1 || !annotations.assets || Array.isArray(annotations.assets)) {
  throw new Error('Unsupported or malformed inventory/annotation format; preserve the files and review them manually.');
}
const oldFiles = new Map(previous.files.map(file => [file.path, file]));
const types = new Map([
  ...['.jpg', '.jpeg', '.png', '.webp', '.avif', '.heic', '.heif', '.gif', '.tif', '.tiff'].map(ext => [ext, 'image']),
  ...['.mp4', '.mov', '.m4v', '.webm', '.avi'].map(ext => [ext, 'video']),
  ...['.mp3', '.wav', '.m4a', '.aac', '.ogg'].map(ext => [ext, 'audio']),
  ...['.pdf', '.docx', '.pptx'].map(ext => [ext, 'document']),
  ...['.csv', '.tsv', '.xlsx', '.json'].map(ext => [ext, 'data']),
  ...['.txt', '.md'].map(ext => [ext, 'text']),
]);
const currentFiles = [];
const warnings = [];
let hashed = 0;
let reused = 0;

async function walk(folder) {
  const entries = (await readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const path = join(folder, entry.name);
    const displayPath = relative(inbox, path).replaceAll('\\', '/');
    const info = await lstat(path);
    if (info.isSymbolicLink()) { warnings.push({ path: displayPath, reason: 'Skipped link/junction.' }); continue; }
    if (info.isDirectory()) { await walk(path); continue; }
    if (!info.isFile()) { warnings.push({ path: displayPath, reason: 'Skipped non-file.' }); continue; }
    const old = oldFiles.get(displayPath);
    let sha256;
    if (!rehash && old && old.bytes === info.size && old.modifiedMs === info.mtimeMs && old.changedMs === info.ctimeMs && /^[a-f0-9]{64}$/.test(old.sha256)) {
      sha256 = old.sha256;
      reused += 1;
    } else {
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(path)) hash.update(chunk);
      sha256 = hash.digest('hex');
      const after = await stat(path);
      if (after.size !== info.size || after.mtimeMs !== info.mtimeMs || after.ctimeMs !== info.ctimeMs) {
        throw new Error('An intake file changed while being hashed. Finish copying files, then run again.');
      }
      hashed += 1;
    }
    const type = types.get(extname(path).toLowerCase()) ?? 'unsupported';
    currentFiles.push({ path: displayPath, bytes: info.size, modifiedMs: info.mtimeMs, changedMs: info.ctimeMs, sha256, type, contentParsed: false });
    if (!annotations.assets[sha256]) {
      annotations.assets[sha256] = {
        status: 'unreviewed',
        summary: '',
        customerProblems: [],
        verifiedFacts: [],
        evidenceNotes: '',
        sourceOwner: '',
        permission: 'unknown',
        permissionEvidence: '',
        privacy: 'needs_review',
        redactionsNeeded: [],
        scores: { relevance: null, proof: null, visualUsability: null, permissionPrivacy: null, callToActionFit: null },
        recommendedPlacement: '',
        reviewedAt: null,
      };
    }
  }
}
await walk(inbox);
const groups = new Map();
for (const file of currentFiles) {
  if (!groups.has(file.sha256)) groups.set(file.sha256, []);
  groups.get(file.sha256).push(file);
}
const weights = { relevance: 30, proof: 25, visualUsability: 20, permissionPrivacy: 15, callToActionFit: 10 };
const ranked = [];
const waiting = [];
for (const [sha256, copies] of groups) {
  const note = annotations.assets[sha256];
  const validScores = Object.keys(weights).every(key => Number.isFinite(note?.scores?.[key]) && note.scores[key] >= 0 && note.scores[key] <= 5);
  const supported = copies.some(file => file.type !== 'unsupported');
  const eligible = supported && note?.status === 'reviewed' && note.permission === 'approved' && note.privacy === 'cleared' && validScores && typeof note.permissionEvidence === 'string' && note.permissionEvidence.trim() && typeof note.evidenceNotes === 'string' && note.evidenceNotes.trim();
  if (eligible) {
    const score = Math.round(Object.entries(weights).reduce((total, [key, weight]) => total + note.scores[key] / 5 * weight, 0));
    ranked.push({ sha256, paths: copies.map(file => file.path), score, summary: note.summary, customerProblems: note.customerProblems, recommendedPlacement: note.recommendedPlacement });
  } else waiting.push({ sha256, paths: copies.map(file => file.path), reason: supported ? 'Needs review, complete scores, evidence, and permission/privacy clearance.' : 'Unsupported type; needs manual review and a usable derivative.' });
}
ranked.sort((a, b) => b.score - a.score || a.sha256.localeCompare(b.sha256));
const generatedAt = new Date().toISOString();
const duplicates = [...groups.entries()].filter(([, copies]) => copies.length > 1).map(([sha256, copies]) => ({ sha256, paths: copies.map(file => file.path) }));
const summary = { files: currentFiles.length, uniqueAssets: groups.size, duplicateCopies: currentFiles.length - groups.size, hashed, reused, unsupportedFiles: currentFiles.filter(file => file.type === 'unsupported').length, rankedAssets: ranked.length, awaitingReview: waiting.length, warnings: warnings.length };
await saveJson(files.annotations, annotations); // Preserve annotations for removed or renamed assets.
await saveJson(files.inventory, { version: 1, generatedAt, typeDetection: 'Extension only; no content parsing.', summary, files: currentFiles, duplicates, warnings });
await saveJson(files.shortlist, { version: 1, generatedAt, purpose: 'Editorial review priority, not a prediction of lead volume or publication approval.', weights, ranked, awaitingReview: waiting });
console.log(JSON.stringify(summary));
