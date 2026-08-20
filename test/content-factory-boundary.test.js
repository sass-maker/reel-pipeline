import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import test from 'node:test';

const contentFactoryRoot = 'content-factory';
const forbiddenImport = /(?:^|\/)(?:publishers?|posting|social-publishers?|oauth|credentials?|secrets?|tokens?|schedulers?|analytics|metrics)(?:\/|$)/i;

test('Content Factory imports no social distribution, OAuth, credential, scheduler, or analytics modules', () => {
  const violations = [];
  const files = collectSourceFiles(contentFactoryRoot);
  assert.ok(files.length > 0);
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const specifier of importSpecifiers(source)) {
      if (
        forbiddenImport.test(specifier)
        || specifier.includes('workers/api/src/adapters/postiz')
        || specifier.includes('foundry/marketing/reel-pipeline/src/postiz')
      ) {
        violations.push(`${file} -> ${specifier}`);
      }
    }
    if (/(?:process\.env|\benv)\.(?:POSTIZ|INSTAGRAM|YOUTUBE|TIKTOK|FACEBOOK)[A-Z0-9_]*/.test(source)) {
      violations.push(`${file} reads a social-provider credential directly`);
    }
  }
  assert.deepEqual(violations, []);
});

test('Content Factory has no production dependencies', () => {
  const packageJson = JSON.parse(readFileSync(`${contentFactoryRoot}/package.json`, 'utf8'));
  assert.equal(packageJson.dependencies, undefined);
});

function collectSourceFiles(path) {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return /\.[cm]?[jt]sx?$/.test(path) ? [path] : [];
  return readdirSync(path).flatMap((entry) => collectSourceFiles(`${path}/${entry}`));
}

function importSpecifiers(source) {
  return [...source.matchAll(/(?:from\s*|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/g)]
    .map((match) => match[1])
    .filter(Boolean);
}
