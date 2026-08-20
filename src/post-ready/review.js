import { execFile } from 'node:child_process';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function run(command, args) {
  return execFileAsync(command, args, { maxBuffer: 1024 * 1024 * 32 });
}

function rational(value) {
  const [numerator, denominator = '1'] = String(value).split('/').map(Number);
  return denominator ? numerator / denominator : 0;
}

export async function reviewPostReadyVideo({ videoPath, reviewDir, expected, runtime }) {
  await mkdir(reviewDir, { recursive: true });
  const framesDir = path.join(reviewDir, 'frames-1fps');
  await mkdir(framesDir, { recursive: true });
  const { stdout: probeStdout } = await run(runtime.ffprobePath, [
    '-v', 'error', '-show_format', '-show_streams', '-of', 'json', videoPath,
  ]);
  const probe = JSON.parse(probeStdout);
  const video = probe.streams.find((stream) => stream.codec_type === 'video');
  const audio = probe.streams.find((stream) => stream.codec_type === 'audio');
  const durationSeconds = Number.parseFloat(probe.format?.duration ?? video?.duration ?? '0');
  const errors = [];
  if (!video) errors.push('video stream is missing');
  if (!audio) errors.push('audio stream is missing');
  if (video && video.codec_name !== 'h264') errors.push(`video codec is ${video.codec_name}, expected h264`);
  if (audio && audio.codec_name !== 'aac') errors.push(`audio codec is ${audio.codec_name}, expected aac`);
  if (video && (video.width !== expected.width || video.height !== expected.height)) {
    errors.push(`dimensions are ${video.width}x${video.height}, expected ${expected.width}x${expected.height}`);
  }
  if (video && Math.abs(rational(video.avg_frame_rate) - expected.fps) > 0.05) {
    errors.push(`frame rate is ${rational(video.avg_frame_rate).toFixed(3)}, expected ${expected.fps}`);
  }
  if (Math.abs(durationSeconds - expected.durationSeconds) > 0.4) {
    errors.push(`duration is ${durationSeconds.toFixed(3)}s, expected ${expected.durationSeconds.toFixed(3)}s`);
  }
  await run(runtime.ffmpegPath, [
    '-hide_banner', '-v', 'error', '-i', videoPath, '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-',
  ]);
  await run(runtime.ffmpegPath, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', videoPath,
    '-vf', 'fps=1',
    '-q:v', '2',
    path.join(framesDir, 'frame-%03d.jpg'),
  ]);
  const frameFiles = (await readdir(framesDir)).filter((name) => name.endsWith('.jpg')).sort();
  if (frameFiles.length < Math.floor(expected.durationSeconds)) {
    errors.push(`only ${frameFiles.length} one-frame-per-second samples were extracted`);
  }
  const rows = Math.max(1, Math.ceil(frameFiles.length / 4));
  const contactSheetPath = path.join(reviewDir, 'contact-sheet.jpg');
  await run(runtime.ffmpegPath, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-framerate', '1',
    '-i', path.join(framesDir, 'frame-%03d.jpg'),
    '-vf', `scale=270:-1,tile=4x${rows}:padding=8:margin=8:color=0x0b0d10`,
    '-frames:v', '1',
    contactSheetPath,
  ]);
  const audioEvidencePath = path.join(reviewDir, 'audio-evidence.png');
  await run(runtime.ffmpegPath, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', videoPath,
    '-filter_complex', '[0:a]showwavespic=s=1600x420:colors=0x2764d7|0xdd9256:scale=sqrt[w];[0:a]showspectrumpic=s=1600x620:legend=disabled:color=channel:scale=log[sp];[w][sp]vstack=inputs=2[out]',
    '-map', '[out]',
    '-frames:v', '1',
    audioEvidencePath,
  ]);
  let freezeOutput = '';
  try {
    const result = await run(runtime.ffmpegPath, [
      '-hide_banner', '-i', videoPath,
      '-vf', 'freezedetect=n=-50dB:d=1.8',
      '-an', '-f', 'null', '-',
    ]);
    freezeOutput = result.stderr;
  } catch (error) {
    freezeOutput = String(error.stderr ?? '');
  }
  const freezes = [...freezeOutput.matchAll(/freeze_duration:\s*([\d.]+)/g)].map((match) => Number(match[1]));
  const warnings = freezes.filter((duration) => duration >= 1.8).map((duration) => `possible frozen visual for ${duration.toFixed(2)}s`);
  const result = {
    schema: 'fleet.post-ready-technical-review.v1',
    status: errors.length === 0 ? 'passed' : 'failed',
    decodedFullDuration: true,
    expected,
    observed: {
      durationSeconds,
      format: probe.format?.format_name ?? null,
      video: video ? { codec: video.codec_name, width: video.width, height: video.height, fps: rational(video.avg_frame_rate) } : null,
      audio: audio ? { codec: audio.codec_name, sampleRate: Number(audio.sample_rate), channels: audio.channels } : null,
      sampledFrames: frameFiles.length,
    },
    errors,
    warnings,
    evidence: {
      contactSheet: contactSheetPath,
      framesDir,
      audioEvidence: audioEvidencePath,
    },
  };
  const findingsPath = path.join(reviewDir, 'technical-review.json');
  await writeFile(findingsPath, `${JSON.stringify(result, null, 2)}\n`);
  return { ...result, findingsPath };
}
