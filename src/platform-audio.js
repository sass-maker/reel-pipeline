import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const SPOTIFY_TRACK_ID = /^[A-Za-z0-9]{22}$/;
const TARGET_PLATFORMS = new Set(['youtube_shorts', 'instagram_reels', 'tiktok']);

export function normalizePlatformAudioReference(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('platform audio reference must be an object');
  }
  if (input.audioPath || input.audioUrl || input.mediaUrl || input.downloadUrl || input.url) {
    throw new Error('platform audio reference cannot contain a direct media URL or local audio path');
  }
  if (input.provider !== 'youtube') throw new Error('platform audio provider must be youtube');
  const suppliedVideoId = optionalString(input.videoId);
  const suppliedYouTubeUrl = optionalString(input.youtubeUrl);
  const urlVideoId = suppliedYouTubeUrl ? youtubeVideoIdFromUrl(suppliedYouTubeUrl) : null;
  if (suppliedVideoId && urlVideoId && suppliedVideoId !== urlVideoId) {
    throw new Error('platformAudio.videoId does not match platformAudio.youtubeUrl');
  }
  const videoId = suppliedVideoId || urlVideoId;
  if (!videoId) throw new Error('platformAudio.youtubeUrl or platformAudio.videoId is required');
  if (!YOUTUBE_ID.test(videoId)) throw new Error('platformAudio.videoId must be an 11-character YouTube video identifier');
  const artist = requiredString(input.artist, 'platformAudio.artist');
  const title = requiredString(input.title, 'platformAudio.title');
  const spotifyTrackId = optionalString(input.spotifyTrackId);
  if (spotifyTrackId && !SPOTIFY_TRACK_ID.test(spotifyTrackId)) {
    throw new Error('platformAudio.spotifyTrackId must be a 22-character Spotify track identifier');
  }
  const startSeconds = boundedNumber(input.startSeconds ?? 0, 'platformAudio.startSeconds', 0, 21_600);
  const durationSeconds = boundedNumber(input.durationSeconds, 'platformAudio.durationSeconds', 5, 60);
  const targetPlatform = TARGET_PLATFORMS.has(input.targetPlatform) ? input.targetPlatform : 'youtube_shorts';
  return {
    schema: 'fleet.platform-audio-reference.v1',
    provider: 'youtube',
    videoId,
    youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
    artist,
    title,
    spotifyTrackId,
    reviewProvider: spotifyTrackId ? 'spotify' : 'youtube',
    startSeconds,
    durationSeconds,
    targetPlatform,
    sourcePosture: 'operator-supplied-official-embed',
    embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&playsinline=1`,
    reviewEmbedUrl: spotifyTrackId
      ? `https://open.spotify.com/embed/track/${spotifyTrackId}`
      : `https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&playsinline=1`,
    playbackBoundary: 'Official platform stream for local review only; no audio is downloaded, cached, or exported.',
  };
}

export function youtubeVideoIdFromUrl(value) {
  let parsed;
  try {
    parsed = new URL(requiredString(value, 'platformAudio.youtubeUrl'));
  } catch {
    throw new Error('platformAudio.youtubeUrl must be a valid official YouTube URL');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('platformAudio.youtubeUrl must use HTTPS');
  }

  const hostname = parsed.hostname.toLowerCase();
  let videoId = null;
  if (hostname === 'youtu.be' || hostname.endsWith('.youtu.be')) {
    videoId = parsed.pathname.split('/').filter(Boolean)[0] || null;
  } else if (
    hostname === 'youtube.com' || hostname.endsWith('.youtube.com') ||
    hostname === 'youtube-nocookie.com' || hostname.endsWith('.youtube-nocookie.com')
  ) {
    const segments = parsed.pathname.split('/').filter(Boolean);
    videoId = parsed.pathname === '/watch'
      ? parsed.searchParams.get('v')
      : (['shorts', 'embed', 'live'].includes(segments[0]) ? segments[1] : null);
  } else {
    throw new Error('platformAudio.youtubeUrl must be hosted by YouTube');
  }

  if (!videoId || !YOUTUBE_ID.test(videoId)) {
    throw new Error('platformAudio.youtubeUrl must identify a YouTube video');
  }
  return videoId;
}

