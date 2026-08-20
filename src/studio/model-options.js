import { existsSync } from 'node:fs';
import path from 'node:path';

import modelConfig from '../../config/forge-model-profiles.json' with { type: 'json' };
import themeConfig from '../../config/studio-theme-packs.json' with { type: 'json' };

const MODEL_SCHEMA = 'fleet.forge-model-profiles.v1';
const THEME_SCHEMA = 'fleet.studio-theme-packs.v1';
const SECRET_KEY = /(secret|token|password|api.?key|credential)/i;
const SOURCE_POSTURES = new Set(['original', 'operator-owned', 'named-ip']);
const TRUST_TIERS = new Set(['router', 'first-party-open-weight', 'established-family', 'community-experimental']);

export function listThemePacks() {
  validateThemeRegistry(themeConfig);
  return themeConfig.themes.map((theme) => structuredClone(theme));
}

export function listModelProfiles(options = {}) {
  validateModelRegistry(modelConfig);
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  return modelConfig.profiles.map((profile) => ({
    ...structuredClone(profile),
    readiness: profileReadiness(profile, rootDir),
  }));
}

export function resolveThemePack(id = 'auto', prompt = '') {
  const themes = listThemePacks();
  let selectedId = id || 'auto';
  if (selectedId === 'auto') {
    const text = String(prompt).toLowerCase();
    if (/\b(avengers|captain america|iron man|black widow|thor)\b/.test(text)) selectedId = 'avengers-private';
    else if (/\b(batman|superman|wonder woman|harley quinn|dc characters?)\b/.test(text)) selectedId = 'dc-private';
    else if (/\banime\b/.test(text)) selectedId = 'original-anime';
    else selectedId = 'original-nightlife';
  }
  const theme = themes.find((entry) => entry.id === selectedId);
  if (!theme) throw new Error(`unknown theme pack: ${selectedId}`);
  return theme;
}

export function resolveModelProfile(id = 'auto', options = {}) {
  const generationMode = options.generationMode ?? 'image-to-reel';
  const profiles = listModelProfiles(options);
  let profile = profiles.find((entry) => entry.id === (id || 'auto'));
  if (!profile) throw new Error(`unknown model profile: ${id}`);
  let selectionMode = 'explicit';
  let reason = 'Operator selected this profile.';
  if (profile.id === 'auto') {
    selectionMode = 'auto';
    const preferred = generationMode === 'image-to-reel'
      ? ['wai-illustrious-v17-sdcpp']
      : ['ltx-2.3-mlx-q4'];
    profile = preferred.map((profileId) => profiles.find((entry) => entry.id === profileId))
      .find((entry) => entry?.autoEligible === true && entry.generationModes.includes(generationMode) && entry.readiness.ready);
    if (!profile) throw new Error(`Auto found no ready ${generationMode} model on this host.`);
    reason = generationMode === 'image-to-reel'
      ? 'Auto chose the verified local WAI image-to-reel profile.'
      : 'Auto chose the fastest compatible ready native-video profile.';
  }
  if (!profile.generationModes.includes(generationMode)) {
    throw new Error(`${profile.name} does not support ${generationMode}.`);
  }
  return { profile, selectionMode, reason };
}

export function validateThemeRegistry(input) {
  if (input?.schema !== THEME_SCHEMA || !Array.isArray(input.themes)) throw new Error(`theme registry must use ${THEME_SCHEMA}`);
  validateUnique(input.themes, 'theme');
  for (const theme of input.themes) {
    requiredString(theme.id, 'theme.id');
    requiredString(theme.name, `${theme.id}.name`);
    if (!SOURCE_POSTURES.has(theme.sourcePosture)) throw new Error(`${theme.id}: invalid sourcePosture`);
    if (!['general', 'mature-enabled'].includes(theme.contentScope)) throw new Error(`${theme.id}: invalid contentScope`);
  }
  assertSecretFree(input);
  return input;
}

export function validateModelRegistry(input) {
  if (input?.schema !== MODEL_SCHEMA || !Array.isArray(input.profiles)) throw new Error(`model registry must use ${MODEL_SCHEMA}`);
  validateUnique(input.profiles, 'model profile');
  for (const profile of input.profiles) {
    requiredString(profile.id, 'profile.id');
    requiredString(profile.name, `${profile.id}.name`);
    if (!TRUST_TIERS.has(profile.trust?.tier)) throw new Error(`${profile.id}: invalid trust tier`);
    requiredString(profile.trust?.basis, `${profile.id}.trust.basis`);
    if (typeof profile.autoEligible !== 'boolean') throw new Error(`${profile.id}: autoEligible must be boolean`);
    if (!Array.isArray(profile.generationModes) || !profile.generationModes.length) throw new Error(`${profile.id}: generationModes are required`);
    if (!Array.isArray(profile.requiredPaths)) throw new Error(`${profile.id}: requiredPaths must be an array`);
  }
  assertSecretFree(input);
  return input;
}

function profileReadiness(profile, rootDir) {
  if (profile.forcedBlocker) return { state: 'blocked', ready: false, blocker: profile.forcedBlocker };
  if (profile.id === 'auto') return { state: 'router', ready: true, blocker: null };
  const missing = profile.requiredPaths.filter((candidate) => !existsSync(path.resolve(rootDir, candidate)));
  return missing.length
    ? { state: 'blocked', ready: false, blocker: `Missing ${missing.join(', ')}.` }
    : { state: 'ready', ready: true, blocker: null };
}

function validateUnique(entries, label) {
  const ids = new Set();
  for (const entry of entries) {
    if (ids.has(entry.id)) throw new Error(`duplicate ${label} id: ${entry.id}`);
    ids.add(entry.id);
  }
  if (!ids.has('auto')) throw new Error(`${label} registry must include auto`);
}

function assertSecretFree(value, trail = []) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) throw new Error(`registry must not contain secret-shaped field ${[...trail, key].join('.')}`);
    assertSecretFree(child, [...trail, key]);
  }
}

function requiredString(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}
