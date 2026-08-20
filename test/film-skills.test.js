import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  FILM_SKILL_SCHEMA,
  assertForgeJobFilmSkill,
  bindFilmManifestToSkill,
  filmSkillExecutionContract,
  listFilmSkills,
  normalizeFilmSkill,
  prepareFilmSkillForgeExecution,
  resolveFilmSkill,
} from '../src/film-skills.js';

const referenceManifestUrl = new URL(
  '../examples/coherent-films/codevetter-evidence-beam.json',
  import.meta.url,
);
const guidedTemplateUrl = new URL(
  '../examples/coherent-films/guided-app-demo.template.json',
  import.meta.url,
);

async function referenceManifest() {
  return JSON.parse(await readFile(referenceManifestUrl, 'utf8'));
}

function skillBoundForgeJob() {
  const sha256 = 'b'.repeat(64);
  return {
    filmSkill: {
      ref: 'evidence-beam@1',
      contract: filmSkillExecutionContract('evidence-beam@1'),
    },
    brief: {
      prompt: 'Turn uncertainty into one qualified verdict.',
      context: 'Use approved product evidence and preserve publication rights.',
    },
    project: { aspectRatio: '9:16' },
    shot: {
      keyframeApproved: true,
      preview: { preset: 'preview', seeds: [41, 42, 43] },
    },
    keyframe: {
      sha256,
      provenance: {
        sourceType: 'real-capture',
        sourceRevision: 'c59097fa',
        rights: { tier: 'production-safe', license: 'operator-owned', approved: true },
      },
    },
    review: {
      selection: { variantId: 'seed-42', seed: 42, sourceSha256: sha256 },
    },
    finalRender: {
      approvedVariantId: 'seed-42',
      seed: 42,
      sourceSha256: sha256,
    },
  };
}

function guidedAppDemoJob() {
  const sha256 = 'a'.repeat(64);
  return {
    filmSkill: {
      ref: 'guided-app-demo@1',
      contract: filmSkillExecutionContract('guided-app-demo@1'),
    },
    brief: {
      prompt: 'Guide the viewer through one real product action.',
      context: 'Use the approved app and same-session presenter capture.',
    },
    project: { aspectRatio: '9:16' },
    sourceCapture: {
      assetKey: 'video-forge/captures/capture-1.webm',
      sha256,
      approval: { approved: true },
      provenance: {
        sourceType: 'real-capture',
        sourceRevision: 'app-revision-c59097fa',
        rights: { tier: 'production-safe', license: 'operator-owned', approved: true },
      },
      presenter: { mode: 'same-session', sync: 'same-session' },
    },
    review: {
      selection: {
        variantId: 'capture-preview',
        seed: null,
        sourceSha256: sha256,
      },
    },
    finalRender: {
      approvedVariantId: 'capture-preview',
      seed: null,
      sourceSha256: sha256,
    },
  };
}

test('registers a complete immutable evidence-beam@1 recipe', async () => {
  const skill = resolveFilmSkill('evidence-beam@1');

  assert.equal(skill.schema, FILM_SKILL_SCHEMA);
  assert.equal(skill.ref, 'evidence-beam@1');
  assert.deepEqual(
    skill.narrative.roleSequence,
    ['setup', 'tension', 'analysis', 'analysis', 'verdict', 'close'],
  );
  assert.ok(skill.assetRequirements.some((requirement) => requirement.id === 'product-evidence'));
  assert.ok(skill.scenePrimitives.includes('evidence-path'));
  assert.ok(skill.qualityGates.length >= 4);
  assert.ok(skill.reference.manifest.endsWith('codevetter-evidence-beam.json'));
  assert.ok(skill.reference.frames.length > 0);
  await Promise.all(skill.reference.frames.map((frame) => (
    access(new URL(`../${frame.path}`, import.meta.url))
  )));
  assert.ok(skill.knownFailureModes.length > 0);
  assert.ok(skill.notWhen.length > 0);

  skill.defaults.visual.palette = 'mutated by caller';
  assert.notEqual(
    resolveFilmSkill('evidence-beam@1').defaults.visual.palette,
    'mutated by caller',
  );
  assert.deepEqual(
    listFilmSkills().map((entry) => entry.ref),
    ['evidence-beam@1', 'guided-app-demo@1'],
  );
});

test('registers guided-app-demo@1 with authentic presenter and capture gates', () => {
  const skill = resolveFilmSkill('guided-app-demo@1');

  assert.equal(skill.defaults.visual.presenter.position, 'bottom-right');
  assert.equal(skill.defaults.voice.lipSyncRequired, true);
  assert.ok(skill.scenePrimitives.includes('presenter-pip'));
  assert.deepEqual(
    skill.qualityGates.map((gate) => gate.id),
    [
      'real-app-capture',
      'authentic-presenter-sync',
      'presenter-safe-area',
      'mobile-legibility',
      'publication-rights',
    ],
  );
});

test('guided app-demo reference template pins capture, presenter, and delivery rules', async () => {
  const template = JSON.parse(await readFile(guidedTemplateUrl, 'utf8'));
  const skill = resolveFilmSkill('guided-app-demo@1');

  assert.equal(skill.reference.manifest, 'examples/coherent-films/guided-app-demo.template.json');
  assert.equal(template.filmSkill.ref, skill.ref);
  assert.equal(template.workflow.maximumDurationSeconds, 90);
  assert.equal(template.workflow.approvalRequiredBeforeUpload, true);
  assert.equal(template.workflow.presenter.sync, 'same-session');
  assert.equal(template.composition.presenterWidthFraction, 0.24);
  assert.equal(template.render.preserveApprovedSourceSha256, true);
});