export async function createPlatformAudioPreview(input, options = {}) {
  const reference = normalizePlatformAudioReference(input?.reference);
  const videoPath = path.resolve(requiredString(input?.videoPath, 'videoPath'));
  const artifactRoot = path.resolve(requiredString(input?.artifactDir, 'artifactDir'));
  const now = options.now ?? (() => new Date());
  const runId = `platform_audio_${now().toISOString().replace(/\D/g, '').slice(0, 14)}_${reference.videoId}`;
  const runDir = path.join(artifactRoot, 'platform-audio', runId);
  await mkdir(runDir, { recursive: true });

  const silentMasterPath = path.join(runDir, 'silent-upload-master.mp4');
  const commandRunner = options.commandRunner ?? defaultCommandRunner;
  await commandRunner(options.ffmpegPath ?? 'ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', videoPath,
    '-map', '0:v:0',
    '-an',
    '-c:v', 'copy',
    '-movflags', '+faststart',
    silentMasterPath,
  ], { timeout: 5 * 60_000, maxBuffer: 16 * 1024 * 1024 });

  const probe = options.probeMedia ?? probeMedia;
  const media = await probe(silentMasterPath, { commandRunner, ffprobePath: options.ffprobePath });
  if (!media.hasVideo) throw new Error('silent upload master has no video stream');
  if (media.hasAudio) throw new Error('silent upload master still contains an audio stream');

  const videoInfo = await artifactInfo(silentMasterPath);
  const receipt = {
    schema: 'fleet.silent-upload-master.v1',
    verdict: 'pass',
    generatedAt: now().toISOString(),
    sourceVideoPath: videoPath,
    silentMasterPath,
    video: videoInfo,
    probe: media,
    audioStreams: 0,
  };
  const receiptPath = path.join(runDir, 'silent-export-receipt.json');
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);

  const handoff = {
    schema: 'fleet.platform-audio-handoff.v1',
    provider: reference.provider,
    targetPlatform: reference.targetPlatform,
    artist: reference.artist,
    title: reference.title,
    videoId: reference.videoId,
    excerptStartSeconds: reference.startSeconds,
    durationSeconds: reference.durationSeconds,
    instruction: `Upload the silent master, then attach “${reference.title}” by ${reference.artist} from the official ${platformName(reference.targetPlatform)} sound library. Use ${formatTime(reference.startSeconds)} as the review starting point for ${reference.durationSeconds} seconds, then confirm the exact offset in the platform editor.`,
    rightsNote: 'The platform reference permits in-product review and attachment only; it is not a downloaded or cross-platform audio licence.',
  };
  const handoffPath = path.join(runDir, 'platform-audio-handoff.json');
  await writeFile(handoffPath, `${JSON.stringify(handoff, null, 2)}\n`);

  const preview = {
    schema: 'fleet.platform-audio-preview.v1',
    createdAt: now().toISOString(),
    reference,
    silentMasterPath,
    receiptPath,
    handoffPath,
    handoff,
    ready: true,
    boundary: `Review streams the official ${reference.reviewProvider === 'spotify' ? 'Spotify' : 'YouTube'} source. The upload artifact is verified silent.`,
  };
  const manifestPath = path.join(runDir, 'preview-manifest.json');
  await writeFile(manifestPath, `${JSON.stringify(preview, null, 2)}\n`);
  return { ...preview, manifestPath };
}

export async function probeMedia(filePath, options = {}) {
  const commandRunner = options.commandRunner ?? defaultCommandRunner;
  const { stdout } = await commandRunner(options.ffprobePath ?? 'ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration,size:stream=codec_name,codec_type,width,height,r_frame_rate',
    '-of', 'json',
    filePath,
  ], { timeout: 60_000, maxBuffer: 4 * 1024 * 1024 });
  const parsed = JSON.parse(stdout);
  const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
  const video = streams.find((stream) => stream.codec_type === 'video');
  return {
    durationSeconds: Number(parsed.format?.duration ?? 0),
    bytes: Number(parsed.format?.size ?? 0),
    hasVideo: Boolean(video),
    hasAudio: streams.some((stream) => stream.codec_type === 'audio'),
    videoCodec: video?.codec_name ?? null,
    width: Number(video?.width ?? 0),
    height: Number(video?.height ?? 0),
    frameRate: video?.r_frame_rate ?? null,
  };
}

async function artifactInfo(filePath) {
  const bytes = await readFile(filePath);
  const info = await stat(filePath);
  return {
    path: filePath,
    bytes: info.size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

function platformName(value) {
  return {
    youtube_shorts: 'YouTube Shorts',
    instagram_reels: 'Instagram Reels',
    tiktok: 'TikTok',
  }[value];
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function boundedNumber(value, field, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new Error(`${field} must be between ${minimum} and ${maximum}`);
  }
  return Number(number.toFixed(3));
}

function requiredString(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}

function optionalString(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return null;
  return value.trim() || null;
}

async function defaultCommandRunner(command, args, options) {
  return execFileAsync(command, args, options);
}
