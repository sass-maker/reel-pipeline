import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
const DEEPSEEK_MODEL = 'deepseek-chat';
const HTTP_TIMEOUT_MS = 45_000;
const CODEX_TIMEOUT_MS = 120_000;
const DEFAULT_PROVIDER_ORDER = ['direct', 'codex', 'deepseek'];

class OpenAiCompatibleProvider {
  constructor({ name, apiKey, baseUrl, model, fetchImpl }) {
    this.name = name;
    this.apiKey = apiKey;
    this.baseUrl = (baseUrl ?? '').replace(/\/$/, '');
    this.model = model;
    this.fetchImpl = fetchImpl ?? fetch;
    this.provider = this.baseUrl && this.apiKey
      ? createOpenAICompatible({
        name,
        baseURL: this.baseUrl,
        apiKey: this.apiKey,
        ...(fetchImpl ? { fetch: fetchImpl } : {}),
      })
      : null;
  }

  isConfigured() {
    return Boolean(this.provider && this.model);
  }

  async chatJson(messages, { temperature = 0.7, maxTokens = 2048 } = {}) {
    if (!this.provider || !this.model) throw new Error(`${this.name} is not configured`);
    const result = await generateText({
      model: this.provider.chatModel(this.model),
      messages,
      temperature,
      maxOutputTokens: maxTokens,
      maxRetries: 0,
      timeout: { totalMs: HTTP_TIMEOUT_MS },
    });
    const content = result.text;
    if (!content) throw new Error(`${this.name} response missing content`);
    return parseJsonContent(content, this.name);
  }
}

class CodexProvider {
  constructor({ bin, model, runner } = {}) {
    this.name = 'codex';
    this.bin = bin ?? process.env.STUDIO_CODEX_BIN ?? 'codex';
    this.model = model ?? process.env.STUDIO_CODEX_MODEL;
    this.runner = runner ?? ((args, input) => spawnSync(this.bin, args, {
      input,
      encoding: 'utf8',
      timeout: CODEX_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
    }));
    this.available = null;
  }

  isConfigured() {
    if (this.available === null) {
      try {
        const probe = this.runner(['--version'], '');
        this.available = probe.status === 0;
      } catch {
        this.available = false;
      }
    }
    return this.available;
  }

  markUnavailable() {
    this.available = false;
  }

  async chatJson(messages, _options = {}) {
    const prompt = [
      ...messages.map((message) => `[${message.role}]\n${message.content}`),
      '[instruction]\nDo not run commands or edit files. Reply with only the JSON object described above — no prose, no code fences.',
    ].join('\n\n');
    const outFile = path.join(tmpdir(), `studio-codex-${process.pid}-${Math.random().toString(36).slice(2)}.txt`);
    const args = [
      'exec',
      '--ephemeral',
      '--skip-git-repo-check',
      '--sandbox', 'read-only',
      '--color', 'never',
      '--output-last-message', outFile,
    ];
    if (this.model) args.push('-m', this.model);
    args.push('-');
    try {
      const result = this.runner(args, prompt);
      if (result.error) throw new Error(`codex exec failed: ${result.error.message}`);
      if (result.status !== 0) {
        throw new Error(`codex exec exited ${result.status}: ${String(result.stderr ?? '').slice(0, 300)}`);
      }
      let lastMessage;
      try {
        lastMessage = readFileSync(outFile, 'utf8');
      } catch {
        lastMessage = String(result.stdout ?? '');
      }
      return parseJsonContent(lastMessage, 'codex');
    } finally {
      rmSync(outFile, { force: true });
    }
  }
}

