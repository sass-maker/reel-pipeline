import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const CHARACTER_DIRECTORY_SCHEMA = 'fleet.character-directory.v1';
export const CHARACTER_SCHEMA = 'fleet.character.v1';
export const CAST_INSTANCE_SCHEMA = 'fleet.cast-instance.v1';

const SOURCE_POSTURES = new Set(['original', 'operator-owned', 'licensed', 'named-ip']);
const LIKENESS_POSTURES = new Set(['fictional', 'real-person']);
const CONSENT_POSTURES = new Set(['affirmative', 'not-applicable', 'unknown']);

export class CharacterDirectoryStore {
  constructor(options = {}) {
    this.filePath = path.resolve(options.filePath ?? './tmp/studio/characters.json');
    this.now = options.now ?? (() => new Date());
  }

  async loadAll() {
    try {
      const input = JSON.parse(await readFile(this.filePath, 'utf8'));
      if (input.schema !== CHARACTER_DIRECTORY_SCHEMA || !Array.isArray(input.characters)) {
        throw new Error(`character directory must use ${CHARACTER_DIRECTORY_SCHEMA}`);
      }
      return input.characters.map(normalizeCharacter);
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async persist(characters) {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, `${JSON.stringify({ schema: CHARACTER_DIRECTORY_SCHEMA, characters }, null, 2)}\n`);
    await rename(temporary, this.filePath);
  }

  async list() {
    const latest = new Map();
    for (const character of await this.loadAll()) {
      const current = latest.get(character.id);
      if (!current || character.revision > current.revision) latest.set(character.id, character);
    }
    return [...latest.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((entry) => structuredClone(entry));
  }

  async get(id, revision = null) {
    const matches = (await this.loadAll()).filter((entry) => entry.id === id);
    const character = revision == null
      ? matches.sort((a, b) => b.revision - a.revision)[0]
      : matches.find((entry) => entry.revision === Number(revision));
    return character ? structuredClone(character) : null;
  }

  async create(input = {}) {
    const characters = await this.loadAll();
    const timestamp = this.now().toISOString();
    const character = normalizeCharacter({
      ...input,
      schema: CHARACTER_SCHEMA,
      id: input.id ?? `character_${timestamp.replace(/\D/g, '').slice(0, 14)}_${characters.length + 1}`,
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    if (characters.some((entry) => entry.id === character.id)) throw new Error(`character already exists: ${character.id}`);
    characters.push(character);
    await this.persist(characters);
    return structuredClone(character);
  }

  async update(id, patch = {}) {
    const characters = await this.loadAll();
    const current = characters.filter((entry) => entry.id === id).sort((a, b) => b.revision - a.revision)[0];
    if (!current) throw new Error(`character not found: ${id}`);
    const next = normalizeCharacter({
      ...current,
      ...patch,
      schema: CHARACTER_SCHEMA,
      id,
      revision: current.revision + 1,
      createdAt: current.createdAt,
      updatedAt: this.now().toISOString(),
    });
    characters.push(next);
    await this.persist(characters);
    return structuredClone(next);
  }
}

export function normalizeCharacter(input = {}) {
  if (input.schema !== CHARACTER_SCHEMA) throw new Error(`character must use ${CHARACTER_SCHEMA}`);
  const sourcePosture = SOURCE_POSTURES.has(input.sourcePosture) ? input.sourcePosture : 'original';
  const likenessPosture = LIKENESS_POSTURES.has(input.likenessPosture) ? input.likenessPosture : 'fictional';
  return {
    schema: CHARACTER_SCHEMA,
    id: requiredString(input.id, 'character.id'),
    revision: positiveInteger(input.revision, 'character.revision'),
    createdAt: iso(input.createdAt, 'character.createdAt'),
    updatedAt: iso(input.updatedAt, 'character.updatedAt'),
    name: requiredString(input.name, 'character.name'),
    role: optionalString(input.role),
    fictional: likenessPosture === 'fictional' && input.fictional !== false,
    age: optionalAge(input.age),
    adultConfirmed: input.adultConfirmed === true,
    consentPosture: CONSENT_POSTURES.has(input.consentPosture) ? input.consentPosture : 'unknown',
    appearance: normalizeStringMap(input.appearance),
    wardrobe: stringList(input.wardrobe, 20),
    palette: stringList(input.palette, 12),
    promptTokens: stringList(input.promptTokens, 40),
    negativeConstraints: stringList(input.negativeConstraints, 40),
    continuityNotes: optionalString(input.continuityNotes),
    references: normalizeReferences(input.references),
    sourcePosture,
    likenessPosture,
    likenessEvidence: optionalString(input.likenessEvidence),
  };
}

export function createCastInstance(character, overrides = {}) {
  const source = normalizeCharacter(character);
  return {
    schema: CAST_INSTANCE_SCHEMA,
    id: optionalString(overrides.id) ?? `cast_${source.id}`,
    characterId: source.id,
    characterRevision: source.revision,
    name: source.name,
    role: optionalString(overrides.role) ?? source.role,
    wardrobe: stringList(overrides.wardrobe, 20).length ? stringList(overrides.wardrobe, 20) : source.wardrobe,
    expression: optionalString(overrides.expression),
    continuityNotes: optionalString(overrides.continuityNotes) ?? source.continuityNotes,
    sourceSnapshot: structuredClone(source),
  };
}

export function normalizeCastInstance(input = {}) {
  if (input.schema !== CAST_INSTANCE_SCHEMA) throw new Error(`cast instance must use ${CAST_INSTANCE_SCHEMA}`);
  const sourceSnapshot = normalizeCharacter(input.sourceSnapshot);
  if (sourceSnapshot.id !== input.characterId || sourceSnapshot.revision !== Number(input.characterRevision)) {
    throw new Error('cast instance source snapshot does not match its character revision');
  }
  return createCastInstance(sourceSnapshot, input);
}

export async function compileCastPrompt(cast = []) {
  if (!Array.isArray(cast)) throw new Error('cast must be an array');
  const compiled = [];
  for (const raw of cast) {
    const instance = normalizeCastInstance(raw);
    const source = instance.sourceSnapshot;
    const referenceEvidence = await Promise.all(source.references.map(async (reference) => ({
      path: reference.path,
      sha256: reference.sha256 ?? createHash('sha256').update(await readFile(reference.path)).digest('hex'),
      label: reference.label,
    })));
    const identity = [
      source.name,
      source.age ? `fictional adult age ${source.age}` : null,
      ...Object.entries(source.appearance).map(([key, value]) => `${key}: ${value}`),
      ...(instance.wardrobe.length ? [`wardrobe: ${instance.wardrobe.join(', ')}`] : []),
      instance.expression ? `expression: ${instance.expression}` : null,
      instance.continuityNotes ? `continuity: ${instance.continuityNotes}` : null,
      ...source.promptTokens,
    ].filter(Boolean).join(', ');
    compiled.push({
      castInstanceId: instance.id,
      characterId: source.id,
      characterRevision: source.revision,
      identity,
      negativeConstraints: [...source.negativeConstraints],
      references: referenceEvidence,
    });
  }
  return compiled;
}

export function validateMatureCast(cast = []) {
  if (!Array.isArray(cast) || cast.length === 0) throw new Error('mature-enabled generation requires a cast');
  const errors = [];
  for (const raw of cast) {
    const instance = normalizeCastInstance(raw);
    const source = instance.sourceSnapshot;
    if (!source.fictional || source.likenessPosture !== 'fictional') errors.push(`${source.name} must be fictional with no real-person likeness`);
    if (!source.adultConfirmed || source.age == null || source.age < 25) errors.push(`${source.name} must have an explicit age of 25 or older`);
    if (source.consentPosture !== 'affirmative') errors.push(`${source.name} requires affirmative consent posture`);
  }
  if (errors.length) throw new Error(errors.join('; '));
  return { eligible: true, assertions: cast.map((raw) => {
    const source = normalizeCastInstance(raw).sourceSnapshot;
    return { characterId: source.id, revision: source.revision, fictional: true, age: source.age, consent: 'affirmative', realPersonLikeness: false };
  }) };
}

export function validateMatureConcept(value) {
  const text = String(value ?? '');
  const blocked = [
    [/\b(?:child|minor|underage|preteen|teen(?:ager)?|schoolgirl|schoolboy|young-looking|uncertain age)\b/i, 'minor or uncertain-age content'],
    [/\b(?:rape|forced|coerc(?:e|ion|ive)|non-consensual|unconscious|drugged)\b/i, 'non-consensual content'],
    [/\b(?:incest|brother\s+and\s+sister|father\s+and\s+daughter|mother\s+and\s+son)\b/i, 'incest content'],
    [/\b(?:bestiality|zoophilia|sex(?:ual)?\s+with\s+(?:an?\s+)?animal)\b/i, 'bestiality content'],
  ];
  const match = blocked.find(([pattern]) => pattern.test(text));
  if (match) throw new Error(`mature-enabled generation rejects ${match[1]}`);
  return { eligible: true };
}

function normalizeReferences(input) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 12).map((entry, index) => ({
    path: path.resolve(requiredString(entry?.path, `references[${index}].path`)),
    label: optionalString(entry?.label),
    sha256: optionalHash(entry?.sha256),
  }));
}

function normalizeStringMap(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return Object.fromEntries(Object.entries(input).slice(0, 30).map(([key, value]) => [
    requiredString(key, 'appearance key').slice(0, 80),
    requiredString(value, `appearance.${key}`).slice(0, 500),
  ]));
}

function optionalHash(value) {
  const text = optionalString(value);
  if (!text) return null;
  if (!/^[a-f0-9]{64}$/i.test(text)) throw new Error('reference sha256 must contain 64 hexadecimal characters');
  return text.toLowerCase();
}

function optionalAge(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 200) throw new Error('character.age must be an integer between 0 and 200');
  return number;
}

function stringList(value, limit) {
  return Array.isArray(value) ? value.map(optionalString).filter(Boolean).slice(0, limit) : [];
}

function optionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requiredString(value, field) {
  const text = optionalString(value);
  if (!text) throw new Error(`${field} is required`);
  return text;
}

function positiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new Error(`${field} must be a positive integer`);
  return number;
}

function iso(value, field) {
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${field} must be an ISO date`);
  return new Date(value).toISOString();
}