test('binds the reference manifest to an exact skill version', async () => {
  const input = await referenceManifest();
  const film = bindFilmManifestToSkill(input);

  assert.deepEqual(film.filmSkill, {
    id: 'evidence-beam',
    version: 1,
    ref: 'evidence-beam@1',
  });
  assert.deepEqual(input.filmSkill, { id: 'evidence-beam', version: 1 });
});

test('rejects unpinned, latest, and unknown skill versions', async () => {
  const input = await referenceManifest();
  delete input.filmSkill;

  assert.throws(
    () => bindFilmManifestToSkill(input, 'evidence-beam'),
    /must pin an exact version/,
  );
  assert.throws(
    () => bindFilmManifestToSkill(input, 'evidence-beam@latest'),
    /must pin an exact version/,
  );
  assert.throws(
    () => bindFilmManifestToSkill(input, 'evidence-beam@2'),
    /unknown film skill version/,
  );
});

test('rejects a requested version that differs from the manifest pin', async () => {
  const input = await referenceManifest();
  input.filmSkill = { id: 'evidence-beam', version: 1 };

  assert.throws(
    () => bindFilmManifestToSkill(input, { id: 'evidence-beam', version: 2 }),
    /manifest pins evidence-beam@1 but binding requested evidence-beam@2/,
  );
});

test('rejects role, primitive, and asset drift from the pinned recipe', async () => {
  const wrongRole = await referenceManifest();
  wrongRole.scenes[2].role = 'proof';
  assert.throws(
    () => bindFilmManifestToSkill(wrongRole, 'evidence-beam@1'),
    /requires role sequence/,
  );

  const wrongPrimitive = await referenceManifest();
  wrongPrimitive.scenes[2].dominant.kind = 'ascii';
  assert.throws(
    () => bindFilmManifestToSkill(wrongPrimitive, 'evidence-beam@1'),
    /does not allow scene primitive ascii/,
  );

  const missingEvidence = await referenceManifest();
  for (const capture of missingEvidence.assets.filter((asset) => asset.sourceType === 'real-capture')) {
    capture.sourceType = 'fleet-authored-graphic';
    capture.evidence = false;
  }
  assert.throws(
    () => bindFilmManifestToSkill(missingEvidence, 'evidence-beam@1'),
    /requires at least 1 product-evidence asset/,
  );

  const unregisteredAsset = await referenceManifest();
  unregisteredAsset.assets.push({
    id: 'decorative-ascii',
    kind: 'text',
    source: 'generated:ascii',
    sourceType: 'deterministic-graphic',
    license: 'Fleet-owned',
    tier: 'production-safe',
    evidence: false,
  });
  assert.throws(
    () => bindFilmManifestToSkill(unregisteredAsset, 'evidence-beam@1'),
    /does not permit asset decorative-ascii/,
  );
});

test('validates the film-skill contract itself', () => {
  const skill = resolveFilmSkill('evidence-beam@1');
  skill.narrative.roleSequence[0] = 'montage';

  assert.throws(
    () => normalizeFilmSkill(skill),
    /unsupported role montage/,
  );
});

test('skill-bound forge execution preserves defaults and quality gates for preview and final', () => {
  const job = skillBoundForgeJob();
  const preview = assertForgeJobFilmSkill(job, { renderKind: 'preview' });
  assert.equal(preview.preset, 'preview');
  assert.deepEqual(preview.seeds, [41, 42, 43]);
  assert.deepEqual(preview.qualityGateIds, [
    'single-story',
    'real-evidence',
    'mobile-legibility',
    'publication-rights',
  ]);

  const final = assertForgeJobFilmSkill(job, { renderKind: 'final' });
  assert.equal(final.preset, 'final');
  assert.deepEqual(final.seeds, [42]);

  const prepared = prepareFilmSkillForgeExecution(job, {
    renderKind: 'final',
    keyframePath: '/tmp/approved.png',
  });
  assert.equal(prepared.shot.preview.preset, 'final');
  assert.deepEqual(prepared.shot.preview.seeds, [42]);
  assert.equal(prepared.shot.keyframePath, '/tmp/approved.png');
});

test('guided app-demo execution preserves the approved source hash across preview and final', () => {
  const job = guidedAppDemoJob();
  const preview = assertForgeJobFilmSkill(job, { renderKind: 'preview' });
  assert.equal(preview.preset, 'guided-preview');
  assert.equal(preview.sourceSha256, job.sourceCapture.sha256);
  assert.deepEqual(preview.seeds, []);

  const final = assertForgeJobFilmSkill(job, { renderKind: 'final' });
  assert.equal(final.preset, 'guided-final');
  assert.equal(final.sourceSha256, job.sourceCapture.sha256);

  job.sourceCapture.presenter.sync = 'unverified';
  assert.throws(
    () => assertForgeJobFilmSkill(job, { renderKind: 'preview' }),
    /authentic-presenter-sync/,
  );
});

test('skill-bound forge execution rejects contract drift and unrevisioned evidence', () => {
  const drifted = skillBoundForgeJob();
  drifted.filmSkill.contract.defaults.motion.pace = 'unbounded';
  assert.throws(
    () => assertForgeJobFilmSkill(drifted),
    /contract drifted/,
  );

  const unrevisioned = skillBoundForgeJob();
  unrevisioned.keyframe.provenance.sourceRevision = null;
  assert.throws(
    () => assertForgeJobFilmSkill(unrevisioned),
    /real-evidence and publication-rights quality gates/,
  );

  const changedKeyframe = skillBoundForgeJob();
  changedKeyframe.finalRender.sourceSha256 = 'c'.repeat(64);
  assert.throws(
    () => assertForgeJobFilmSkill(changedKeyframe, { renderKind: 'final' }),
    /preserve the approved keyframe hash/,
  );
});
