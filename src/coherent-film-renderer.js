import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFile,
  mkdir,
  readFile,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  coherentFilmToSrt,
  normalizeCoherentFilm,
} from './coherent-scene-composition.js';
import { bindFilmManifestToSkill } from './film-skills.js';

const execFileAsync = promisify(execFile);

export const COHERENT_VISUAL_PRIMITIVES = Object.freeze([
  'full-bleed-product-capture',
  'evidence-path',
  'focus-pull',
  'mask-zoom',
  'parallax-depth',
  'match-cut',
]);

const IMAGE_MIME_TYPES = new Map([
  ['.gif', 'image/gif'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
]);

const VIDEO_MIME_TYPES = new Map([
  ['.m4v', 'video/mp4'],
  ['.mov', 'video/quicktime'],
  ['.mp4', 'video/mp4'],
  ['.webm', 'video/webm'],
]);

function safeJson(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '')
    .slice(0, 64) || 'coherent-film';
}

function timestamp(date) {
  return date.toISOString().replaceAll(/[:.]/g, '-');
}

function decibelsToLinear(decibels) {
  return 10 ** (decibels / 20);
}

function resolveAssetSource(asset, sourceRoot) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(asset.source)) {
    throw new Error(`coherent local renderer does not fetch remote asset ${asset.id}`);
  }
  return path.resolve(sourceRoot, asset.source);
}

async function fileHash(filePath) {
  const bytes = await readFile(filePath);
  return createHash('sha256').update(bytes).digest('hex');
}

async function requireAssetFile(filePath, assetId) {
  const info = await stat(filePath).catch(() => null);
  if (!info?.isFile() || info.size === 0) {
    throw new Error(`asset ${assetId} is missing or empty: ${filePath}`);
  }
  return info;
}

async function commandLine(command, args) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      maxBuffer: 1024 * 1024 * 16,
    });
    return String(stdout || stderr).split('\n')[0].trim() || null;
  } catch {
    return null;
  }
}

export function assertCoherentFilmApproved(filmInput) {
  const film = filmInput?.filmSkill
    ? bindFilmManifestToSkill(filmInput)
    : normalizeCoherentFilm(filmInput);
  if (film.approval?.status !== 'approved') {
    throw new Error('coherent film manifest must have approval.status="approved" before rendering');
  }
  return film;
}

export function buildCoherentAudioPlan(filmInput) {
  const film = normalizeCoherentFilm(filmInput);
  const assetById = new Map(film.assets.map((asset) => [asset.id, asset]));
  const narration = film.audio.narration
    ? {
      ...film.audio.narration,
      source: assetById.get(film.audio.narration.assetId).source,
      end: film.audio.narration.end ?? film.totalDurationSeconds,
    }
    : null;
  const soundBed = film.audio.soundBed
    ? {
      ...film.audio.soundBed,
      source: assetById.get(film.audio.soundBed.assetId).source,
      end: film.audio.soundBed.end ?? film.totalDurationSeconds,
      ducking: narration
        ? {
          start: narration.start,
          end: narration.end,
          gainDb: film.audio.soundBed.gainDb - film.audio.soundBed.duckUnderNarrationDb,
        }
        : null,
    }
    : null;
  const sceneById = new Map(film.scenes.map((scene) => [scene.id, scene]));
  const effects = film.audio.effects.map((effect) => {
    const scene = effect.sceneId ? sceneById.get(effect.sceneId) : null;
    if (effect.sceneId && !scene) {
      throw new Error(`audio effect references unknown scene ${effect.sceneId}`);
    }
    return {
      ...effect,
      source: assetById.get(effect.assetId).source,
      start: scene && effect.start === 0 ? scene.start : effect.start,
      end: effect.end ?? null,
    };
  });
  return { narration, soundBed, effects };
}