function parseJsonContent(content, providerName) {
  let text = content.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) text = fenced[1].trim();
  // The last message may carry agent preamble; recover the outermost object.
  if (!text.startsWith('{')) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) text = text.slice(start, end + 1);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${providerName} returned non-JSON content: ${content.slice(0, 200)}`);
  }
}

function buildProvider(name, options) {
  if (name === 'deepseek') {
    return new OpenAiCompatibleProvider({
      name: 'deepseek',
      apiKey: options.apiKey ?? process.env.DEEPSEEK_API_KEY,
      baseUrl: `${(options.baseUrl ?? process.env.DEEPSEEK_BASE_URL ?? DEEPSEEK_BASE_URL).replace(/\/$/, '')}`,
      model: options.model ?? process.env.DEEPSEEK_MODEL ?? DEEPSEEK_MODEL,
      fetchImpl: options.fetchImpl,
    });
  }
  if (name === 'direct') {
    return new OpenAiCompatibleProvider({
      name: 'direct',
      apiKey: process.env.STUDIO_AI_API_KEY ?? process.env.AI_API_KEY,
      baseUrl: process.env.STUDIO_AI_BASE_URL ?? process.env.AI_BASE_URL,
      model: process.env.STUDIO_AI_MODEL ?? process.env.AI_MODEL,
      fetchImpl: options.fetchImpl,
    });
  }
  if (name === 'codex') return new CodexProvider(options.codex ?? {});
  throw new Error(`unknown studio llm provider: ${name}`);
}

export class StudioLlm {
  constructor(options = {}) {
    this.logger = options.logger ?? console;
    if (Array.isArray(options.providers)) {
      // Explicit provider instances (tests) or names.
      this.providers = options.providers.map((provider) =>
        typeof provider === 'string' ? buildProvider(provider, options) : provider);
    } else if ('apiKey' in options || 'baseUrl' in options || 'model' in options) {
      // Back-compat: explicit DeepSeek-style construction stays deepseek-only,
      // so `new StudioLlm({ apiKey: '' })` still forces template mode.
      this.providers = [buildProvider('deepseek', options)];
    } else {
      const order = (process.env.STUDIO_LLM_PROVIDERS ?? DEFAULT_PROVIDER_ORDER.join(','))
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);
      this.providers = order.map((name) => buildProvider(name, options));
    }
  }

  configuredProviders() {
    return this.providers.filter((provider) => provider.isConfigured());
  }

  isConfigured() {
    return this.configuredProviders().length > 0;
  }

  async chatJson(messages, options = {}) {
    const configured = this.configuredProviders();
    if (!configured.length) throw new Error('studio llm is not configured');
    let lastError;
    for (const provider of configured) {
      try {
        const data = await provider.chatJson(messages, options);
        this.lastProvider = provider.name;
        return data;
      } catch (error) {
        lastError = error;
        this.logger.warn?.(`studio llm provider ${provider.name} failed: ${error.message}`);
        // A provider that errors on a real call (rate limit, timeout, dead
        // endpoint) is skipped for the rest of the session instead of
        // costing its full timeout on every subsequent tool call.
        if (typeof provider.markUnavailable === 'function') provider.markUnavailable();
      }
    }
    throw lastError ?? new Error('all studio llm providers failed');
  }

  /**
   * Run an LLM generation with a mandatory deterministic fallback.
   * Returns { source: 'llm' | 'template', provider?, data } and never throws
   * for missing configuration or provider failure.
   */
  async generate({ messages, fallback, temperature, maxTokens, normalize }) {
    if (typeof fallback !== 'function') throw new Error('generate requires a fallback()');
    if (this.isConfigured()) {
      try {
        const raw = await this.chatJson(messages, { temperature, maxTokens });
        const data = normalize ? normalize(raw) : raw;
        return { source: 'llm', provider: this.lastProvider, data };
      } catch (error) {
        this.logger.warn?.(`studio llm fell back to template: ${error.message}`);
      }
    }
    return { source: 'template', data: fallback() };
  }
}

let sharedLlm = null;

export function resolveStudioLlm(options = {}) {
  if (options.llm) return options.llm;
  if (!sharedLlm) sharedLlm = new StudioLlm(options);
  return sharedLlm;
}
