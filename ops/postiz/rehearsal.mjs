#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const STATE_DIRECTORIES = [
  'postiz-config',
  'postiz-uploads',
  'postgres',
  'redis',
  'temporal-postgres',
  'temporal-elasticsearch',
];

function fail(message) {
  throw new Error(message);
}

function files(root, current = root) {
  return readdirSync(current, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const path = resolve(current, entry.name);
      return entry.isDirectory() ? files(root, path) : [relative(root, path)];
    });
}

function inventory(root) {
  return Object.fromEntries(files(root).map((name) => [
    name,
    createHash('sha256').update(readFileSync(resolve(root, name))).digest('hex'),
  ]));
}

function copyState(source, destination) {
  mkdirSync(destination, { recursive: true });
  for (const name of STATE_DIRECTORIES) {
    const path = resolve(source, name);
    if (!statSync(path).isDirectory()) fail('Disposable source state is incomplete.');
    cpSync(path, resolve(destination, name), { recursive: true, errorOnExist: true });
  }
}

export function runDisposableRehearsal(root, {
  currentRelease = 'v2.22.1',
  candidateRelease = 'v2.22.1-fixture-candidate',
  now = new Date(),
} = {}) {
  if (!isAbsolute(root) || resolve(root) === '/' || readdirSync(root).length !== 0) {
    fail('The disposable rehearsal root must be an explicit empty directory.');
  }
  const source = resolve(root, 'source');
  for (const name of STATE_DIRECTORIES) {
    const directory = resolve(source, name);
    mkdirSync(directory, { recursive: true });
    writeFileSync(resolve(directory, 'fixture-state.txt'), `${currentRelease}:${name}\n`);
  }

  const snapshot = resolve(root, 'backup', currentRelease);
  copyState(source, snapshot);
  const expected = inventory(snapshot);

  const candidate = resolve(root, 'candidate-restore');
  copyState(snapshot, candidate);
  if (JSON.stringify(inventory(candidate)) !== JSON.stringify(expected)) fail('Candidate restore checksum verification failed.');
  writeFileSync(resolve(candidate, 'postiz-config', 'candidate-release.txt'), `${candidateRelease}\n`);

  const rollback = resolve(root, 'rollback-restore');
  copyState(snapshot, rollback);
  if (JSON.stringify(inventory(rollback)) !== JSON.stringify(expected)) fail('Rollback restore checksum verification failed.');

  const verifiedAt = new Date(now);
  if (!Number.isFinite(verifiedAt.getTime())) fail('The rehearsal timestamp is invalid.');
  const receipt = {
    schemaVersion: 1,
    kind: 'postiz-restore-rehearsal',
    result: 'verified',
    sourceRelease: currentRelease,
    candidateRelease,
    verifiedAt: verifiedAt.toISOString(),
    stateDirectories: STATE_DIRECTORIES.length,
    filesVerified: Object.keys(expected).length,
  };
  writeFileSync(resolve(root, 'restore-rehearsal-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

function parseRoot(args) {
  if (args.length !== 2 || args[0] !== '--root') fail('usage: rehearsal.mjs --root <empty-absolute-directory>');
  return args[1];
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    process.stdout.write(`${JSON.stringify(runDisposableRehearsal(parseRoot(process.argv.slice(2))), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: 'REHEARSAL_FAILED', message: error.message })}\n`);
    process.exitCode = 1;
  }
}
