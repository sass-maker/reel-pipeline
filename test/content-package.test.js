import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CONTENT_PACKAGE_SCHEMA,
  buildProposedVariant,
  contentPackageToVideoBrief,
  normalizeContentPackage,
} from '../src/content-package.js';
import { extractContentPackages } from '../src/content-extractors.js';

const NOW = new Date('2026-07-12T12:00:00.000Z');

function validPackage(overrides = {}) {
  const base = {
    schema: CONTENT_PACKAGE_SCHEMA,
    id: 'high-signal:proof-one', revision: 1, createdAt: NOW.toISOString(),
    brand: { slug: 'high-signal' },
    source: { adapter: 'high-signal-reel-briefs', sourceId: 'proof-one', canonicalUrl: 'https://highsignal.app/evidence/proof-one', generatedAt: NOW.toISOString() },
    topic: {
      title: 'Evidence changes the decision', summary: 'A concise evidence-backed summary.', audience: 'Product builders',
      destinationUrl: 'https://highsignal.app/brief',
      claims: [{ text: 'One visible proof changes trust.', evidenceUrls: ['https://highsignal.app/evidence/proof-one'] }],
    },
    approval: { status: 'proposed', approvedAt: null, approvedBy: null },
    variants: [buildProposedVariant({ brandSlug: 'high-signal', hook: 'Show the proof, not the promise.', summary: 'A concise evidence-backed summary.', proof: 'One visible proof changes trust.', cta: 'Read the evidence.' })],
  };
  return { ...base, ...overrides };
}

test('normalizes a source-backed brand content package', () => {
  const contentPackage = normalizeContentPackage(validPackage());
  assert.equal(contentPackage.brand.name, 'High Signal');
  assert.equal(contentPackage.topic.claims[0].evidenceUrls.length, 1);
  assert.equal(contentPackage.variants[0].status, 'proposed');
});

test('refuses media production before package and variant approval', () => {
  assert.throws(() => contentPackageToVideoBrief(validPackage()), /package must be approved/);
});

test('maps an approved package revision to an attributable VideoBrief', () => {
  const input = validPackage();
  input.approval = { status: 'approved', approvedAt: NOW.toISOString(), approvedBy: 'owner' };
  input.variants[0].status = 'approved';
  const brief = contentPackageToVideoBrief(input);
  assert.equal(brief.projectSlug, 'high-signal');
  assert.equal(brief.channel, 'youtube_shorts');
  assert.match(brief.id, /proof-one-r1-vertical-proof-v1/);
  assert.match(brief.body, /Source package: high-signal:proof-one revision 1/);
});

test('extracts proposed packages from specialized and project campaign sources', async () => {
  const fleetRoot = await mkdtemp(path.join(os.tmpdir(), 'fleet-content-'));
  await mkdir(path.join(fleetRoot, 'high-signal', 'data'), { recursive: true });
  await writeFile(path.join(fleetRoot, 'high-signal', 'data', 'personal-reel-briefs.jsonl'), `${JSON.stringify({
    generatedAt: NOW.toISOString(),
    reelBriefs: [{ id: 'reel-proof', productSlug: 'high-signal', title: 'Proof signal', hook: 'Where is the proof?', humanTension: 'Builders need evidence.', proofBeat: 'The source shows the result.', visualBeats: ['Hook', 'Evidence', 'Action'], cta: 'Read the signal.', evidenceUrls: ['https://highsignal.app/evidence/proof'] }],
  })}\n`);

  await mkdir(path.join(fleetRoot, 'significanthobbies', 'src', 'lib'), { recursive: true });
  await writeFile(path.join(fleetRoot, 'significanthobbies', 'src', 'lib', 'blog-posts.ts'), `export const blogPosts = [{ slug: 'try-one-thing', title: 'Try One Thing', excerpt: 'Small experiments make hobbies easier to start.', category: 'Practice', content: [{ type: 'paragraph', text: 'A ten-minute experiment lowers the cost of beginning.' }] }];`);

  await mkdir(path.join(fleetRoot, 'swe-interview-prep', 'src', 'data'), { recursive: true });
  await writeFile(path.join(fleetRoot, 'swe-interview-prep', 'src', 'data', 'learning-sources.json'), JSON.stringify({
    generatedAt: NOW.toISOString(),
    items: [{ id: 'project:demo:vectors', sourceKind: 'project', title: 'Vectors', summary: 'Vectors carry magnitude and direction.', resources: [{ url: 'https://example.com/vectors' }] }],
  }));

  for (const project of ['aliveville', 'karte', 'rolepatch']) {
    await mkdir(path.join(fleetRoot, project), { recursive: true });
    await writeFile(path.join(fleetRoot, project, 'PROJECT_STATUS.md'), `# ${project}\n\nCurrent product facts.\n`);
  }

  const packages = await extractContentPackages('all', { fleetRoot, limit: 1, now: () => NOW });
  assert.deepEqual(packages.map((entry) => entry.brand.slug).sort(), ['aliveville', 'high-signal', 'karte', 'rolepatch', 'significanthobbies', 'swe-interview-prep']);
  assert.ok(packages.every((entry) => entry.approval.status === 'proposed'));
  assert.ok(packages.every((entry) => entry.variants.map((variant) => variant.channel).sort().join(',') === 'instagram_reels,youtube_shorts'));
  assert.ok(packages.every((entry) => entry.topic.claims[0].evidenceUrls.length > 0));
});

test('rejects unsupported brands and source-less claims', () => {
  assert.throws(() => normalizeContentPackage(validPackage({ brand: { slug: 'unknown' } })), /unknown brand/);
  const input = validPackage();
  input.topic.claims[0].evidenceUrls = [];
  assert.throws(() => normalizeContentPackage(input), /must contain at least one URL/);
});
