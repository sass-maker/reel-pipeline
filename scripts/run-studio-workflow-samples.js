#!/usr/bin/env node
import { runWorkflowSamples } from '../src/studio/workflow-samples.js';

const args = parseArgs(process.argv.slice(2));
const result = await runWorkflowSamples({
  baseUrl: args.baseUrl,
  only: args.only,
  planOnly: args.planOnly,
  onProgress(event) {
    if (event.type === 'sample-planning') console.log(`plan ${event.sample.id}`);
    if (event.type === 'sample-rendering') console.log(`render ${event.sample.id}`);
    if (event.type === 'sample-reused') console.log(`reuse ${event.sample.id}`);
    if (event.type === 'sample-completed') console.log(`done ${event.sample.id}`);
  },
});
console.log(JSON.stringify(result, null, 2));

function parseArgs(values) {
  const output = { baseUrl: 'http://127.0.0.1:4319', only: null, planOnly: false };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--plan-only') output.planOnly = true;
    else if (value === '--base-url') output.baseUrl = values[++index];
    else if (value === '--only') output.only = values[++index].split(',').filter(Boolean);
    else throw new Error(`unknown argument: ${value}`);
  }
  return output;
}
