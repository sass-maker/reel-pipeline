import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildProposedVariant, CONTENT_PACKAGE_SCHEMA } from '../src/content-package.js';
import {
  automationIdempotencyKey,
  classifyMajorChange,
  discoverAutomationSources,
  parseProjectTimeline,
} from '../src/studio/autopilot-sources.js';

const NOW = new Date('2026-07-31T12:00:00.000Z');
const PACKAGE = {
  schema: CONTENT_PACKAGE_SCHEMA,
  id: 'high-signal:daily-proof',
  revision: 3,
  createdAt: NOW.toISOString(),
  brand: { slug: 'high-signal' },
  source: {
    adapter: 'high-signal-reel-briefs',
    sourceId: 'daily-proof',
    canonicalUrl: 'https://highsignal.app/briefs/daily-proof',
    generatedAt: NOW.toISOString(),
  },
  topic: {
    title: 'Proof changes the decision',
    summary: 'One visible proof makes the decision easier.',
    audience: 'Product builders',
    destinationUrl: 'https://highsignal.app/briefs/daily-proof',
    claims: [{ text: 'Visible evidence improves trust.', evidenceUrls: ['https://highsignal.app/briefs/daily-proof'] }],
  },
  approval: { status: 'proposed', approvedAt: null, approvedBy: null },
  variants: [
    buildProposedVariant({ id: 'yt', channel: 'youtube_shorts', brandSlug: 'high-signal', hook: 'Show the proof.', summary: 'Proof first.', proof: 'Visible evidence improves trust.', cta: 'Read it.' }),
    buildProposedVariant({ id: 'ig', channel: 'instagram_reels', brandSlug: 'high-signal', hook: 'Show the proof.', summary: 'Proof first.', proof: 'Visible evidence improves trust.', cta: 'Read it.' }),
  ],
};

function policy(overrides = {}) {
  return {
    id: 'high-signal-daily', revision: 1, maxItemsPerRun: 1,
    scope: { type: 'project', projectSlug: 'high-signal' },
    source: { adapter: 'high-signal' },
    channels: ['instagram_reels', 'youtube_shorts'],
    ...overrides,
  };
}

test('reuses specialized content-package extractors and makes stable source identities', async () => {
  const calls = [];
  const [first] = await discoverAutomationSources(policy(), {
    fleetRoot: '/fixture/fleet',
    extractor: async (adapter, options) => {
      calls.push({ adapter, options });
      return [structuredClone(PACKAGE)];
    },
  });
  const [second] = await discoverAutomationSources(policy(), {
    extractor: async () => {
      const sameContentLater = structuredClone(PACKAGE);
      sameContentLater.createdAt = '2026-08-01T12:00:00.000Z';
      sameContentLater.source.generatedAt = '2026-08-01T12:00:00.000Z';
      return [sameContentLater];
    },
  });

  assert.equal(calls[0].adapter, 'high-signal');
  assert.equal(calls[0].options.fleetRoot, '/fixture/fleet');
  assert.equal(first.eligibility.eligible, true);
  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(first.contentPackage.id, PACKAGE.id);
  assert.equal(
    automationIdempotencyKey(policy(), first, 'youtube_shorts'),
    automationIdempotencyKey(policy(), second, 'youtube_shorts'),
  );
});

test('source revisions change fingerprints and missing channel variants fail closed', async () => {
  const revisedPackage = structuredClone(PACKAGE);
  revisedPackage.revision = 4;
  revisedPackage.topic.summary = 'The revised evidence changes the decision again.';
  const [original] = await discoverAutomationSources(policy(), { extractor: async () => [structuredClone(PACKAGE)] });
  const [revised] = await discoverAutomationSources(policy(), { extractor: async () => [revisedPackage] });
  assert.notEqual(revised.fingerprint, original.fingerprint);

  const incompletePackage = structuredClone(PACKAGE);
  incompletePackage.variants = incompletePackage.variants.filter((variant) => variant.channel === 'youtube_shorts');
  const [incomplete] = await discoverAutomationSources(policy(), { extractor: async () => [incompletePackage] });
  assert.deepEqual(incomplete.eligibility, { eligible: false, reason: 'missing-instagram_reels-variant' });
});

test('parses multiline timeline entries and classifies maintenance conservatively', () => {
  const entries = parseProjectTimeline(`# Demo\n\n## Timeline\n\n- **2026-07-31 — Shared launch:** Shipped a public dashboard\n  with export controls.\n- **2026-07-30:** Fixed a typo in internal docs.\n\n## Products\n`);
  assert.deepEqual(entries, [
    { date: '2026-07-31', title: 'Shared launch', text: 'Shared launch: Shipped a public dashboard with export controls.' },
    { date: '2026-07-30', title: null, text: 'Fixed a typo in internal docs.' },
  ]);
  assert.deepEqual(classifyMajorChange(entries[0].text), { eligible: true, reason: 'major-user-visible-change' });
  assert.deepEqual(classifyMajorChange(entries[1].text), { eligible: false, reason: 'maintenance-only' });
  assert.deepEqual(classifyMajorChange('Adjusted behavior around edge cases.'), { eligible: false, reason: 'ambiguous-impact' });
  assert.deepEqual(
    classifyMajorChange('Promoted recurring entities into the seed gazetteer and added them to existing adapters.'),
    { eligible: false, reason: 'maintenance-only' },
  );
});

test('discovers maintained public changelogs and explains ineligible projects and entries', async () => {
  const fleetRoot = await mkdtemp(path.join(os.tmpdir(), 'studio-changelog-'));
  const catalogPath = path.join(fleetRoot, 'projects.json');
  const projects = [
    maintainedProject('high-signal', 'high-signal', 'highsignal.app'),
    maintainedProject('unmapped', 'unmapped', 'unmapped.test'),
  ];
  await writeFile(catalogPath, JSON.stringify({ projects }));
  await mkdir(path.join(fleetRoot, 'high-signal'), { recursive: true });
  await writeFile(path.join(fleetRoot, 'high-signal', 'PROJECT_STATUS.md'), `# High Signal\n\n## Timeline\n\n- **2026-07-31 — Public workspaces:** Launched shared evidence workspaces.\n- **2026-07-30 — Cleanup:** Refactored internal tests.\n\n## Products\n`);

  const results = await discoverAutomationSources(policy({
    id: 'major-project-changelog',
    scope: { type: 'project', projectSlug: '*' },
    source: { adapter: 'major-project-changelog' },
  }), { fleetRoot, catalogPath, configuredBrands: ['high-signal'] });

  assert.equal(results.length, 3);
  assert.equal(results[0].eligibility.eligible, true);
  assert.equal(results[0].canonicalUrl, 'https://highsignal.app/changelog');
  assert.equal(results.some((entry) => entry.eligibility.reason === 'maintenance-only'), true);
  assert.equal(results.some((entry) => entry.eligibility.reason === 'missing-channel-mapping'), true);
});

function maintainedProject(id, repo, domain) {
  return {
    id, repo, name: id, lifecycle: 'maintained', domains: [domain],
    public: { listing: 'maintained' },
  };
}
