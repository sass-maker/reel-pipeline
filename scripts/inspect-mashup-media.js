#!/usr/bin/env node

import path from 'node:path';

import { inspectMashupMedia } from '../src/adapters/podcast-edit.js';

const receiptIndex = process.argv.indexOf('--receipt');
const receiptPath = receiptIndex >= 0 ? process.argv[receiptIndex + 1] : null;
const rootIndex = process.argv.indexOf('--approved-root');
const approvedRoot = rootIndex >= 0 ? process.argv[rootIndex + 1] : receiptPath ? path.dirname(receiptPath) : null;

if (!receiptPath || !approvedRoot) {
  console.error('Usage: npm run inspect:mashup-media -- --receipt PATH [--approved-root PATH]');
  process.exitCode = 2;
} else {
  inspectMashupMedia({ receiptPath, approvedRoots: [approvedRoot] })
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`[inspect:mashup-media] ${error.message}`);
      process.exitCode = 1;
    });
}
