#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdir,
  readFile,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { KokoroTts } from '../src/adapters/kokoro.js';
import {
  FORGE_DEMO_CAPTIONS,
  FORGE_DEMO_NARRATION,
  assertNoFalseLipSync,
  buildForgeDemoTimeline,
  timelineToSrt,
} from '../src/local-video-forge-composition.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SOURCE_DIR = path.join(REPO_ROOT, '.reel-pipeline', 'first-deliverable', 's01');
const DEFAULT_OUTPUT_ROOT = path.join(DEFAULT_SOURCE_DIR, 'mixed-media');
const DEFAULT_PRESENTER = path.join(REPO_ROOT, 'assets', 'presenters', 'synthetic-presenter-v1.png');
const DEFAULT_VARIANTS = [41, 42, 43].map(
  (seed) => path.join(DEFAULT_SOURCE_DIR, `s01-seed-${seed}.mp4`),
);

function parseArgs(argv) {
  const options = {
    width: 1080,
    height: 1920,
    fps: 24,
    voice: 'af_heart',
    speed: 0.95,
    presenter: DEFAULT_PRESENTER,
    variants: DEFAULT_VARIANTS,
    outputRoot: DEFAULT_OUTPUT_ROOT,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--width') options.width = Number(next);
    else if (arg === '--height') options.height = Number(next);
    else if (arg === '--fps') options.fps = Number(next);
    else if (arg === '--voice') options.voice = next;
    else if (arg === '--speed') options.speed = Number(next);
    else if (arg === '--presenter') options.presenter = path.resolve(next);
    else if (arg === '--output') options.outputRoot = path.resolve(next);
    else if (arg === '--variant') {
      options.variants = options.variants === DEFAULT_VARIANTS ? [] : options.variants;
      options.variants.push(path.resolve(next));
    } else if (arg === '--help') {
      console.log(`Usage: npm run forge:demo -- [options]

Options:
  --voice NAME       Kokoro voice (default: af_heart)
  --speed NUMBER     Kokoro speed (default: 0.95)
  --presenter PATH   Approved portrait/keyframe
  --variant PATH     Generated variant MP4; repeat three times
  --output PATH      Parent output folder
  --width NUMBER     Render width (default: 1080)
  --height NUMBER    Render height (default: 1920)
  --fps NUMBER       Frames per second (default: 24)`);
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
    if (arg !== '--help') index += 1;
  }
  if (options.variants.length !== 3) throw new Error('exactly three --variant inputs are required');
  if (!(options.width > 0 && options.height > 0 && options.fps > 0)) {
    throw new Error('width, height, and fps must be positive');
  }
  return options;
}

function run(command, args, { cwd = REPO_ROOT } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited ${code}\n${stderr.slice(-3000)}`));
    });
  });
}

async function requireFile(filePath, label) {
  const info = await stat(filePath).catch(() => null);
  if (!info?.isFile() || info.size === 0) {
    throw new Error(`${label} is missing or empty: ${filePath}`);
  }
}

async function sha256(filePath) {
  const bytes = await readFile(filePath);
  return createHash('sha256').update(bytes).digest('hex');
}

async function durationSeconds(filePath) {
  const { stdout } = await run('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);
  const value = Number(stdout.trim());
  if (!(value > 0)) throw new Error(`could not probe duration: ${filePath}`);
  return value;
}

async function imageDataUrl(filePath, mime = 'image/png') {
  const bytes = await readFile(filePath);
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

function safeJson(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

function compositionHtml({ width, height, timeline, presenter, variants }) {
  const payload = safeJson({ width, height, timeline, presenter, variants });
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#070a0b}
    canvas{display:block;width:${width}px;height:${height}px}
  </style>
</head>
<body>
<canvas id="stage" width="${width}" height="${height}"></canvas>
<script>
const D=${payload};
const canvas=document.getElementById('stage');
const ctx=canvas.getContext('2d');
const W=D.width,H=D.height;
const C={bg:'#070a0b',paper:'#e8eee9',muted:'#8d9c98',cyan:'#57e2df',green:'#a6ff6f',amber:'#ffbd7a',line:'#20302f'};
const images={};
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const ease=(n)=>{n=clamp(n);return 1-Math.pow(1-n,3)};
const local=(scene,t)=>clamp((t-scene.start)/(scene.end-scene.start));
const load=(name,src)=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>{images[name]=im;resolve()};im.onerror=reject;im.src=src});

function cover(im,x,y,w,h,scale=1){
  const ratio=Math.max(w/im.width,h/im.height)*scale;
  const sw=w/ratio,sh=h/ratio;
  ctx.drawImage(im,(im.width-sw)/2,(im.height-sh)/2,sw,sh,x,y,w,h);
}
function contain(im,x,y,w,h){
  const ratio=Math.min(w/im.width,h/im.height);
  const dw=im.width*ratio,dh=im.height*ratio;
  ctx.drawImage(im,x+(w-dw)/2,y+(h-dh)/2,dw,dh);
}
function line(x1,y1,x2,y2,color=C.line,width=2){
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
}
function text(value,x,y,size,color=C.paper,align='left',weight=600,font='ui-monospace, SFMono-Regular, Menlo, monospace'){
  ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline='alphabetic';ctx.font=weight+' '+size+'px '+font;ctx.fillText(value,x,y);
}
function wrap(value,x,y,maxWidth,lineHeight,size,color=C.paper,align='left',weight=650){
  const words=value.split(' ');const lines=[];let current='';
  ctx.font=weight+' '+size+'px Inter, system-ui, sans-serif';
  for(const word of words){
    const test=current?current+' '+word:word;
    if(ctx.measureText(test).width>maxWidth&&current){lines.push(current);current=word}else current=test;
  }
  if(current)lines.push(current);
  lines.forEach((entry,i)=>text(entry,x,y+i*lineHeight,size,color,align,weight,'Inter, system-ui, sans-serif'));
  return lines.length;
}
function label(value,x,y,color=C.cyan){
  text(value.toUpperCase(),x,y,24,color,'left',700);
}
function base(t){
  ctx.fillStyle=C.bg;ctx.fillRect(0,0,W,H);
  const glow=ctx.createRadialGradient(W*.15,H*.16,0,W*.15,H*.16,W*.95);
  glow.addColorStop(0,'rgba(40,104,100,.20)');glow.addColorStop(1,'rgba(7,10,11,0)');
  ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);
  for(let y=0;y<H;y+=8){ctx.fillStyle='rgba(255,255,255,'+(0.006+0.003*Math.sin(y+t*3))+')';ctx.fillRect(0,y,W,1)}
  label('LOCAL VIDEO FORGE / 01',72,82);
  text(String(Math.floor(t*24)).padStart(5,'0'),W-72,82,22,C.muted,'right',500);
}
function footer(){
  line(72,H-102,W-72,H-102,C.line,2);
  text('APPROVED FRAME → VARIANTS → SELECTED RENDER',72,H-64,19,C.muted,'left',550);
}
function drawPresenter(p,outro=false){
  const reveal=ease(Math.min(p*2,1));
  ctx.save();ctx.globalAlpha=reveal;
  const y=outro?220:175;
  ctx.beginPath();ctx.roundRect(72,y,W-144,H*.58,28);ctx.clip();
  cover(images.presenter,72,y,W-144,H*.58,1.03);
  const shade=ctx.createLinearGradient(0,y,0,y+H*.58);
  shade.addColorStop(0,'rgba(7,10,11,.02)');shade.addColorStop(.62,'rgba(7,10,11,.12)');shade.addColorStop(1,'rgba(7,10,11,.94)');
  ctx.fillStyle=shade;ctx.fillRect(72,y,W-144,H*.58);
  ctx.restore();
  if(!outro){
    text('ONE FRAME.',72,H*.76,96,C.paper,'left',760,'Inter, system-ui, sans-serif');
    text('THREE WAYS FORWARD.',72,H*.815,46,C.green,'left',700,'Inter, system-ui, sans-serif');
  }else{
    text('RENDER LESS.',72,H*.765,82,C.paper,'left',760,'Inter, system-ui, sans-serif');
    text('CHOOSE BETTER.',72,H*.82,82,C.green,'left',760,'Inter, system-ui, sans-serif');
  }
}
function drawWireField(p,t){
  const enter=ease(p);
  ctx.save();ctx.globalAlpha=enter;
  const horizon=520;
  for(let i=0;i<12;i++){
    const yy=horizon+Math.pow(i/11,1.8)*690;
    line(80,yy,W-80,yy,'rgba(87,226,223,.20)',2);
  }
  for(let i=-8;i<=8;i++){
    line(W/2+i*26,horizon,W/2+i*84,H*.68,'rgba(87,226,223,.16)',2);
  }
  const chars='PROMPT::LATENT::NOISE::SEED::FRAME::';
  ctx.save();ctx.beginPath();ctx.rect(72,170,W-144,420);ctx.clip();
  for(let row=0;row<14;row++){
    const offset=Math.floor((t*9+row*7)%chars.length);
    const value=(chars.slice(offset)+chars+chars).slice(0,42);
    text(value,58-row%2*16,205+row*30,19,row%3===0?C.cyan:'rgba(141,156,152,.40)','left',500);
  }
  ctx.restore();
  text('PROMPT',72,850,29,C.muted);
  wrap('is not the first frame.',72,940,W-144,88,76,C.paper,'left',740);
  text('CONTROL STARTS EARLIER.',72,1158,27,C.green,'left',700);
  ctx.restore();
}
function drawApproved(p){
  const enter=ease(p*1.5);
  ctx.save();ctx.globalAlpha=enter;
  label('01 / APPROVE THE START',72,160,C.green);
  ctx.save();ctx.beginPath();ctx.roundRect(72,220,W-144,930,30);ctx.clip();
  cover(images.presenter,72,220,W-144,930,1.02);
  ctx.restore();
  ctx.strokeStyle=C.green;ctx.lineWidth=5;ctx.strokeRect(72,220,W-144,930);
  ctx.fillStyle='rgba(7,10,11,.88)';ctx.fillRect(110,1050,470,72);
  text('✓  KEYFRAME APPROVED',138,1097,25,C.green,'left',750);
  line(72,1240,W-72,1240,C.line,2);
  text('sha256',72,1300,23,C.muted);
  text('bff4…19c2',W-72,1300,23,C.paper,'right',600);
  text('mode',72,1350,23,C.muted);
  text('IMAGE → VIDEO',W-72,1350,23,C.paper,'right',600);
  text('important text added in post',72,1418,20,C.cyan,'left',600);
  ctx.restore();
}
function drawFilmstrip(p){
  label('02 / RENDER THE OPTIONS',72,160,C.cyan);
  const positions=[250,670,1090];
  positions.forEach((y,index)=>{
    const enter=ease(clamp(p*1.8-index*.16));
    const x=72+(1-enter)*120;
    ctx.save();ctx.globalAlpha=enter;
    ctx.beginPath();ctx.roundRect(x,y,W-144,350,22);ctx.clip();
    cover(images['v'+index],x,y,W-144,350,1.05);
    ctx.restore();
    ctx.strokeStyle=index===1?C.green:C.line;ctx.lineWidth=index===1?5:2;ctx.strokeRect(x,y,W-144,350);
    ctx.fillStyle=index===1?'rgba(166,255,111,.96)':'rgba(7,10,11,.86)';
    ctx.fillRect(x+24,y+24,180,52);
    text('SEED '+[41,42,43][index],x+114,y+59,22,index===1?C.bg:C.paper,'center',750);
    if(index===1)text('SELECTED',W-96,y+59,20,C.green,'right',750);
  });
}
function drawLedger(p,t){
  label('03 / KEEP THE RECEIPTS',72,160,C.amber);
  const rows=[
    ['model','LTX-2.3 / INT4'],
    ['pipeline','IMAGE-TO-VIDEO'],
    ['seeds','41 · 42 · 43'],
    ['frames','81 @ 24 FPS'],
    ['motion','CONTROLLED PUSH'],
    ['status','REPRODUCIBLE'],
  ];
  rows.forEach(([key,value],index)=>{
    const y=310+index*150;
    const active=clamp(p*8-index);
    ctx.globalAlpha=.22+.78*active;
    text(key.toUpperCase(),72,y,22,C.muted,'left',650);
    text(value,W-72,y,30,index===rows.length-1?C.green:C.paper,'right',680);
    line(72,y+45,W-72,y+45,index===rows.length-1?C.green:C.line,index===rows.length-1?3:2);
  });
  ctx.globalAlpha=1;
  const code='seed_'+[41,42,43][Math.floor(t*4)%3]+' :: '+String(Math.floor(t*1000)).padStart(5,'0');
  text(code,72,1325,23,C.cyan,'left',600);
  for(let i=0;i<24;i++){
    const h=24+Math.abs(Math.sin(i*.73+t*4))*120;
    ctx.fillStyle=i<Math.floor(p*24)?'rgba(87,226,223,.7)':'rgba(32,48,47,.7)';
    ctx.fillRect(72+i*39,1510-h,22,h);
  }
}
function drawSelection(p){
  label('04 / SPEND COMPUTE ON THE WINNER',72,160,C.green);
  ctx.save();ctx.beginPath();ctx.roundRect(72,220,W-144,850,30);ctx.clip();
  ctx.fillStyle='#020303';ctx.fillRect(72,220,W-144,850);
  contain(images.v1,72,220,W-144,850);
  const shade=ctx.createLinearGradient(0,650,0,1070);
  shade.addColorStop(0,'rgba(7,10,11,0)');shade.addColorStop(1,'rgba(7,10,11,.86)');
  ctx.fillStyle=shade;ctx.fillRect(72,220,W-144,850);
  ctx.restore();
  ctx.strokeStyle=C.green;ctx.lineWidth=5;ctx.strokeRect(72,220,W-144,850);
  text('SEED 42',110,1018,38,C.paper,'left',760);
  text('ACCEPTED',W-110,1018,25,C.green,'right',750);
  const bars=[
    ['PREVIEW COMPUTE',.28,C.cyan],
    ['FINAL COMPUTE',.82,C.green],
  ];
  bars.forEach(([name,value,color],index)=>{
    const y=1215+index*175;
    text(name,72,y,22,C.muted,'left',650);
    ctx.fillStyle=C.line;ctx.fillRect(72,y+38,W-144,28);
    ctx.fillStyle=color;ctx.fillRect(72,y+38,(W-144)*value*ease(p*1.4),28);
    text(Math.round(value*100)+'%',W-72,y,22,color,'right',700);
  });
  text('ONLY THE SELECTED SHOT GOES HQ',72,1550,24,C.paper,'left',700);
}
function caption(t){
  const cue=D.timeline.captions.find(c=>t>=c.start&&t<c.end);
  if(!cue)return;
  const progress=clamp((t-cue.start)/(cue.end-cue.start));
  ctx.fillStyle='rgba(7,10,11,.88)';ctx.fillRect(52,H-350,W-104,185);
  ctx.fillStyle=C.green;ctx.fillRect(52,H-350,(W-104)*progress,5);
  wrap(cue.text,W/2,H-288,W-170,58,42,C.paper,'center',720);
}
function transition(t,scene){
  const edge=Math.min((t-scene.start)/.16,(scene.end-t)/.14);
  const alpha=1-clamp(edge);
  if(alpha>0){
    ctx.fillStyle='rgba(87,226,223,'+(alpha*.12)+')';ctx.fillRect(0,0,W,H);
    for(let i=0;i<5;i++){
      const yy=((i*337+Math.floor(t*1000))%H);
      ctx.fillStyle='rgba(166,255,111,'+(alpha*.16)+')';ctx.fillRect(0,yy,W,3);
    }
  }
}
function finish(t){
  footer();
  const vignette=ctx.createRadialGradient(W/2,H/2,H*.24,W/2,H/2,H*.72);
  vignette.addColorStop(0,'rgba(0,0,0,0)');vignette.addColorStop(1,'rgba(0,0,0,.55)');
  ctx.fillStyle=vignette;ctx.fillRect(0,0,W,H);
  for(let i=0;i<420;i++){
    const x=(i*83+Math.floor(t*19)*17)%W;
    const y=(i*197+Math.floor(t*23)*31)%H;
    ctx.fillStyle='rgba(255,255,255,.025)';ctx.fillRect(x,y,1.5,1.5);
  }
}
window.renderAt=(t)=>{
  base(t);
  const scene=D.timeline.scenes.find((s,i)=>t>=s.start&&(t<s.end||(i===D.timeline.scenes.length-1&&t<=s.end)))||D.timeline.scenes[D.timeline.scenes.length-1];
  const p=local(scene,t);
  if(scene.id==='silent-intro')drawPresenter(p,false);
  else if(scene.id==='prompt-field')drawWireField(p,t);
  else if(scene.id==='approved-frame')drawApproved(p);
  else if(scene.id==='variant-filmstrip')drawFilmstrip(p);
  else if(scene.id==='seed-ledger')drawLedger(p,t);
  else if(scene.id==='selection-proof')drawSelection(p);
  else drawPresenter(p,true);
  caption(t);transition(t,scene);finish(t);
  return scene.id;
};
window.ready=Promise.all([
  load('presenter',D.presenter),
  ...D.variants.map((src,index)=>load('v'+index,src)),
]).then(()=>{window.renderAt(0);return true});
</script>
</body>
</html>`;
}

function reviewHtml({ videoName, contactSheetName, manifestName }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Local Video Forge — mixed-media proof</title>
  <style>
    :root{color-scheme:dark;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
    *{box-sizing:border-box}body{margin:0;background:#070a0b;color:#e8eee9}
    main{width:min(1120px,calc(100% - 32px));margin:0 auto;padding:40px 0 72px}
    header{border-top:3px solid #a6ff6f;padding-top:20px;margin-bottom:32px}
    p{color:#8d9c98;max-width:68ch;line-height:1.6}code{color:#57e2df}
    .grid{display:grid;grid-template-columns:minmax(260px,430px) 1fr;gap:28px;align-items:start}
    video,img{display:block;width:100%;background:#101616;border:1px solid #20302f}
    .proof{display:grid;gap:18px}.tag{color:#a6ff6f;font-size:.8rem;letter-spacing:.08em}
    @media(max-width:760px){main{padding-top:24px}.grid{grid-template-columns:1fr}}
  </style>
</head>
<body><main>
  <header><div class="tag">LOCAL VIDEO FORGE / MIXED-MEDIA PROOF</div>
    <h1>Render less. Choose better.</h1>
    <p>Kokoro narration, burned and external subtitles, ASCII/Canvas graphics,
    real variant evidence, and no manufactured facial lip-sync.</p>
  </header>
  <div class="grid">
    <video controls playsinline src="${videoName}"></video>
    <div class="proof">
      <img src="${contactSheetName}" alt="Representative frames from the rendered video">
      <p>Reproducibility receipt: <code>${manifestName}</code></p>
    </div>
  </div>
</main></body></html>`;
}

async function renderFrames({ page, framesDir, timeline, fps, width, height }) {
  const frameCount = Math.ceil(timeline.totalDurationSeconds * fps);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const t = frame / fps;
    await page.evaluate(({ seconds }) => window.renderAt(seconds), { seconds: t });
    await page.screenshot({
      path: path.join(framesDir, `frame-${String(frame + 1).padStart(4, '0')}.jpg`),
      type: 'jpeg',
      quality: 92,
      clip: { x: 0, y: 0, width, height },
    });
    if ((frame + 1) % fps === 0 || frame === frameCount - 1) {
      console.log(`[forge:demo] frames ${frame + 1}/${frameCount}`);
    }
  }
  return frameCount;
}

async function captureDesignEvidence({ browser, reviewPath, runDir }) {
  const evidenceDir = path.join(runDir, 'design-evidence');
  await mkdir(evidenceDir, { recursive: true });
  const page = await browser.newPage();
  await page.goto(`file://${reviewPath}`);
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.screenshot({
      path: path.join(evidenceDir, `after-${width}.png`),
      fullPage: true,
    });
  }
  await page.close();
  return evidenceDir;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await Promise.all([
    requireFile(options.presenter, 'presenter'),
    ...options.variants.map((filePath, index) => requireFile(filePath, `variant ${index + 1}`)),
  ]);

  const runId = new Date().toISOString().replaceAll(/[:.]/g, '-');
  const runDir = path.join(options.outputRoot, `demo-${runId}`);
  const framesDir = path.join(runDir, 'frames');
  const stillsDir = path.join(runDir, 'variant-stills');
  const voiceDir = path.join(runDir, 'voice');
  await Promise.all([
    mkdir(framesDir, { recursive: true }),
    mkdir(stillsDir, { recursive: true }),
    mkdir(voiceDir, { recursive: true }),
  ]);

  console.log(`[forge:demo] synthesizing ${options.voice} narration`);
  const tts = new KokoroTts({ voice: options.voice, speed: options.speed });
  const voiceResults = await tts.synthesizeScenes(
    FORGE_DEMO_CAPTIONS.map(({ text }) => ({ narration: text })),
    { outputDir: voiceDir, voice: options.voice, speed: options.speed },
  );
  const narrationPath = path.join(runDir, 'narration.wav');
  const concatInputs = voiceResults.flatMap(({ path: voicePath }) => ['-i', voicePath]);
  const concatStreams = voiceResults.map((_, index) => `[${index}:a]`).join('');
  await run('ffmpeg', [
    '-y',
    ...concatInputs,
    '-filter_complex', `${concatStreams}concat=n=${voiceResults.length}:v=0:a=1[a]`,
    '-map', '[a]',
    narrationPath,
  ]);
  const captionDurationsSeconds = await Promise.all(
    voiceResults.map(({ path: voicePath }) => durationSeconds(voicePath)),
  );
  const narrationDurationSeconds = await durationSeconds(narrationPath);
  const timeline = buildForgeDemoTimeline({
    narrationDurationSeconds,
    captionDurationsSeconds,
  });
  assertNoFalseLipSync(timeline);

  console.log('[forge:demo] extracting real variant evidence');
  const stillPaths = await Promise.all(options.variants.map(async (variant, index) => {
    const output = path.join(stillsDir, `seed-${[41, 42, 43][index]}.png`);
    await run('ffmpeg', ['-y', '-ss', '1.5', '-i', variant, '-frames:v', '1', output]);
    return output;
  }));

  const [presenter, ...variants] = await Promise.all([
    imageDataUrl(options.presenter),
    ...stillPaths.map((filePath) => imageDataUrl(filePath)),
  ]);
  const timelinePath = path.join(runDir, 'timeline.json');
  const captionsPath = path.join(runDir, 'captions.srt');
  await Promise.all([
    writeFile(timelinePath, `${JSON.stringify(timeline, null, 2)}\n`),
    writeFile(captionsPath, timelineToSrt(timeline)),
  ]);

  const browser = await chromium.launch({ headless: true });
  let frameCount;
  try {
    const page = await browser.newPage({
      viewport: { width: options.width, height: options.height },
      deviceScaleFactor: 1,
    });
    page.on('pageerror', (error) => console.error(`[forge:demo] browser page error: ${error.stack ?? error.message}`));
    const compositionSource = compositionHtml({
      width: options.width,
      height: options.height,
      timeline,
      presenter,
      variants,
    });
    await page.setContent(compositionSource, { waitUntil: 'load' });
    const rendererType = await page.evaluate(() => typeof window.renderAt);
    if (rendererType !== 'function') {
      throw new Error(`composition renderer did not initialize (renderAt is ${rendererType})`);
    }
    await page.evaluate(() => window.ready);
    frameCount = await renderFrames({
      page,
      framesDir,
      timeline,
      fps: options.fps,
      width: options.width,
      height: options.height,
    });
    await page.close();

    console.log('[forge:demo] encoding and muxing');
    const silentPath = path.join(runDir, 'picture.mp4');
    const videoPath = path.join(runDir, 'local-video-forge-mixed-media.mp4');
    await run('ffmpeg', [
      '-y',
      '-framerate', String(options.fps),
      '-i', path.join(framesDir, 'frame-%04d.jpg'),
      '-c:v', 'libx264',
      '-preset', 'slow',
      '-crf', '17',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      silentPath,
    ]);
    const delayMs = Math.round(timeline.audioOffsetSeconds * 1000);
    await run('ffmpeg', [
      '-y',
      '-i', silentPath,
      '-i', narrationPath,
      '-filter_complex', `[1:a]adelay=${delayMs}:all=1,apad=pad_dur=1[a]`,
      '-map', '0:v:0',
      '-map', '[a]',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-t', timeline.totalDurationSeconds.toFixed(3),
      '-movflags', '+faststart',
      videoPath,
    ]);

    const contactSheetPath = path.join(runDir, 'contact-sheet.jpg');
    await run('ffmpeg', [
      '-y',
      '-i', videoPath,
      '-vf', 'fps=0.5,scale=270:480:force_original_aspect_ratio=decrease,pad=270:480:(ow-iw)/2:(oh-ih)/2:color=070a0b,tile=4x2:padding=8:margin=8:color=070a0b',
      '-frames:v', '1',
      contactSheetPath,
    ]);

    const gitRevision = await run('git', ['rev-parse', 'HEAD']).then(
      ({ stdout }) => stdout.trim(),
      () => null,
    );
    const inputFiles = [options.presenter, ...options.variants, narrationPath];
    const manifest = {
      schemaVersion: 1,
      preset: 'local-video-forge-mixed-media-v1',
      createdAt: new Date().toISOString(),
      gitRevision,
      output: {
        video: path.basename(videoPath),
        captions: path.basename(captionsPath),
        narration: path.basename(narrationPath),
        timeline: path.basename(timelinePath),
        contactSheet: path.basename(contactSheetPath),
      },
      video: {
        width: options.width,
        height: options.height,
        fps: options.fps,
        frameCount,
        durationSeconds: timeline.totalDurationSeconds,
        codec: 'h264',
      },
      narration: {
        text: FORGE_DEMO_NARRATION,
        engine: 'kokoro-onnx',
        voice: options.voice,
        speed: options.speed,
        durationSeconds: narrationDurationSeconds,
      },
      composition: {
        lipSync: false,
        facePolicy: 'static presenter only; no moving mouth during narration',
        primitives: [
          'static-presenter',
          'ascii-field',
          'canvas-wireframe',
          'approved-frame-proof',
          'variant-filmstrip',
          'seed-ledger',
          'compute-selection-meter',
          'kinetic-captions',
          'grain-vignette-scanline',
        ],
        sceneIds: timeline.scenes.map(({ id }) => id),
      },
      inputs: Object.fromEntries(await Promise.all(inputFiles.map(async (filePath) => [
        path.relative(REPO_ROOT, filePath),
        { sha256: await sha256(filePath), bytes: (await stat(filePath)).size },
      ]))),
    };
    const manifestPath = path.join(runDir, 'manifest.json');
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const reviewPath = path.join(runDir, 'review.html');
    await writeFile(reviewPath, reviewHtml({
      videoName: path.basename(videoPath),
      contactSheetName: path.basename(contactSheetPath),
      manifestName: path.basename(manifestPath),
    }));
    const evidenceDir = await captureDesignEvidence({ browser, reviewPath, runDir });

    console.log(JSON.stringify({
      videoPath,
      captionsPath,
      narrationPath,
      manifestPath,
      contactSheetPath,
      reviewPath,
      evidenceDir,
      durationSeconds: timeline.totalDurationSeconds,
      lipSync: false,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`[forge:demo] ${error.stack ?? error.message}`);
  process.exitCode = 1;
});
