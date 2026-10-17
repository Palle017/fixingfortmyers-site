// Offline synthetic-state checkpoint. Call only after stopping the staging service.
// This does not export hosted D1/R2 and is not an off-host backup.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync, backup} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
const PURPOSE = 'bayone-vm101-synthetic-staging-v1';
const MARKER = '.bayone-staging.json';
async function digest(file) {
  const hash = createHash('sha256');
  for await (const part of fs.createReadStream(file)) hash.update(part);
  return hash.digest('hex');
}
export async function snapshotStaging(source, destination) {
  source = path.resolve(source); destination = path.resolve(destination);
  if (destination === source || destination.startsWith(source + path.sep)) throw Error('Snapshot must be outside source state');
  if (fs.existsSync(destination)) throw Error('Snapshot destination must be new');
  if (fs.realpathSync(source) !== source || JSON.parse(fs.readFileSync(path.join(source, MARKER), 'utf8')).purpose !== PURPOSE) {
    throw Error('Only explicitly marked synthetic staging data may be copied');
  }
  let existingParent = path.dirname(destination);
  while (!fs.existsSync(existingParent)) existingParent = path.dirname(existingParent);
  if (fs.realpathSync(existingParent) !== existingParent) throw Error('Snapshot destination must not resolve through a symlink');
  fs.mkdirSync(destination, {recursive: true, mode: 0o700});
  if (fs.realpathSync(destination) !== destination) throw Error('Snapshot destination must not resolve through a symlink');
  const files = [];
  async function copy(relative = '') {
    for (const entry of fs.readdirSync(path.join(source, relative), {withFileTypes: true})) {
      const name = path.join(relative, entry.name), from = path.join(source, name), to = path.join(destination, name);
      if (entry.isSymbolicLink()) throw Error('Snapshot does not follow symlinks');
      if (entry.isDirectory()) { fs.mkdirSync(to, {mode: 0o700}); await copy(name); continue; }
      if (!entry.isFile()) throw Error('Unexpected state entry');
      // A restored checkpoint can itself be checkpointed; replace its old manifest.
      if (!relative && entry.name === 'SNAPSHOT.json') continue;
      if (/\.sqlite3-(wal|shm)$/.test(entry.name)) continue;
      if (entry.name.endsWith('.sqlite3')) {
        const db = new DatabaseSync(from, {readOnly: true});
        try {
          if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw Error('Source database integrity failure');
          await backup(db, to);
        } finally { db.close(); }
      } else fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
      fs.chmodSync(to, 0o600);
      files.push({path: name, bytes: fs.statSync(to).size, sha256: await digest(to)});
    }
  }
  await copy();
  const manifest = {purpose: PURPOSE, syntheticOnly: true, createdAt: new Date().toISOString(),
    consistentAcrossFilesRequiresStoppedService: true, offHostBackup: false, files};
  fs.writeFileSync(path.join(destination, 'SNAPSHOT.json'), JSON.stringify(manifest, null, 2) + '\n', {flag: 'wx', mode: 0o600});
  return manifest;
}
export async function verifySnapshot(directory) {
  directory = path.resolve(directory);
  if (fs.realpathSync(directory) !== directory) throw Error('Snapshot directory must not resolve through a symlink');
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'SNAPSHOT.json'), 'utf8'));
  if (manifest.purpose !== PURPOSE || manifest.syntheticOnly !== true) throw Error('Unknown snapshot purpose');
  for (const entry of manifest.files) {
    const file = path.resolve(directory, entry.path);
    if (!file.startsWith(directory + path.sep) || fs.lstatSync(file).isSymbolicLink() || fs.realpathSync(file) !== file) throw Error('Invalid snapshot path');
    if (await digest(file) !== entry.sha256 || fs.statSync(file).size !== entry.bytes) throw Error('Snapshot checksum mismatch');
    if (file.endsWith('.sqlite3')) {
      const db = new DatabaseSync(file, {readOnly: true});
      try { if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw Error('Snapshot integrity failure'); }
      finally { db.close(); }
    }
  }
  return manifest;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.umask(0o077);
  if (process.argv[2] === 'verify' && process.argv.length === 4) {
    const result = await verifySnapshot(process.argv[3]); console.log(JSON.stringify({verifiedFiles: result.files.length, offHostBackup: false}));
  } else if (process.argv[2] === 'create' && process.argv.length === 5) {
    // The shell entrypoint stops the known service before calling this function.
    const result = await snapshotStaging(process.argv[3], process.argv[4]);
    await verifySnapshot(process.argv[4]); console.log(JSON.stringify({verifiedFiles: result.files.length, offHostBackup: false}));
  } else throw Error('Usage: snapshot-staging.mjs create SOURCE NEW_DESTINATION | verify SNAPSHOT');
}
