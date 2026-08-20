import { spawnSync } from 'node:child_process';
import { accessSync, constants, readFileSync, statfsSync, statSync } from 'node:fs';
import { availableParallelism, totalmem } from 'node:os';
import { isAbsolute, relative, resolve } from 'node:path';
import { isIP } from 'node:net';

const manifest = JSON.parse(readFileSync(new URL('./images.json', import.meta.url), 'utf8'));
const CONFIG_KEYS = new Set([
  'schemaVersion',
  'dataRoot',
  'backupRoot',
  'restoreReceiptFile',
  'healthUrl',
  'apiCompatibilityUrl',
  'privateReachabilityUrl',
]);
const PERSISTENT_DIRECTORIES = [
  'postiz-config',
  'postiz-uploads',
  'postgres',
  'redis',
  'temporal-postgres',
  'temporal-elasticsearch',
];

export class PostizReadinessError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PostizReadinessError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new PostizReadinessError(code, message);
}

function privateIpv4(hostname) {
  const octets = hostname.split('.').map(Number);
  return octets[0] === 10 || octets[0] === 127 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168);
}

function privateHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/\.$/u, '');
  if (normalized === 'localhost' || normalized.endsWith('.local') || normalized.endsWith('.internal')) return true;
  if (isIP(normalized) === 4) return privateIpv4(normalized);
  if (isIP(normalized) === 6) return normalized === '::1' || normalized.startsWith('fc') ||
    normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') ||
    normalized.startsWith('fea') || normalized.startsWith('feb');
  return false;
}

function privateUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail('POSTIZ_CONFIG_INVALID', 'Postiz readiness URLs must be valid HTTP URLs.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || !privateHostname(url.hostname) || url.username || url.password) {
    fail('POSTIZ_PUBLIC_ENDPOINT_REFUSED', 'Postiz readiness probes must use credential-free private URLs.');
  }
  return url.toString();
}

function loadConfig(path, checkoutRoot) {
  let config;
  try {
    config = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    fail('POSTIZ_CONFIG_INVALID', 'The machine-local Postiz readiness config is missing or invalid.');
  }
  if (!config || typeof config !== 'object' || Array.isArray(config) ||
      Object.keys(config).some((key) => !CONFIG_KEYS.has(key))) {
    fail('POSTIZ_CONFIG_INVALID', 'The machine-local Postiz readiness config has unsupported fields.');
  }
  if (config.schemaVersion !== 1) fail('POSTIZ_CONFIG_INVALID', 'The Postiz readiness schema is unsupported.');
  for (const key of ['dataRoot', 'backupRoot', 'restoreReceiptFile']) {
    if (typeof config[key] !== 'string' || !isAbsolute(config[key])) {
      fail('POSTIZ_CONFIG_INVALID', 'Postiz persistent paths must be explicit and absolute.');
    }
    const relativePath = relative(resolve(checkoutRoot), resolve(config[key]));
    if (relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))) {
      fail('POSTIZ_TRACKED_PATH_REFUSED', 'Postiz persistent state must remain outside the checkout.');
    }
  }
  return Object.freeze({
    ...config,
    healthUrl: privateUrl(config.healthUrl),
    apiCompatibilityUrl: privateUrl(config.apiCompatibilityUrl),
    privateReachabilityUrl: privateUrl(config.privateReachabilityUrl),
  });
}

function defaultPathReady(path) {
  try {
    if (!statSync(path).isDirectory()) return false;
    accessSync(path, constants.R_OK | constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function defaultFreeDiskBytes(path) {
  try {
    const stats = statfsSync(path);
    return Number(stats.bavail) * Number(stats.bsize);
  } catch {
    return 0;
  }
}

function defaultHttp(url) {
  const result = spawnSync('curl', [
    '--silent',
    '--show-error',
    '--output', '/dev/null',
    '--write-out', '%{http_code}',
    '--connect-timeout', '3',
    '--max-time', '5',
    url,
  ], { encoding: 'utf8', timeout: 6000 });
  const status = Number(result.stdout);
  return { reachable: result.status === 0 && Number.isInteger(status), status };
}

function defaultBackupReady(config) {
  if (!defaultPathReady(config.backupRoot)) return false;
  try {
    const receipt = JSON.parse(readFileSync(config.restoreReceiptFile, 'utf8'));
    return receipt?.schemaVersion === 1 && receipt?.kind === 'postiz-restore-rehearsal' &&
      receipt?.result === 'verified' && receipt?.sourceRelease === manifest.postizRelease &&
      Number.isFinite(new Date(receipt?.verifiedAt).getTime());
  } catch {
    return false;
  }
}

export const defaultPostizProbes = Object.freeze({
  resources: () => ({ cpuCount: availableParallelism(), memoryBytes: totalmem() }),
  freeDiskBytes: defaultFreeDiskBytes,
  pathReady: defaultPathReady,
  backupReady: defaultBackupReady,
  http: defaultHttp,
  privateReachability: (url) => defaultHttp(url).reachable,
});

function check(name, ok, detail) {
  return { name, ok: Boolean(ok), detail };
}

export function inspectPostizReadiness(configFile, { checkoutRoot, probes = {} } = {}) {
  if (!configFile || !isAbsolute(configFile) || !checkoutRoot || !isAbsolute(checkoutRoot)) {
    fail('POSTIZ_CONFIG_INVALID', 'Postiz readiness requires explicit absolute config and checkout paths.');
  }
  const config = loadConfig(configFile, checkoutRoot);
  const activeProbes = { ...defaultPostizProbes, ...probes };
  const resources = activeProbes.resources();
  const health = activeProbes.http(config.healthUrl);
  const compatibility = activeProbes.http(config.apiCompatibilityUrl);
  const persistentReady = PERSISTENT_DIRECTORIES.every((name) => activeProbes.pathReady(resolve(config.dataRoot, name)));
  const checks = [
    check('postiz-cpu', resources.cpuCount >= manifest.minimumHost.cpuCount, 'minimum-2-logical-cpus'),
    check('postiz-memory', resources.memoryBytes >= manifest.minimumHost.memoryBytes, 'minimum-4-gib'),
    check('postiz-disk', activeProbes.freeDiskBytes(config.dataRoot) >= manifest.minimumHost.freeDiskBytes, 'minimum-20-gib-free'),
    check('postiz-persistent-paths', persistentReady, 'six-machine-local-directories-ready'),
    check('postiz-backup-readiness', activeProbes.backupReady(config), 'verified-restore-rehearsal-required'),
    check('postiz-health-endpoint', health.reachable && health.status >= 200 && health.status < 400, 'private-health-response-compatible'),
    check('postiz-api-compatibility', compatibility.reachable && [200, 401, 403].includes(compatibility.status), 'public-api-route-present'),
    check('postiz-private-reachability', activeProbes.privateReachability(config.privateReachabilityUrl), 'private-endpoint-reachable'),
  ];
  return {
    schemaVersion: 1,
    release: manifest.postizRelease,
    ok: checks.every((item) => item.ok),
    checks,
  };
}
