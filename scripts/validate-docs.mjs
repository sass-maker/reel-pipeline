#!/usr/bin/env node
// Validate docs structure + internal markdown links without requiring Blume.
// Run: npm run docs:validate
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative, sep, posix } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = join(ROOT, "docs");
const errors = [];
const warnings = [];
let checked = 0;
let linksChecked = 0;

const REQUIRED_DIRS = [
  "product",
  "architecture",
  "architecture/decisions",
  "development",
  "operations",
  "operations/runbooks",
  "knowledge",
  "knowledge/learnings",
  "knowledge/failed-approaches",
  "archive",
];

const REQUIRED_FILES = [
  "index.md",
  "architecture/overview.md",
  "architecture/engines.md",
  "architecture/render-modes.md",
  "architecture/rust-orchestrator.md",
  "product/overview.md",
  "product/anonymous-brand-reel.md",
  "development/setup.md",
  "development/commands.md",
  "development/testing.md",
  "development/submodules.md",
  "development/docs-build.md",
  "operations/deployment.md",
  "operations/postiz-handoff.md",
  "knowledge/failed-approaches/openshorts-adapter.md",
];

const ROOT_REQUIRED = ["README.md", "AGENTS.md", "STATUS.md", "PROJECT_STATUS.md"];

function listMarkdown(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...listMarkdown(full));
    else if (entry.endsWith(".md")) out.push(full);
  }
  return out;
}

function toRepoPath(abs) {
  return relative(ROOT, abs).split(sep).join(posix.sep);
}

// Collect all markdown files under docs/ and the root required files.
const files = [];
for (const f of listMarkdown(DOCS)) files.push(f);
for (const f of ROOT_REQUIRED) {
  const abs = join(ROOT, f);
  if (existsSync(abs)) files.push(abs);
}

// Structure checks
for (const dir of REQUIRED_DIRS) {
  const p = join(DOCS, dir);
  if (!existsSync(p)) errors.push(`missing required docs dir: docs/${dir}`);
}
for (const f of REQUIRED_FILES) {
  const p = join(DOCS, f);
  if (!existsSync(p)) errors.push(`missing required docs file: docs/${f}`);
}
for (const f of ROOT_REQUIRED) {
  const p = join(ROOT, f);
  if (!existsSync(p)) errors.push(`missing required root file: ${f}`);
}

// Link extraction: [text](target) where target is a relative .md/.md#anchor or
// a relative directory/file path. Skip http(s) and absolute URLs.
const LINK_RE = /\[[^\]]*\]\(([^)]+)\)/g;

function resolveLink(fromFile, target) {
  const clean = target.replace(/[#?].*$/, "");
  if (!clean) return null;
  if (/^https?:\/\//.test(clean) || clean.startsWith("/")) return null;
  const base = dirname(fromFile);
  return resolve(base, clean);
}

for (const file of files) {
  checked++;
  const text = readFileSync(file, "utf8");
  let m;
  LINK_RE.lastIndex = 0;
  while ((m = LINK_RE.exec(text)) !== null) {
    const target = m[1].trim();
    if (/^https?:\/\//.test(target) || target.startsWith("/")) continue;
    linksChecked++;
    const resolved = resolveLink(file, target);
    if (!resolved) continue;
    if (!existsSync(resolved)) {
      errors.push(
        `broken link in ${toRepoPath(file)}: [${m[0].slice(0, 40)}...] -> ${target}`,
      );
    }
  }
}

// ADR numbering sanity
const adrDir = join(DOCS, "architecture/decisions");
if (existsSync(adrDir)) {
  const adrs = readdirSync(adrDir)
    .filter((f) => /^\d{4}-.*\.md$/.test(f))
    .map((f) => f.slice(0, 4));
  const seen = new Set();
  for (const n of adrs) {
    if (seen.has(n)) errors.push(`duplicate ADR number: ${n}`);
    seen.add(n);
  }
}

console.log(`docs:validate — ${checked} files, ${linksChecked} internal links checked`);
if (warnings.length) {
  console.log("\nWarnings:");
  for (const w of warnings) console.log(`  - ${w}`);
}
if (errors.length) {
  console.error("\nErrors:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("OK — docs structure and internal links valid.");
