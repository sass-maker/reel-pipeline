#!/usr/bin/env node
import { planIdeas, produceNext, factoryStatus, inspectStudioArsenal, runFactoryAutopilot } from '../src/studio/factory.js';

const USAGE = `Usage: npm run factory -- <command> [flags]

Commands:
  plan     --niche <niche> [--count N]     Fill the backlog with ideas
  produce  [--count N] [--engine kokoro|mock]
           [--duration S] [--out DIR]      Render the next N backlog ideas
  status                                    Pipeline counts + recent renders
  arsenal [--recipe <id>] [--channel <id>] [--owner <name>]
          [--spend-ceiling <class>] [--readiness all|ready|blocked]
                                            Read-only machine inventory for agent planning
  autopilot (--policy <id> | --all) [--dry-run | --execute] [--count N]
                                            Discover safely by default; --execute writes, renders, and may create Postiz work

The conveyor: plan → produce → review renders at /studio → post.
Produce defaults to the kokoro engine (fully local).`;

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      flags[key] = true;
    } else {
      flags[key] = next;
      i += 1;
    }
  }
  return flags;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);
  if (!command || command === 'help' || flags.help) {
    console.log(USAGE);
    return;
  }
  if (command === 'plan') {
    const result = await planIdeas({ niche: flags.niche, count: flags.count ? Number(flags.count) : undefined });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (command === 'produce') {
    const result = await produceNext({
      count: flags.count ? Number(flags.count) : 1,
      engine: typeof flags.engine === 'string' ? flags.engine : 'kokoro',
      durationSeconds: flags.duration ? Number(flags.duration) : undefined,
      outputDir: typeof flags.out === 'string' ? flags.out : undefined,
    });
    console.log(JSON.stringify(result, null, 2));
    if (result.failed > 0) process.exit(1);
    return;
  }
  if (command === 'status') {
    console.log(JSON.stringify(await factoryStatus({}), null, 2));
    return;
  }
  if (command === 'arsenal') {
    const result = await inspectStudioArsenal({
      filters: {
        recipe: flags.recipe,
        channel: flags.channel,
        owner: flags.owner,
        spendCeiling: flags['spend-ceiling'],
        readiness: flags.readiness,
      },
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (command === 'autopilot') {
    if (Boolean(flags.policy) === Boolean(flags.all)) {
      throw new Error('autopilot requires exactly one of --policy <id> or --all');
    }
    if (flags['dry-run'] && flags.execute) throw new Error('choose either --dry-run or --execute');
    const result = await runFactoryAutopilot({
      policy: typeof flags.policy === 'string' ? flags.policy : undefined,
      all: flags.all === true,
      execute: flags.execute === true,
      count: flags.count ? Number(flags.count) : undefined,
      outputDir: typeof flags.out === 'string' ? flags.out : undefined,
    });
    console.log(JSON.stringify(result, null, 2));
    if (result.totals.blocked > 0 && flags.execute) process.exitCode = 2;
    return;
  }
  throw new Error(`unknown command: ${command}\n\n${USAGE}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
