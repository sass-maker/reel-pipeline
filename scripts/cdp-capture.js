/**
 * Tiny Chrome DevTools Protocol client built on Node's built-in WebSocket
 * (Node 22+) — no npm dependencies. Used by render-pro.js to drive scroll
 * tours and screencasts without Playwright/Puppeteer.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CHROME_BIN = process.env.REEL_RENDER_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export class CdpSession {
  constructor(ws) {
    this.ws = ws;
    this.pending = new Map();
    this.nextId = 0;
    this.listeners = new Map();
    ws.addEventListener('message', (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.method ?? 'cdp'}: ${msg.error.message}`));
        else resolve(msg.result);
      } else if (msg.method && this.listeners.has(msg.method)) {
        for (const listener of this.listeners.get(msg.method)) listener(msg.params);
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, handler) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(handler);
    return () => {
      const list = this.listeners.get(method) || [];
      const index = list.indexOf(handler);
      if (index !== -1) list.splice(index, 1);
    };
  }
}

export async function withChrome({ width, height, chromePath = CHROME_BIN }, body) {
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'reel-cdp-'));
  const port = 9222 + Math.floor(Math.random() * 1000);
  const proc = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-sandbox',
    '--no-first-run',
    '--disable-features=TranslateUI,InfiniteSessionRestore',
    `--window-size=${width},${height}`,
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  proc.stdout.on('data', () => {});
  proc.stderr.on('data', () => {});

  const cleanup = async () => {
    if (proc.exitCode === null && proc.signalCode === null) {
      try { proc.kill('SIGTERM'); } catch {}
      await new Promise((resolve) => {
        proc.once('exit', resolve);
        setTimeout(resolve, 5_000);
      });
    }
    try { await rm(userDataDir, { recursive: true, force: true }); } catch {}
  };

  try {
    const target = await waitForTarget(port);
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', () => reject(new Error('WS error')), { once: true });
      setTimeout(() => reject(new Error('WS open timeout')), 15_000);
    });
    const cdp = new CdpSession(ws);
    try {
      return await body(cdp);
    } finally {
      try { ws.close(); } catch {}
    }
  } finally {
    await cleanup();
  }
}

async function waitForTarget(port, attempts = 30) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      if (res.ok) {
        const targets = await res.json();
        const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
        if (page) return page;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`chrome devtools endpoint did not come up on port ${port}`);
}

export async function navigateAndWait(cdp, url, { timeoutMs = 25_000 } = {}) {
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  const navigated = new Promise((resolve) => {
    const off = cdp.on('Page.loadEventFired', () => { off(); resolve(); });
  });
  await cdp.send('Page.navigate', { url });
  await Promise.race([
    navigated,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`navigate timeout ${url}`)), timeoutMs)),
  ]);
  await sleep(800);
}

export async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || 'evaluate failed');
  }
  return result.result?.value;
}

export async function scrollTo(cdp, y) {
  await evaluate(cdp, `window.scrollTo({top: ${Number(y)}, behavior: 'instant'})`);
}

export async function captureScreenshotPng(cdp, outPath) {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(outPath, Buffer.from(result.data, 'base64'));
}

export async function captureScrollTour(url, outPaths, { width = 1080, height = 1920, settleMs = 600 } = {}) {
  return withChrome({ width, height }, async (cdp) => {
    await navigateAndWait(cdp, url);
    const pageHeight = Number(await evaluate(cdp, 'document.documentElement.scrollHeight')) || height;
    const maxScroll = Math.max(0, pageHeight - height);
    for (let i = 0; i < outPaths.length; i += 1) {
      const ratio = outPaths.length === 1 ? 0 : i / (outPaths.length - 1);
      const scrollY = Math.round(maxScroll * ratio);
      await scrollTo(cdp, scrollY);
      await sleep(settleMs);
      await captureScreenshotPng(cdp, outPaths[i]);
    }
  });
}

export async function recordScrollScreencast(url, frameDirParent, { width = 1080, height = 1920, durationMs = 6000, fps = 15, holdRatio = 0.62, maxStops = 4 } = {}) {
  // Deliberate tour: scroll to a position, HOLD for ~60% of the slot capturing
  // frames, then animate-scroll to the next position over the other ~40%.
  // Reads as a curated product walk instead of a constant scroll. Number of
  // stops is derived from the actual scrollable height of the page.
  const frameDir = await mkdtemp(path.join(frameDirParent, 'scroll-cast-'));
  let frameIndex = 0;
  await withChrome({ width, height }, async (cdp) => {
    await navigateAndWait(cdp, url);

    const pageHeight = Math.max(height, Number(await evaluate(cdp, 'document.documentElement.scrollHeight')) || height);
    const maxScroll = Math.max(0, pageHeight - height);
    const stopHeight = Math.round(height * 0.7);
    const stopCount = Math.max(1, Math.min(maxStops, maxScroll <= 0 ? 1 : Math.ceil(maxScroll / stopHeight) + 1));

    const intervalMs = Math.max(60, Math.round(1000 / fps));
    const msPerStop = durationMs / stopCount;
    const holdMs = Math.max(intervalMs * 4, Math.round(msPerStop * holdRatio));
    const scrollMs = Math.max(intervalMs * 2, Math.round(msPerStop * (1 - holdRatio)));

    const captureFrame = async () => {
      try {
        const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        await writeFile(path.join(frameDir, `frame-${String(frameIndex).padStart(5, '0')}.png`), Buffer.from(shot.data, 'base64'));
        frameIndex += 1;
      } catch {}
    };

    let currentY = 0;
    for (let stop = 0; stop < stopCount; stop += 1) {
      const ratio = stopCount === 1 ? 0 : stop / (stopCount - 1);
      const targetY = Math.round(maxScroll * ratio);

      if (stop > 0 && targetY !== currentY) {
        const scrollSteps = Math.max(1, Math.round(scrollMs / intervalMs));
        for (let step = 1; step <= scrollSteps; step += 1) {
          const y = currentY + Math.round((targetY - currentY) * (step / scrollSteps));
          try { await evaluate(cdp, `window.scrollTo({top: ${y}, behavior: 'instant'})`); } catch {}
          await captureFrame();
          await sleep(intervalMs);
        }
        currentY = targetY;
      } else if (stop === 0) {
        try { await evaluate(cdp, `window.scrollTo({top: 0, behavior: 'instant'})`); } catch {}
      }

      const holdSteps = Math.max(1, Math.round(holdMs / intervalMs));
      for (let step = 0; step < holdSteps; step += 1) {
        await captureFrame();
        await sleep(intervalMs);
      }
    }
  });
  return { frameDir, frameCount: frameIndex, fps };
}

export async function recordScreencast(url, demoSteps, outPath, { width = 1080, height = 1920, fps = 24 } = {}) {
  // Records a real product flow via CDP screencast. Frames are collected as
  // base64 PNGs, written to a temp dir, then assembled with ffmpeg.
  const frameDir = await mkdtemp(path.join(tmpdir(), 'reel-cdp-frames-'));
  let frameIndex = 0;
  return withChrome({ width, height }, async (cdp) => {
    await navigateAndWait(cdp, url);
    let active = false;
    cdp.on('Page.screencastFrame', async (params) => {
      try {
        if (!active) return;
        const file = path.join(frameDir, `frame-${String(frameIndex).padStart(5, '0')}.png`);
        await writeFile(file, Buffer.from(params.data, 'base64'));
        frameIndex += 1;
        await cdp.send('Page.screencastFrameAck', { sessionId: params.sessionId });
      } catch {}
    });
    await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1, maxWidth: width, maxHeight: height });
    active = true;
    for (const step of demoSteps) {
      await applyStep(cdp, step);
      await sleep(step.waitMs ?? 500);
    }
    active = false;
    await cdp.send('Page.stopScreencast').catch(() => {});
    return { frameDir, frameCount: frameIndex, fps };
  }).then(async (info) => {
    if (info.frameCount === 0) {
      await rm(frameDir, { recursive: true, force: true });
      throw new Error('screencast captured zero frames');
    }
    return { ...info, outPath };
  });
}

async function applyStep(cdp, step) {
  switch (step.action) {
    case 'goto':
      if (step.url || step.route) await navigateAndWait(cdp, step.url || step.route);
      break;
    case 'click':
      if (step.selector) await evaluate(cdp, `document.querySelector(${JSON.stringify(step.selector)})?.click()`);
      break;
    case 'fill':
      if (step.selector && step.value) {
        await evaluate(cdp, `(()=>{const el=document.querySelector(${JSON.stringify(step.selector)}); if(el){el.focus(); el.value=${JSON.stringify(step.value)}; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));}})()`);
      }
      break;
    case 'scroll':
      await evaluate(cdp, `window.scrollBy({top: ${Number(step.delta ?? 400)}, behavior: 'smooth'})`);
      break;
    case 'wait':
      // no-op; wait happens after
      break;
    default:
      // ignore unknown actions
      break;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
