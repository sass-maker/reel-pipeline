#!/usr/bin/env node

import { mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'fixtures/video-gallery/representatives/live-captures');
const args = new Map(process.argv.slice(2).map((value, index, values) => value.startsWith('--') ? [value, values[index + 1]] : null).filter(Boolean));
const threeUrl = args.get('--three-url') ?? 'http://127.0.0.1:8765/visual-lab';
const marketingUrl = args.get('--marketing-url') ?? 'http://127.0.0.1:4321/marketing';

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });

try {
  for (const direction of ['cel', 'diagram', 'atmospheric']) {
    const captureUrl = new URL(threeUrl);
    captureUrl.searchParams.set('direction', direction);
    captureUrl.searchParams.set('capture', '1');
    await capture(`threejs-scene--${direction}.webm`, captureUrl.toString(), async (page) => {
      await page.waitForSelector('canvas');
      await page.waitForTimeout(8_000);
    });
  }

  await capture('guided-app-demo.webm', marketingUrl, async (page) => {
    await page.waitForSelector('main');
    await page.mouse.move(330, 130, { steps: 12 });
    await page.waitForTimeout(1_200);
    await page.mouse.wheel(0, 620);
    await page.waitForTimeout(2_100);
    await page.mouse.move(92, 420, { steps: 16 });
    await page.mouse.wheel(0, 1_020);
    await page.waitForTimeout(2_300);
    await page.mouse.move(310, 610, { steps: 18 });
    await page.mouse.wheel(0, 1_100);
    await page.waitForTimeout(2_300);
  });
} finally {
  await browser.close();
}

async function capture(filename, url, interact) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    recordVideo: { dir: outputDir, size: { width: 390, height: 844 } },
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await interact(page);
  const video = page.video();
  await context.close();
  if (!video) throw new Error(`Playwright did not record ${url}`);
  const temporaryPath = await video.path();
  const destination = path.join(outputDir, filename);
  await rename(temporaryPath, destination);
  process.stdout.write(`${filename}: ${destination}\n`);
}
