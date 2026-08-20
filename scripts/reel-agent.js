#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

import { operationFailure } from '../src/agent/protocol.js';
import { REEL_AGENT_PRODUCT, runReelAgent } from '../src/agent/reel-agent.js';

let raw = null;
try {
  raw = await readRequest(process.argv.slice(2));
  const result = await runReelAgent(raw);
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify(operationFailure(raw, error, REEL_AGENT_PRODUCT))}\n`);
  process.exitCode = 1;
}

async function readRequest(args) {
  const fileIndex = args.indexOf('--request');
  if (fileIndex >= 0) {
    const file = args[fileIndex + 1];
    if (!file) throw new Error('--request requires a JSON file path');
    return JSON.parse(await readFile(file, 'utf8'));
  }
  if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString('utf8').trim();
    if (text) return JSON.parse(text);
  }
  throw new Error('provide one JSON request on stdin or with --request FILE');
}
