import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CharacterDirectoryStore,
  compileCastPrompt,
  createCastInstance,
  validateMatureCast,
  validateMatureConcept,
} from '../src/studio/character-directory.js';

async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), 'characters-'));
  let tick = 0;
  return {
    root,
    store: new CharacterDirectoryStore({
      filePath: path.join(root, 'characters.json'),
      now: () => new Date(`2026-08-05T12:00:0${tick++}.000Z`),
    }),
  };
}

test('directory appends character revisions and keeps old records available', async () => {
  const { store } = await setup();
  const created = await store.create({
    name: 'Rhea', role: 'host', fictional: true, age: 28, adultConfirmed: true,
    consentPosture: 'affirmative', sourcePosture: 'original', likenessPosture: 'fictional',
    appearance: { hair: 'black bob' }, wardrobe: ['silver jacket'],
  });
  const cast = createCastInstance(created, { wardrobe: ['red dress'] });
  const updated = await store.update(created.id, { wardrobe: ['white suit'] });
  assert.equal(updated.revision, 2);
  assert.equal((await store.list())[0].wardrobe[0], 'white suit');
  assert.equal((await store.get(created.id, 1)).wardrobe[0], 'silver jacket');
  assert.equal(cast.sourceSnapshot.wardrobe[0], 'silver jacket');
  assert.equal(cast.wardrobe[0], 'red dress');
});

test('mature concept rejects minor, coercive, incest, and animal sexual contexts', () => {
  for (const request of [
    'A teen nightclub scene.',
    'A forced erotic encounter.',
    'An incest fantasy.',
    'Bestiality imagery.',
  ]) assert.throws(() => validateMatureConcept(request), /mature-enabled generation rejects/);
  assert.equal(validateMatureConcept('Two fictional consenting adults age 28 at a private rooftop party.').eligible, true);
});

test('cast compilation records identity revisions and hashes local references', async () => {
  const { root, store } = await setup();
  const reference = path.join(root, 'rhea.png');
  await writeFile(reference, 'reference-image');
  const character = await store.create({
    name: 'Rhea', fictional: true, age: 28, adultConfirmed: true, consentPosture: 'affirmative',
    sourcePosture: 'original', likenessPosture: 'fictional', references: [{ path: reference }],
    promptTokens: ['distinctive amber eyes'], negativeConstraints: ['identity drift'],
  });
  const compiled = await compileCastPrompt([createCastInstance(character, { expression: 'laughing' })]);
  assert.equal(compiled[0].characterRevision, 1);
  assert.match(compiled[0].identity, /fictional adult age 28/);
  assert.match(compiled[0].identity, /distinctive amber eyes/);
  assert.match(compiled[0].references[0].sha256, /^[a-f0-9]{64}$/);
});

test('mature cast requires fictional adults age 25 or older with affirmative consent', async () => {
  const { store } = await setup();
  const eligible = await store.create({
    name: 'Rhea', fictional: true, age: 28, adultConfirmed: true, consentPosture: 'affirmative',
    sourcePosture: 'original', likenessPosture: 'fictional',
  });
  assert.equal(validateMatureCast([createCastInstance(eligible)]).eligible, true);
  const realPerson = await store.create({
    name: 'Known person', fictional: false, age: 30, adultConfirmed: true, consentPosture: 'affirmative',
    sourcePosture: 'operator-owned', likenessPosture: 'real-person', likenessEvidence: 'Release on file.',
  });
  assert.throws(() => validateMatureCast([createCastInstance(realPerson)]), /must be fictional/);
  const ambiguous = await store.create({
    name: 'Ambiguous', fictional: true, sourcePosture: 'original', likenessPosture: 'fictional',
  });
  assert.throws(() => validateMatureCast([createCastInstance(ambiguous)]), /age of 25 or older/);
});

test('named fictional IP stays available for private general work without becoming a real-person likeness', async () => {
  const { store } = await setup();
  const character = await store.create({
    name: 'Named fictional detective',
    fictional: true,
    sourcePosture: 'named-ip',
    likenessPosture: 'fictional',
    appearance: { coat: 'distinctive illustrated trench coat' },
  });
  const cast = createCastInstance(character, { wardrobe: ['private study outfit'] });
  const compiled = await compileCastPrompt([cast]);
  assert.equal(cast.sourceSnapshot.sourcePosture, 'named-ip');
  assert.equal(cast.sourceSnapshot.likenessPosture, 'fictional');
  assert.match(compiled[0].identity, /private study outfit/);
});