export function buildCoherentCompositionHtml(filmInput, assetSources, options = {}) {
  const film = normalizeCoherentFilm(filmInput);
  const payload = safeJson({
    film,
    assetSources,
    reducedMotion: options.reducedMotion === true,
  });
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#080a0b}
    canvas{display:block;width:${film.format.width}px;height:${film.format.height}px}
  </style>
</head>
<body>
<canvas id="stage" width="${film.format.width}" height="${film.format.height}"></canvas>
<script>
const D=${payload};
const canvas=document.getElementById('stage');
const ctx=canvas.getContext('2d');
const W=D.film.format.width,H=D.film.format.height;
const media={};
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const ease=(n)=>{n=clamp(n);return n<.5?4*n*n*n:1-Math.pow(-2*n+2,3)/2};
const palette={
  bg:D.film.style.background||'#080a0b',
  paper:D.film.style.foreground||'#f4f2ec',
  muted:D.film.style.muted||'#8d9895',
  accent:D.film.style.accent||'#8cffb0',
  danger:D.film.style.danger||'#ff5e68',
};

function roundedRect(x,y,w,h,r){
  ctx.beginPath();ctx.roundRect(x,y,w,h,r);
}
function cover(item,x,y,w,h,scale=1,focusX=.5,focusY=.5){
  const ratio=Math.max(w/item.videoWidth||w/item.width,h/item.videoHeight||h/item.height)*scale;
  const iw=item.videoWidth||item.width,ih=item.videoHeight||item.height;
  const sw=w/ratio,sh=h/ratio;
  const sx=clamp(iw*focusX-sw/2,0,Math.max(0,iw-sw));
  const sy=clamp(ih*focusY-sh/2,0,Math.max(0,ih-sh));
  ctx.drawImage(item,sx,sy,sw,sh,x,y,w,h);
}
function base(){
  ctx.fillStyle=palette.bg;ctx.fillRect(0,0,W,H);
  const glow=ctx.createRadialGradient(W*.5,H*.44,0,W*.5,H*.44,W*.75);
  glow.addColorStop(0,'rgba(80,255,170,.08)');glow.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);
}
function mediaFor(assetId){return media[assetId]}
function drawMissing(assetId){
  ctx.fillStyle='#121718';ctx.fillRect(0,0,W,H);
  ctx.fillStyle=palette.muted;ctx.font='600 '+Math.round(W*.034)+'px ui-monospace,monospace';
  ctx.textAlign='center';ctx.fillText('MISSING VISUAL / '+assetId,W/2,H/2);
}
function drawBrowserFrame(item,p,q){
  const margin=Number(q.margin)||W*.065,top=Number(q.top)||H*.12;
  const frameW=W-margin*2,frameH=H-top-margin,bar=Math.max(42,W*.068);
  ctx.save();ctx.shadowColor='rgba(0,0,0,.46)';ctx.shadowBlur=W*.045;ctx.shadowOffsetY=W*.018;
  ctx.fillStyle='#171b1d';roundedRect(margin,top,frameW,frameH,W*.025);ctx.fill();ctx.restore();
  ctx.save();roundedRect(margin,top,frameW,frameH,W*.025);ctx.clip();
  ctx.fillStyle='#252a2c';ctx.fillRect(margin,top,frameW,bar);
  ['#ff6259','#ffbe2f','#2aca44'].forEach((color,index)=>{ctx.fillStyle=color;ctx.beginPath();ctx.arc(margin+W*(.031+index*.029),top+bar/2,W*.009,0,Math.PI*2);ctx.fill()});
  const addressX=margin+W*.14,addressW=frameW-W*.19;
  ctx.fillStyle='rgba(255,255,255,.075)';roundedRect(addressX,top+bar*.24,addressW,bar*.52,bar*.18);ctx.fill();
  const scale=1+(Number(q.push)||.018)*ease(p);
  cover(item,margin,top+bar,frameW,frameH-bar,scale,Number(q.focusX)||.5,Number(q.focusY)||.5);
  ctx.restore();
  ctx.strokeStyle='rgba(255,255,255,.16)';ctx.lineWidth=2;roundedRect(margin,top,frameW,frameH,W*.025);ctx.stroke();
}
function drawFullBleedProductCapture(scene,p,item){
  if(!item)return drawMissing(scene.dominant.assetId);
  const q=scene.dominant.params||{};
  if(q.deviceFrame){drawBrowserFrame(item,p,q);return}
  const scale=1+(Number(q.push)||.025)*ease(p);
  ctx.save();cover(item,0,0,W,H,scale,Number(q.focusX)||.5,Number(q.focusY)||.5);ctx.restore();
  const shade=ctx.createLinearGradient(0,0,0,H);
  shade.addColorStop(0,'rgba(0,0,0,.03)');shade.addColorStop(.7,'rgba(0,0,0,.08)');shade.addColorStop(1,'rgba(0,0,0,.56)');
  ctx.fillStyle=shade;ctx.fillRect(0,0,W,H);
}
function drawEvidencePath(scene,p,item){
  if(item){ctx.save();ctx.globalAlpha=.42;cover(item,0,0,W,H,1.03);ctx.restore()}
  const q=scene.dominant.params||{};
  const points=Array.isArray(q.points)&&q.points.length>1?q.points:[[.18,.25],[.72,.35],[.34,.58],[.76,.76]];
  const progress=ease(p);
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=Math.max(4,W*.008);
  ctx.shadowBlur=W*.035;ctx.shadowColor=palette.accent;ctx.strokeStyle=palette.accent;
  ctx.beginPath();
  let remaining=progress*(points.length-1);
  for(let i=0;i<points.length;i+=1){
    const x=points[i][0]*W,y=points[i][1]*H;
    if(i===0)ctx.moveTo(x,y);
    else if(remaining>=1){ctx.lineTo(x,y);remaining-=1}
    else if(remaining>0){
      const prev=points[i-1];ctx.lineTo((prev[0]+(points[i][0]-prev[0])*remaining)*W,(prev[1]+(points[i][1]-prev[1])*remaining)*H);break;
    }else break;
  }
  ctx.stroke();ctx.shadowBlur=0;
  points.forEach((point,index)=>{
    const appeared=clamp(progress*(points.length-1)-index+1);
    ctx.globalAlpha=appeared;ctx.fillStyle=index===points.length-1?palette.accent:palette.paper;
    ctx.beginPath();ctx.arc(point[0]*W,point[1]*H,W*.013,0,Math.PI*2);ctx.fill();
  });
  ctx.restore();
}
function drawFocusPull(scene,p,item){
  if(!item)return drawMissing(scene.dominant.assetId);
  const q=scene.dominant.params||{};
  const x=(Number(q.focusX)||.5)*W,y=(Number(q.focusY)||.5)*H;
  const focus=ease(clamp(p*2.25));
  const radius=(Number(q.radius)||.26)*W*(.7+.3*focus);
  ctx.save();ctx.filter='blur('+Math.round((1-focus)*12)+'px)';cover(item,0,0,W,H,1.04);ctx.restore();
  ctx.save();ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.clip();cover(item,0,0,W,H,1.015,Number(q.focusX)||.5,Number(q.focusY)||.5);ctx.restore();
  ctx.strokeStyle='rgba(255,255,255,.22)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.stroke();
}
function drawMaskZoom(scene,p,item){
  if(!item)return drawMissing(scene.dominant.assetId);
  const q=scene.dominant.params||{};
  const t=ease(p),margin=W*(.20*(1-t)+.045);
  const y=H*(.28*(1-t)+.055),h=H-(y+margin);
  ctx.save();roundedRect(margin,y,W-margin*2,h,W*.035);ctx.clip();
  cover(item,margin,y,W-margin*2,h,1+(Number(q.zoom)||.18)*(1-t),Number(q.focusX)||.5,Number(q.focusY)||.5);
  ctx.restore();
  ctx.strokeStyle='rgba(255,255,255,.18)';ctx.lineWidth=2;roundedRect(margin,y,W-margin*2,h,W*.035);ctx.stroke();
}
function drawParallaxDepth(scene,p,item){
  if(!item)return drawMissing(scene.dominant.assetId);
  const q=scene.dominant.params||{},t=ease(p),focusX=Number(q.focusX)||.5,focusY=Number(q.focusY)||.5;
  const driftX=focusX+(.012-.024*t),driftY=focusY+(.008*t);
  ctx.save();cover(item,0,0,W,H,1.018+.028*t,driftX,driftY);ctx.restore();
  const shade=ctx.createLinearGradient(0,0,0,H);shade.addColorStop(0,'rgba(0,0,0,.02)');shade.addColorStop(.72,'rgba(0,0,0,.06)');shade.addColorStop(1,'rgba(0,0,0,.52)');ctx.fillStyle=shade;ctx.fillRect(0,0,W,H);
}
function drawMatchCut(scene,p,item,support){
  if(!item)return drawMissing(scene.dominant.assetId);
  const q=ease(p),split=clamp((q-.36)/.28);
  if(!support){
    ctx.save();cover(item,0,0,W,H,1+.025*q);ctx.restore();
    const pulse=1-clamp(Math.abs(q-.5)*7);ctx.fillStyle='rgba(255,255,255,'+(.055*pulse)+')';ctx.fillRect(0,0,W,H);return;
  }
  ctx.save();ctx.globalAlpha=1-split;cover(item,0,0,W,H,1+.035*q);ctx.restore();
  ctx.save();ctx.globalAlpha=split;cover(support,0,0,W,H,1.035-.035*q);ctx.restore();
  const flash=1-clamp(Math.abs(q-.5)*8);
  ctx.fillStyle='rgba(255,255,255,'+(.16*flash)+')';ctx.fillRect(0,0,W,H);
}
const primitives={
  'full-bleed-product-capture':drawFullBleedProductCapture,
  'evidence-path':drawEvidencePath,
  'focus-pull':drawFocusPull,
  'mask-zoom':drawMaskZoom,
  'parallax-depth':drawParallaxDepth,
  'match-cut':drawMatchCut,
};
function drawCaption(seconds){
  const cues=D.film.captions.length?D.film.captions:D.film.scenes.filter(s=>s.caption).map(s=>({start:s.start,end:s.end,text:s.caption,burn:true,position:'bottom'}));
  const cue=cues.find(c=>c.burn!==false&&seconds>=c.start&&seconds<c.end);
  if(!cue)return;
  const size=Math.round(W*.052),pad=W*.035,maxWidth=W*.82;
  ctx.font='700 '+size+'px Inter,system-ui,sans-serif';
  const words=cue.text.split(/\\s+/),lines=[];let line='';
  for(const word of words){
    const next=line?line+' '+word:word;
    if(ctx.measureText(next).width>maxWidth&&line){lines.push(line);line=word}else line=next;
  }
  if(line)lines.push(line);
  const boxH=lines.length*size*1.18+pad*1.25;
  const y=cue.position==='top'?H*.075:H-H*.065-boxH;
  ctx.fillStyle='rgba(5,7,8,.78)';roundedRect((W-maxWidth)/2-pad,y,maxWidth+pad*2,boxH,W*.022);ctx.fill();
  ctx.fillStyle=palette.paper;ctx.textAlign='center';ctx.textBaseline='middle';
  lines.forEach((value,index)=>ctx.fillText(value,W/2,y+pad*.62+size*.58+index*size*1.18));
}
function transitionOverlay(scene,p){
  const edge=clamp(p/.12);
  if(scene.transition==='fade'){
    ctx.fillStyle='rgba(8,10,11,'+(1-edge)+')';ctx.fillRect(0,0,W,H);
  }else if(scene.transition==='wipe'&&p<.16){
    const travel=ease(p/.12),tail=1-clamp((p-.10)/.06),x=W*travel;
    ctx.save();ctx.globalAlpha=.42*tail;ctx.fillStyle=palette.paper;ctx.shadowBlur=W*.025;ctx.shadowColor=palette.paper;ctx.fillRect(x-W*.012,0,W*.018,H);ctx.restore();
  }else if(scene.transition==='beam-wipe'&&p<.22){
    const travel=clamp(p/.16),tail=1-clamp((p-.16)/.06),x=W*travel;
    ctx.save();ctx.globalAlpha=tail;ctx.fillStyle=palette.accent;ctx.shadowBlur=W*.04;ctx.shadowColor=palette.accent;ctx.fillRect(x-W*.01,0,W*.012,H);ctx.restore();
  }else if(scene.transition==='match-cut'&&p<.12){
    const flash=1-clamp(p/.12);ctx.fillStyle='rgba(244,242,236,'+(.12*flash)+')';ctx.fillRect(0,0,W,H);
  }
}
async function seekVideos(scene,seconds){
  const localSeconds=Math.max(0,seconds-scene.start);
  const boundParams=new Map([[scene.dominant.assetId,scene.dominant.params||{}],...scene.supporting.map(binding=>[binding.assetId,binding.params||{}])]);
  const jobs=Object.entries(media).filter(([assetId,item])=>boundParams.has(assetId)&&item instanceof HTMLVideoElement&&item.readyState>=1).map(([assetId,item])=>new Promise(resolve=>{
    const duration=Number.isFinite(item.duration)&&item.duration>0?item.duration:D.film.totalDurationSeconds;
    const params=boundParams.get(assetId);
    const sourceSeconds=D.reducedMotion
      ? (Number(params?.clipStartSeconds)||0)+(Number(params?.stillFrameSeconds)||Math.min(1.5,duration/2))
      : params
      ? (Number(params.clipStartSeconds)||0)+localSeconds*(Number(params.playbackRate)||1)
      : seconds;
    const target=Math.min(Math.max(0,sourceSeconds%duration),Math.max(0,duration-.001));
    if(Math.abs(item.currentTime-target)<.012){resolve();return}
    const done=()=>{item.removeEventListener('seeked',done);resolve()};
    item.addEventListener('seeked',done,{once:true});item.currentTime=target;setTimeout(done,800);
  }));
  await Promise.all(jobs);
}
window.renderAt=async(seconds)=>{
  const scene=D.film.scenes.find((entry,index)=>seconds>=entry.start&&(seconds<entry.end||(index===D.film.scenes.length-1&&seconds<=entry.end)))||D.film.scenes.at(-1);
  await seekVideos(scene,seconds);
  base();
  const p=D.reducedMotion?1:clamp((seconds-scene.start)/(scene.end-scene.start));
  const item=mediaFor(scene.dominant.assetId);
  const support=scene.supporting[0]?mediaFor(scene.supporting[0].assetId):null;
  const primitive=primitives[scene.dominant.kind]||drawFullBleedProductCapture;
  primitive(scene,p,item,support);
  if(scene.supporting[0]&&scene.dominant.kind!=='match-cut'&&scene.supporting[0].kind==='evidence-path'){
    drawEvidencePath({...scene,dominant:scene.supporting[0]},p,null);
  }
  if(!D.reducedMotion)transitionOverlay(scene,p);
  drawCaption(seconds);
};
window.ready=Promise.all(Object.entries(D.assetSources).map(([id,source])=>new Promise((resolve,reject)=>{
  const item=source.mime.startsWith('video/')?document.createElement('video'):new Image();
  if(item instanceof HTMLVideoElement){item.muted=true;item.playsInline=true;item.preload='auto';item.onloadeddata=()=>{media[id]=item;resolve()}}
  else item.onload=()=>{media[id]=item;resolve()};
  item.onerror=()=>reject(new Error('failed to load asset '+id));item.src=source.url;
}))).then(()=>window.renderAt(0));
</script>
</body>
</html>`;
}

export async function createCoherentRenderPackage({
  filmInput,
  manifestPath,
  outputRoot,
  now = () => new Date(),
  engineRevisions = {},
  reducedMotion = false,
}) {
  const film = assertCoherentFilmApproved(filmInput);
  const sourceRoot = manifestPath ? path.dirname(path.resolve(manifestPath)) : process.cwd();
  const absoluteOutputRoot = path.resolve(outputRoot);
  await mkdir(absoluteOutputRoot, { recursive: true });
  const stem = `${slug(film.id)}-${timestamp(now())}`;
  let runDir;
  for (let attempt = 1; attempt <= 999; attempt += 1) {
    const suffix = attempt === 1 ? '' : `-${String(attempt).padStart(2, '0')}`;
    const candidate = path.join(absoluteOutputRoot, `${stem}${suffix}`);
    try {
      await mkdir(candidate);
      runDir = candidate;
      break;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
  }
  if (!runDir) throw new Error(`could not allocate collision-free render directory under ${absoluteOutputRoot}`);

  const directories = {
    audio: path.join(runDir, 'audio'),
    frames: path.join(runDir, 'frames'),
    review: path.join(runDir, 'review'),
  };
  await Promise.all(Object.values(directories).map((dir) => mkdir(dir)));

  const assetFiles = {};
  const inputHashes = {};
  for (const asset of film.assets) {
    const sourcePath = resolveAssetSource(asset, sourceRoot);
    const info = await requireAssetFile(sourcePath, asset.id);
    assetFiles[asset.id] = sourcePath;
    inputHashes[asset.id] = {
      source: asset.source,
      bytes: info.size,
      sha256: await fileHash(sourcePath),
    };
  }
  if (manifestPath) {
    const absoluteManifestPath = path.resolve(manifestPath);
    const info = await stat(absoluteManifestPath);
    inputHashes.$manifest = {
      source: path.basename(absoluteManifestPath),
      bytes: info.size,
      sha256: await fileHash(absoluteManifestPath),
    };
  }

  const licenses = Object.fromEntries(film.assets.map((asset) => [
    asset.id,
    {
      source: asset.source,
      sourceType: asset.sourceType,
      sourceRevision: asset.sourceRevision,
      license: asset.license,
      publicationTier: asset.tier,
      evidence: asset.evidence,
    },
  ]));
  const timeline = {
    schema: film.schema,
    filmId: film.id,
    spine: film.spine,
    directionId: film.directionId,
    format: film.format,
    durationSeconds: film.totalDurationSeconds,
    scenes: film.scenes,
    captions: film.captions,
    audio: film.audio,
    render: { reducedMotion },
  };
  const paths = {
    manifest: path.join(runDir, 'manifest.json'),
    timeline: path.join(runDir, 'timeline.json'),
    captions: path.join(runDir, 'captions.srt'),
    licenses: path.join(runDir, 'licenses.json'),
    inputHashes: path.join(runDir, 'input-hashes.json'),
    engineRevisions: path.join(runDir, 'engine-revisions.json'),
    video: path.join(runDir, 'film.mp4'),
    picture: path.join(runDir, 'picture.mp4'),
    outputHashes: path.join(runDir, 'output-hashes.json'),
    completion: path.join(runDir, 'completed.json'),
  };
  await Promise.all([
    writeFile(paths.manifest, `${JSON.stringify(film, null, 2)}\n`),
    writeFile(paths.timeline, `${JSON.stringify(timeline, null, 2)}\n`),
    writeFile(paths.captions, coherentFilmToSrt(film)),
    writeFile(paths.licenses, `${JSON.stringify(licenses, null, 2)}\n`),
    writeFile(paths.inputHashes, `${JSON.stringify(inputHashes, null, 2)}\n`),
    writeFile(paths.engineRevisions, `${JSON.stringify(engineRevisions, null, 2)}\n`),
  ]);

  let narrationSource = null;
  if (film.audio.narration) {
    const sourcePath = assetFiles[film.audio.narration.assetId];
    narrationSource = path.join(directories.audio, `narration${path.extname(sourcePath)}`);
    await copyFile(sourcePath, narrationSource);
  }

  return {
    film,
    sourceRoot,
    runDir,
    directories,
    paths,
    assetFiles,
    narrationSource,
  };
}

async function assetDataSources(film, assetFiles) {
  return Object.fromEntries(await Promise.all(film.assets
    .filter((asset) => {
      const extension = path.extname(assetFiles[asset.id]).toLowerCase();
      return IMAGE_MIME_TYPES.has(extension) || VIDEO_MIME_TYPES.has(extension);
    })
    .map(async (asset) => {
      const sourcePath = assetFiles[asset.id];
      const extension = path.extname(sourcePath).toLowerCase();
      const mime = IMAGE_MIME_TYPES.get(extension) ?? VIDEO_MIME_TYPES.get(extension);
      const bytes = await readFile(sourcePath);
      return [asset.id, { mime, url: `data:${mime};base64,${bytes.toString('base64')}` }];
    })));
}

async function renderFrames({ page, film, framesDir, reviewDir }) {
  const frameCount = Math.ceil(film.totalDurationSeconds * film.format.fps);
  const reviewFrames = new Map();
  for (const scene of film.scenes) {
    const frame = Math.min(
      frameCount - 1,
      Math.round(((scene.start + scene.end) / 2) * film.format.fps),
    );
    reviewFrames.set(frame, [...(reviewFrames.get(frame) ?? []), scene.id]);
  }
  for (let frame = 0; frame < frameCount; frame += 1) {
    await page.evaluate((seconds) => window.renderAt(seconds), frame / film.format.fps);
    const framePath = path.join(framesDir, `frame-${String(frame + 1).padStart(6, '0')}.jpg`);
    await page.screenshot({
      path: framePath,
      type: 'jpeg',
      quality: 92,
      clip: {
        x: 0,
        y: 0,
        width: film.format.width,
        height: film.format.height,
      },
    });
    if (reviewFrames.has(frame)) {
      await Promise.all(reviewFrames.get(frame).map(
        (sceneId) => copyFile(framePath, path.join(reviewDir, `${slug(sceneId)}.jpg`)),
      ));
    }
  }
  return frameCount;
}

function ffmpegAudioArguments({ film, audioPlan, assetFiles, picturePath, outputPath }) {
  const args = ['-y', '-i', picturePath];
  const filters = [];
  const mixLabels = [];
  let inputIndex = 1;

  if (audioPlan.narration) {
    args.push('-i', assetFiles[audioPlan.narration.assetId]);
    const delay = Math.round(audioPlan.narration.start * 1000);
    const duration = Math.max(0, audioPlan.narration.end - audioPlan.narration.start);
    filters.push(
      `[${inputIndex}:a]atrim=0:${duration},asetpts=N/SR/TB,adelay=${delay}:all=1,volume=${decibelsToLinear(audioPlan.narration.gainDb).toFixed(6)}[narration]`,
    );
    mixLabels.push('[narration]');
    inputIndex += 1;
  }
  if (audioPlan.soundBed) {
    args.push('-stream_loop', '-1', '-i', assetFiles[audioPlan.soundBed.assetId]);
    const normal = decibelsToLinear(audioPlan.soundBed.gainDb).toFixed(6);
    const ducked = audioPlan.soundBed.ducking
      ? decibelsToLinear(audioPlan.soundBed.ducking.gainDb).toFixed(6)
      : normal;
    const expression = audioPlan.soundBed.ducking
      ? `if(between(t\\,${audioPlan.soundBed.ducking.start}\\,${audioPlan.soundBed.ducking.end})\\,${ducked}\\,${normal})`
      : normal;
    const delay = Math.round(audioPlan.soundBed.start * 1000);
    const duration = Math.max(0, audioPlan.soundBed.end - audioPlan.soundBed.start);
    filters.push(
      `[${inputIndex}:a]atrim=0:${duration},asetpts=N/SR/TB,adelay=${delay}:all=1,volume='${expression}':eval=frame[bed]`,
    );
    mixLabels.push('[bed]');
    inputIndex += 1;
  }
  audioPlan.effects.forEach((effect, effectIndex) => {
    args.push('-i', assetFiles[effect.assetId]);
    const delay = Math.round(effect.start * 1000);
    const label = `effect${effectIndex}`;
    const trim = effect.end === null ? '' : `atrim=0:${Math.max(0, effect.end - effect.start)},`;
    filters.push(
      `[${inputIndex}:a]${trim}asetpts=N/SR/TB,adelay=${delay}:all=1,volume=${decibelsToLinear(effect.gainDb).toFixed(6)}[${label}]`,
    );
    mixLabels.push(`[${label}]`);
    inputIndex += 1;
  });

  if (mixLabels.length === 0) {
    return [...args, '-map', '0:v:0', '-c:v', 'copy', '-an', '-movflags', '+faststart', outputPath];
  }
  filters.push(
    `${mixLabels.join('')}amix=inputs=${mixLabels.length}:duration=longest:normalize=0,atrim=0:${film.totalDurationSeconds},loudnorm=I=-16:TP=-1.5:LRA=11[mix]`,
  );
  return [
    ...args,
    '-filter_complex', filters.join(';'),
    '-map', '0:v:0',
    '-map', '[mix]',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-t', film.totalDurationSeconds.toFixed(3),
    '-movflags', '+faststart',
    outputPath,
  ];
}

export async function renderCoherentFilm({
  filmInput,
  manifestPath,
  outputRoot,
  now,
  ffmpegPath = process.env.FFMPEG_PATH ?? 'ffmpeg',
  chromeExecutablePath,
  reducedMotion = false,
}) {
  const film = assertCoherentFilmApproved(filmInput);
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    headless: true,
    ...(chromeExecutablePath ? { executablePath: chromeExecutablePath } : {}),
  });
  let packageResult;
  try {
    const engineRevisions = {
      node: process.version,
      reelPipelineGitRevision: await commandLine('git', ['rev-parse', 'HEAD']),
      ffmpeg: await commandLine(ffmpegPath, ['-version']),
      chromium: await browser.version(),
      compositor: reducedMotion
        ? 'coherent-canvas-v1-reduced-motion'
        : 'coherent-canvas-v1',
    };
    packageResult = await createCoherentRenderPackage({
      filmInput: film,
      manifestPath,
      outputRoot,
      now,
      engineRevisions,
      reducedMotion,
    });
    const dataSources = await assetDataSources(film, packageResult.assetFiles);
    const page = await browser.newPage({
      viewport: {
        width: film.format.width,
        height: film.format.height,
      },
      deviceScaleFactor: 1,
    });
    await page.setContent(buildCoherentCompositionHtml(film, dataSources, {
      reducedMotion,
    }), {
      waitUntil: 'load',
    });
    await page.evaluate(() => window.ready);
    const frameCount = await renderFrames({
      page,
      film,
      framesDir: packageResult.directories.frames,
      reviewDir: packageResult.directories.review,
    });
    await page.close();

    await execFileAsync(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error',
      '-y',
      '-framerate', String(film.format.fps),
      '-i', path.join(packageResult.directories.frames, 'frame-%06d.jpg'),
      '-c:v', 'libx264',
      '-preset', 'slow',
      '-crf', '17',
      '-pix_fmt', 'yuv420p',
      '-color_primaries', 'bt709',
      '-color_trc', 'bt709',
      '-colorspace', 'bt709',
      '-color_range', 'tv',
      '-x264-params', 'colorprim=bt709:transfer=bt709:colormatrix=bt709:range=limited',
      '-movflags', '+faststart',
      packageResult.paths.picture,
    ], { maxBuffer: 1024 * 1024 * 64 });
    const audioPlan = buildCoherentAudioPlan(film);
    await execFileAsync(
      ffmpegPath,
      ['-hide_banner', '-loglevel', 'error', ...ffmpegAudioArguments({
        film,
        audioPlan,
        assetFiles: packageResult.assetFiles,
        picturePath: packageResult.paths.picture,
        outputPath: packageResult.paths.video,
      })],
      { maxBuffer: 1024 * 1024 * 64 },
    );

    const hashTargets = [
      packageResult.paths.video,
      packageResult.paths.timeline,
      packageResult.paths.captions,
      packageResult.paths.licenses,
      packageResult.paths.engineRevisions,
      ...(packageResult.narrationSource ? [packageResult.narrationSource] : []),
    ];
    const outputHashes = Object.fromEntries(await Promise.all(hashTargets.map(async (filePath) => [
      path.relative(packageResult.runDir, filePath),
      { sha256: await fileHash(filePath), bytes: (await stat(filePath)).size },
    ])));
    await writeFile(packageResult.paths.outputHashes, `${JSON.stringify(outputHashes, null, 2)}\n`);
    await writeFile(packageResult.paths.completion, `${JSON.stringify({
      completedAt: new Date().toISOString(),
      frameCount,
      video: path.basename(packageResult.paths.video),
      reviewFrames: film.scenes.map((scene) => `review/${slug(scene.id)}.jpg`),
    }, null, 2)}\n`);
    return { ...packageResult, frameCount, outputHashes };
  } finally {
    await browser.close();
  }
}
