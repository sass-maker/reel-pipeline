#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const retiredPaths = [
  'src/saas-maker-client.js',
  'src/autopilot.js',
  'src/posting.js',
  'reel/src/saas_maker.rs',
  'reel/src/autopilot.rs',
  'reel/src/marketing_posting.rs',
];
const runtimeRoots = [
  'src',
  'scripts',
  'reel/src',
];
const forbidden = [
  'SAASMAKER_SESSION_TOKEN',
  'SaaSMakerClient',
  '/api/marketing/posts',
  'marketing-control-service',
  'npm run post:ready',
  'npm run render:accepted',
];
const failures = [];

for (const path of retiredPaths) {
  if (existsSync(resolve(root, path))) failures.push(`retired path exists: ${path}`);
}
for (const directory of runtimeRoots) {
  for (const file of files(resolve(root, directory))) {
    if (file === import.meta.filename) continue;
    const text = readFileSync(file, 'utf8');
    for (const token of forbidden) {
      if (text.includes(token)) failures.push(`retired token ${JSON.stringify(token)} in ${relative(root, file)}`);
    }
  }
}

if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
console.log('retired marketing boundaries: clean');

function files(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return files(path);
    if (!statSync(path).isFile() || !/\.(?:js|mjs|ts|tsx|astro|rs|sh)$/u.test(entry.name)) return [];
    return [path];
  });
}
