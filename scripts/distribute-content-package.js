#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildDistributionRequest, executeDistribution } from '../src/distribution.js';
import { PostizClient } from '../src/postiz-client.js';

const flags = parseFlags(process.argv.slice(2));
if (!flags.file || !flags.receipt) throw new Error('--file and --receipt are required');
const contentPackage = JSON.parse(await readFile(path.resolve(flags.file), 'utf8'));
const mediaReceipt = JSON.parse(await readFile(path.resolve(flags.receipt), 'utf8'));

if (flags.execute) {
  if (!flags.request) throw new Error('--execute requires an approved --request file');
  const request = JSON.parse(await readFile(path.resolve(flags.request), 'utf8'));
  const options = {};
  if (request.provider === 'postiz') {
    const configPath = path.resolve(flags.integrations ?? process.env.POSTIZ_INTEGRATIONS_CONFIG ?? 'config/postiz-integrations.json');
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    options.postizProvider = new PostizClient({ integrations: config.integrations });
  }
  const receipt = await executeDistribution(contentPackage, mediaReceipt, request, options);
  console.log(JSON.stringify(receipt, null, 2));
} else {
  const request = buildDistributionRequest(contentPackage, mediaReceipt, {
    provider: flags.provider ?? 'manual',
    scheduledFor: flags['scheduled-for'],
  });
  const out = path.resolve(flags.out ?? './tmp/distribution-request.json');
  await writeFile(out, `${JSON.stringify(request, null, 2)}\n`);
  console.log(JSON.stringify({ status: 'prepared-not-posted', out, request }, null, 2));
}

function parseFlags(argv) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]; if (!token.startsWith('--')) continue;
    const key = token.slice(2); const next = argv[index + 1];
    if (!next || next.startsWith('--')) flags[key] = true;
    else { flags[key] = next; index += 1; }
  }
  return flags;
}
