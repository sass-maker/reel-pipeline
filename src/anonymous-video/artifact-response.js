import { createReadStream } from 'node:fs';

export function sendAnonymousArtifact(req, res, opened, { download = false, cors = false } = {}) {
  if (!opened) return sendJson(res, 404, { error: { code: 'not_found', message: 'video not found' } });
  const state = opened.state ?? opened.status;
  if (state !== 'completed' || opened.reviewed === false || !opened.path) {
    return sendJson(res, 409, {
      error: { code: 'artifact_not_ready', message: 'the reviewed video is not ready' },
      data: { status: state ?? 'processing' },
    });
  }

  const size = Number(opened.size);
  if (!Number.isSafeInteger(size) || size < 1) {
    return sendJson(res, 500, { error: { code: 'invalid_artifact', message: 'video metadata is invalid' } });
  }
  const range = parseByteRange(req.headers.range, size);
  if (range === false) {
    res.writeHead(416, { 'content-range': `bytes */${size}`, 'accept-ranges': 'bytes' });
    return res.end();
  }

  const filename = safeFilename(opened.filename ?? 'brand-reel.mp4');
  const headers = {
    'content-type': opened.contentType ?? 'video/mp4',
    'accept-ranges': 'bytes',
    'cache-control': 'private, no-store',
    'content-disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
  };
  if (cors) headers['access-control-allow-origin'] = '*';
  if (range) {
    headers['content-range'] = `bytes ${range.start}-${range.end}/${size}`;
    headers['content-length'] = String(range.end - range.start + 1);
    res.writeHead(206, headers);
    return createReadStream(opened.path, { start: range.start, end: range.end }).pipe(res);
  }
  headers['content-length'] = String(size);
  res.writeHead(200, headers);
  return createReadStream(opened.path).pipe(res);
}

export function parseByteRange(value, size) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return false;
  let start;
  let end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix < 1) return false;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) return false;
    end = Math.min(end, size - 1);
  }
  return { start, end };
}

function safeFilename(value) {
  const filename = String(value).replace(/["\\/\r\n]/g, '_').trim();
  return filename || 'brand-reel.mp4';
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}
