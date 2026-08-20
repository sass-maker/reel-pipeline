/*
THESIS: One production loop from approved evidence to a qualified render; no timeline editor.
OWN-WORLD: Near-black studio surfaces, restrained evidence green, sharp typography, and continuous path cues.
STORY: Prompt, pin a film skill, prove the keyframe rights, watch the queue, choose one variant, approve final.
FIRST VIEWPORT: Compact intake at left; live queue and selected job occupy the working plane at right.
FORM: Operate-mode production console, selected delegated evidence-beam direction; dense split workbench.
*/

export function forgeOperatorPageHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>Local Video Forge</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #07090d;
      --surface: #11151c;
      --surface-raised: #171d26;
      --line: #29313d;
      --text: #f3f5f7;
      --muted: #aab2bc;
      --quiet: #7f8995;
      --risk: #ff6b76;
      --evidence: #d9e6ef;
      --verified: #82d9a7;
      --focus: #b9dcff;
      --radius: 14px;
      font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-width: 320px; background: var(--bg); }
    button, input, select, textarea { font: inherit; }
    button, input, select, textarea { outline: none; }
    :focus-visible { box-shadow: 0 0 0 3px rgba(185, 220, 255, .34); }
    button { cursor: pointer; }
    button:disabled { cursor: not-allowed; opacity: .42; }
    .shell { min-height: 100vh; display: grid; grid-template-rows: auto 1fr; }
    .mast {
      min-height: 72px; padding: 16px clamp(18px, 3vw, 42px);
      display: flex; align-items: center; justify-content: space-between; gap: 24px;
      border-bottom: 1px solid var(--line); background: #090c11;
    }
    .brand { display: flex; align-items: center; gap: 13px; min-width: 0; }
    .mark {
      width: 34px; height: 34px; border-radius: 50%; position: relative; flex: 0 0 auto;
      border: 1px solid #43505f; background: #0c1016;
    }
    .mark::after {
      content: ""; position: absolute; left: 7px; right: 7px; top: 16px; height: 2px;
      background: var(--verified); box-shadow: 8px 0 12px rgba(130, 217, 167, .38);
    }
    h1 { margin: 0; font-size: 1.04rem; letter-spacing: -.02em; }
    .brand p { margin: 3px 0 0; color: var(--muted); font-size: .78rem; }
    .connection { color: var(--muted); font-size: .78rem; display: flex; align-items: center; gap: 8px; }
    .connection::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--verified); }
    .workbench { display: grid; grid-template-columns: minmax(320px, 390px) minmax(0, 1fr); min-height: 0; }
    .intake {
      border-right: 1px solid var(--line); padding: 24px 22px 40px;
      background: #0b0e13; overflow-y: auto;
    }
    .section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
    h2 { margin: 0; font-size: 1rem; letter-spacing: -.02em; }
    .section-head span { color: var(--quiet); font-size: .72rem; }
    form { display: grid; gap: 15px; }
    fieldset { border: 0; padding: 0; margin: 0; display: grid; gap: 12px; }
    legend { padding: 17px 0 10px; color: var(--evidence); font-size: .75rem; font-weight: 700; }
    label { display: grid; gap: 7px; color: var(--muted); font-size: .76rem; font-weight: 650; }
    input, select, textarea {
      width: 100%; border: 1px solid #303946; background: #0d1117; color: var(--text);
      border-radius: 10px; padding: 10px 11px; min-height: 42px;
    }
    textarea { resize: vertical; min-height: 84px; line-height: 1.45; }
    input::placeholder, textarea::placeholder { color: #737e8a; }
    input:hover, select:hover, textarea:hover { border-color: #465363; }
    .split { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .seeds { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .check {
      grid-template-columns: 18px 1fr; align-items: start; gap: 9px; color: var(--text);
      font-weight: 550; line-height: 1.35;
    }
    .check input { width: 17px; height: 17px; min-height: 0; margin: 1px 0 0; accent-color: var(--verified); }
    .primary {
      border: 0; border-radius: 10px; padding: 12px 16px; min-height: 44px;
      color: #07110b; background: var(--verified); font-weight: 800;
    }
    .primary:hover { background: #9ae6b8; }
    .capture-panel {
      display: grid; gap: 12px; padding: 13px; border: 1px solid #303946;
      border-radius: 12px; background: #0d1117;
    }
    .capture-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .capture-frame {
      width: min(100%, 270px); aspect-ratio: 9 / 16; justify-self: center;
      border: 1px solid #354150; border-radius: 12px; overflow: hidden;
      background: #030507; object-fit: contain;
    }
    canvas.capture-frame { display: block; }
    .capture-status {
      min-height: 20px; color: var(--muted); font-size: .72rem; line-height: 1.45;
    }
    .capture-status.ready { color: var(--verified); }
    .capture-status.recording { color: #f3c980; }
    .hint { color: var(--quiet); font-size: .72rem; line-height: 1.5; margin: 0; }
    .stage { min-width: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); }
    .queue {
      border-bottom: 1px solid var(--line); padding: 18px clamp(18px, 2.5vw, 32px);
      background: #090c11;
    }
    .queue-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .quiet-button {
      border: 1px solid #374352; color: var(--evidence); background: transparent;
      border-radius: 9px; padding: 7px 10px; font-size: .74rem; font-weight: 700;
    }
    .quiet-button:hover { border-color: #5d6b7b; background: #111721; }
    .queue-list { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; }
    .queue-item {
      min-width: 190px; max-width: 250px; text-align: left; padding: 10px 11px;
      border: 1px solid #293441; background: #0e131a; color: var(--text); border-radius: 11px;
    }
    .queue-item[aria-current="true"] { border-color: var(--verified); background: #111a19; }
    .queue-item strong, .queue-item small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .queue-item strong { font-size: .78rem; }
    .queue-item small { margin-top: 5px; color: var(--muted); font-size: .68rem; }
    .detail { min-width: 0; overflow-y: auto; padding: 26px clamp(18px, 3vw, 42px) 56px; }
    .empty { color: var(--muted); max-width: 52ch; padding-top: 16vh; }
    .empty h2 { color: var(--text); font-size: clamp(1.6rem, 3vw, 2.5rem); margin-bottom: 12px; }
    .empty p { line-height: 1.65; }
    .job-title { display: flex; justify-content: space-between; gap: 24px; align-items: start; margin-bottom: 28px; }
    .job-title h2 { font-size: clamp(1.5rem, 3vw, 2.7rem); max-width: 22ch; }
    .job-title p { color: var(--muted); margin: 9px 0 0; line-height: 1.55; max-width: 68ch; }
    .badge {
      display: inline-flex; align-items: center; gap: 7px; flex: 0 0 auto;
      border-radius: 999px; padding: 7px 10px; border: 1px solid #354252;
      color: var(--evidence); font-size: .7rem; font-weight: 750;
    }
    .badge::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
    .badge.ok { color: var(--verified); }
    .badge.warn { color: #f3c980; }
    .meta-strip {
      display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1px;
      background: var(--line); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden;
      margin-bottom: 30px;
    }
    .meta { background: var(--surface); padding: 13px 14px; min-width: 0; }
    .meta span, .meta strong { display: block; }
    .meta span { color: var(--quiet); font-size: .68rem; margin-bottom: 7px; }
    .meta strong { font-size: .78rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .block { margin-top: 34px; }
    .block h3 { font-size: .82rem; margin: 0 0 14px; color: var(--evidence); }
    .asset-table { width: 100%; border-collapse: collapse; font-size: .76rem; }
    .asset-table th, .asset-table td { border-bottom: 1px solid var(--line); padding: 11px 8px; text-align: left; vertical-align: top; }
    .asset-table th { color: var(--quiet); font-size: .67rem; font-weight: 700; }
    .asset-table td { color: var(--muted); }
    .asset-table td:first-child { color: var(--text); }
    .variants {
      display: grid; grid-template-columns: repeat(3, minmax(220px, 1fr)); gap: 12px;
      overflow-x: auto; padding-bottom: 8px;
    }
    .variant {
      min-width: 220px; background: var(--surface); border: 1px solid #2c3541;
      border-radius: var(--radius); overflow: hidden;
    }
    .variant.accepted { border-color: var(--verified); }
    video { display: block; width: 100%; aspect-ratio: 9 / 16; max-height: 48vh; object-fit: cover; background: #020304; }
    .variant-body { padding: 12px; }
    .variant-line { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
    .variant-line strong { font-size: .78rem; }
    .variant-line span { color: var(--quiet); font-size: .68rem; }
    .decisions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .decision {
      border: 1px solid #354150; background: #0d1218; color: var(--muted);
      border-radius: 8px; padding: 7px 8px; font-size: .67rem; font-weight: 700;
    }
    .decision:hover { color: var(--text); border-color: #59697b; }
    .decision.accept { color: var(--verified); grid-column: 1 / -1; }
    .final-gate {
      margin-top: 30px; display: flex; justify-content: space-between; align-items: center;
      gap: 20px; padding: 18px; border: 1px solid var(--line); border-radius: var(--radius);
      background: #0d1218;
    }
    .final-gate h3 { margin: 0 0 6px; font-size: .9rem; }
    .final-gate p { margin: 0; color: var(--muted); font-size: .74rem; line-height: 1.45; }
    .toast {
      position: fixed; right: 18px; bottom: 18px; max-width: min(420px, calc(100vw - 36px));
      color: var(--text); background: #17202a; border: 1px solid #526274;
      border-radius: 11px; padding: 11px 13px; font-size: .76rem; box-shadow: 0 12px 34px rgba(0,0,0,.38);
    }
    .toast.error { border-color: var(--risk); }
    [hidden] { display: none !important; }
    @media (max-width: 900px) {
      .workbench { grid-template-columns: 1fr; }
      .intake { border-right: 0; border-bottom: 1px solid var(--line); }
      .meta-strip { grid-template-columns: 1fr 1fr; }
      .variants { grid-template-columns: repeat(3, minmax(250px, 72vw)); }
    }
    @media (max-width: 520px) {
      .mast { align-items: flex-start; }
      .connection { display: none; }
      .split { grid-template-columns: 1fr; }
      .job-title { display: grid; }
      .meta-strip { grid-template-columns: 1fr; }
      .final-gate { align-items: stretch; flex-direction: column; }
      .final-gate .primary { width: 100%; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header class="mast">
      <div class="brand">
        <span class="mark" aria-hidden="true"></span>
        <div><h1>Local Video Forge</h1><p>Prompt → evidence → variants → approved final</p></div>
      </div>
      <div class="connection">Authenticated operator surface</div>
    </header>
    <main class="workbench">
      <aside class="intake" aria-labelledby="new-job-title">
        <div class="section-head"><h2 id="new-job-title">New film task</h2><span>3 previews</span></div>
        <form id="forge-form">
          <label>Prompt
            <textarea name="prompt" required placeholder="What should this film make the viewer understand?"></textarea>
          </label>
          <label>Context
            <textarea name="context" required placeholder="Product truth, audience, constraints, and approved claims."></textarea>
          </label>
          <label>Film style
            <select name="filmSkill" required><option value="">Loading exact versions…</option></select>
          </label>
          <fieldset>
            <legend>Project</legend>
            <div class="split">
              <label>Project name<input name="projectName" required placeholder="codevetter-launch"></label>
              <label>Shot ID<input name="shotId" required value="s01"></label>
            </div>
            <label>Visual style<input name="style" required placeholder="Clean technical documentary"></label>
          </fieldset>
          <fieldset id="motion-fields">
            <legend>Motion</legend>
            <label>Motion prompt
              <textarea name="motionPrompt" required placeholder="One subject, one action, one camera move."></textarea>
            </label>
            <label>Negative prompt<input name="negativePrompt" data-optional="true" value="camera shake, morphing UI, scene cuts"></label>
          </fieldset>
          <fieldset id="keyframe-fields">
            <legend>Approved keyframe</legend>
            <label>Image<input name="keyframe" type="file" accept="image/png,image/jpeg,image/webp" required></label>
            <label class="check"><input name="keyframeApproved" type="checkbox" required><span>This exact keyframe is approved for generation.</span></label>
          </fieldset>
          <fieldset id="capture-fields" hidden>
            <legend>Record the real app</legend>
            <div class="capture-panel">
              <label class="check"><input name="includePresenter" type="checkbox" checked><span>Include my camera and microphone as a synchronized bottom-right presenter.</span></label>
              <p class="hint">Chrome will ask you to choose an app window, browser tab, or screen. Nothing uploads until you preview and approve the take.</p>
              <div class="capture-actions">
                <button class="quiet-button" id="record-capture" type="button">Record app</button>
                <button class="quiet-button" id="stop-capture" type="button" disabled>Stop</button>
              </div>
              <div class="capture-status" id="capture-status" role="status" aria-live="polite">Ready to request screen permission.</div>
              <canvas class="capture-frame" id="capture-canvas" width="1080" height="1920" aria-label="Live composed app and presenter capture" hidden></canvas>
              <video class="capture-frame" id="capture-preview" controls playsinline aria-label="Recorded app-demo preview" hidden></video>
              <div class="capture-actions" id="capture-review" hidden>
                <button class="primary" id="approve-capture" type="button">Use this take</button>
                <button class="quiet-button" id="discard-capture" type="button">Discard</button>
              </div>
            </div>
          </fieldset>
          <fieldset>
            <legend>Production provenance</legend>
            <label>Source revision<input name="sourceRevision" required placeholder="Git SHA, capture ID, or asset revision"></label>
            <label>Rights / license<input name="license" required placeholder="operator-owned, CC0, licensed campaign asset"></label>
            <label class="check"><input name="rightsApproved" type="checkbox" required><span>Rights are verified for publishable production use.</span></label>
          </fieldset>
          <fieldset id="seed-fields">
            <legend>Preview seeds</legend>
            <div class="seeds">
              <label>Seed A<input name="seedA" type="number" required value="41"></label>
              <label>Seed B<input name="seedB" type="number" required value="42"></label>
              <label>Seed C<input name="seedC" type="number" required value="43"></label>
            </div>
          </fieldset>
          <button class="primary" id="queue-submit" type="submit">Queue three previews</button>
          <p class="hint">This console selects a proven recipe and records decisions. Custom timeline edits belong in the exported editor-ready package.</p>
        </form>
      </aside>
      <section class="stage" aria-label="Forge queue and review">
        <div class="queue">
          <div class="queue-head"><h2>Production queue</h2><button class="quiet-button" id="refresh" type="button">Refresh</button></div>
          <div class="queue-list" id="queue-list" aria-live="polite"></div>
        </div>
        <div class="detail" id="job-detail">
          <div class="empty"><h2>One story. Deliberate choices.</h2><p>Choose a Film style, approve its source, then review the result without improvising a new production method.</p></div>
        </div>
      </section>
    </main>
  </div>
  <div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
  <script>
    const state = {
      jobs: [],
      skills: [],
      selectedId: null,
      capture: {
        approved: false,
        blob: null,
        chunks: [],
        displayStream: null,
        presenterStream: null,
        composedStream: null,
        recorder: null,
        audioContext: null,
        animationFrame: null,
        timer: null,
        startedAt: null,
        durationMs: null,
        displaySurface: 'unknown',
        presenterMode: 'none',
        objectUrl: null,
        suppressFinish: false,
      },
    };
    const form = document.querySelector('#forge-form');
    const studioParams = new URLSearchParams(window.location.search);
    const queueList = document.querySelector('#queue-list');
    const detail = document.querySelector('#job-detail');
    const toast = document.querySelector('#toast');
    const skillSelect = form.elements.filmSkill;
    const motionFields = document.querySelector('#motion-fields');
    const keyframeFields = document.querySelector('#keyframe-fields');
    const captureFields = document.querySelector('#capture-fields');
    const seedFields = document.querySelector('#seed-fields');
    const queueSubmit = document.querySelector('#queue-submit');
    const recordCaptureButton = document.querySelector('#record-capture');
    const stopCaptureButton = document.querySelector('#stop-capture');
    const captureStatus = document.querySelector('#capture-status');
    const captureCanvas = document.querySelector('#capture-canvas');
    const capturePreview = document.querySelector('#capture-preview');
    const captureReview = document.querySelector('#capture-review');

    function node(tag, className, text) {
      const element = document.createElement(tag);
      if (className) element.className = className;
      if (text !== undefined) element.textContent = text;
      return element;
    }

    async function api(path, options = {}) {
      const response = await fetch(path, {
        credentials: 'same-origin',
        ...options,
        headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}) },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || ('Request failed: ' + response.status));
      return payload.data;
    }

    function notify(message, isError = false) {
      toast.textContent = message;
      toast.className = 'toast' + (isError ? ' error' : '');
      toast.hidden = false;
      window.clearTimeout(notify.timer);
      notify.timer = window.setTimeout(() => { toast.hidden = true; }, 5000);
    }

    function fileAsBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('The keyframe could not be read.'));
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.readAsDataURL(file);
      });
    }

    function isGuidedCapture() {
      return skillSelect.value === 'guided-app-demo@1';
    }

    function setRequired(container, required) {
      for (const input of container.querySelectorAll('input, textarea, select')) {
        if (input.dataset.optional === 'true') continue;
        input.required = required;
      }
    }

    function updateIntakeMode() {
      const guided = isGuidedCapture();
      motionFields.hidden = guided;
      keyframeFields.hidden = guided;
      seedFields.hidden = guided;
      captureFields.hidden = !guided;
      setRequired(motionFields, !guided);
      setRequired(keyframeFields, !guided);
      setRequired(seedFields, !guided);
      queueSubmit.textContent = guided ? 'Queue captured preview' : 'Queue three previews';
      document.querySelector('.section-head span').textContent = guided ? '1 captured preview' : '3 previews';
      if (!guided && (state.capture.blob || state.capture.recorder)) resetCapture();
    }

    function captureMessage(message, tone = '') {
      captureStatus.textContent = message;
      captureStatus.className = 'capture-status' + (tone ? ' ' + tone : '');
    }

    async function countdown(seconds) {
      for (let remaining = seconds; remaining > 0; remaining -= 1) {
        captureMessage('Recording starts in ' + remaining + '…', 'recording');
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
      }
    }

    function drawContained(context, video, x, y, width, height) {
      const sourceWidth = video.videoWidth || width;
      const sourceHeight = video.videoHeight || height;
      const scale = Math.min(width / sourceWidth, height / sourceHeight);
      const targetWidth = sourceWidth * scale;
      const targetHeight = sourceHeight * scale;
      context.drawImage(
        video,
        x + (width - targetWidth) / 2,
        y + (height - targetHeight) / 2,
        targetWidth,
        targetHeight,
      );
    }

    function drawCover(context, video, x, y, width, height) {
      const sourceWidth = video.videoWidth || width;
      const sourceHeight = video.videoHeight || height;
      const scale = Math.max(width / sourceWidth, height / sourceHeight);
      const sourceCropWidth = width / scale;
      const sourceCropHeight = height / scale;
      context.drawImage(
        video,
        (sourceWidth - sourceCropWidth) / 2,
        (sourceHeight - sourceCropHeight) / 2,
        sourceCropWidth,
        sourceCropHeight,
        x,
        y,
        width,
        height,
      );
    }

    function beginCanvasComposition(screenVideo, presenterVideo) {
      const context = captureCanvas.getContext('2d', { alpha: false });
      const paint = () => {
        context.fillStyle = '#07111f';
        context.fillRect(0, 0, captureCanvas.width, captureCanvas.height);
        drawContained(context, screenVideo, 0, 0, captureCanvas.width, captureCanvas.height);
        if (presenterVideo) {
          const width = Math.round(captureCanvas.width * .24);
          const height = Math.round(width * 1.28);
          const margin = Math.round(captureCanvas.width * .06);
          const x = captureCanvas.width - width - margin;
          const y = captureCanvas.height - height - margin;
          const radius = 34;
          context.save();
          context.beginPath();
          context.roundRect(x, y, width, height, radius);
          context.clip();
          drawCover(context, presenterVideo, x, y, width, height);
          context.restore();
          context.strokeStyle = 'rgba(243,245,247,.72)';
          context.lineWidth = 4;
          context.beginPath();
          context.roundRect(x, y, width, height, radius);
          context.stroke();
        }
        state.capture.animationFrame = window.requestAnimationFrame(paint);
      };
      paint();
    }

    function connectAudio(audioContext, destination, stream, gainValue) {
      if (!stream?.getAudioTracks().length) return false;
      const source = audioContext.createMediaStreamSource(
        new MediaStream(stream.getAudioTracks()),
      );
      const gain = audioContext.createGain();
      gain.gain.value = gainValue;
      source.connect(gain).connect(destination);
      return true;
    }

    async function startCapture() {
      if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === 'undefined') {
        return notify('App recording needs a current Chrome browser with screen capture support.', true);
      }
      resetCapture();
      state.capture.suppressFinish = false;
      recordCaptureButton.disabled = true;
      captureCanvas.hidden = false;
      captureMessage('Choose the app window, tab, or screen to record.', 'recording');
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 24, max: 30 } },
          audio: true,
        });
        state.capture.displayStream = displayStream;
        state.capture.displaySurface = displayStream.getVideoTracks()[0]?.getSettings?.().displaySurface || 'unknown';

        let presenterStream = null;
        if (form.elements.includePresenter.checked) {
          presenterStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 800 }, facingMode: 'user' },
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          });
          state.capture.presenterMode = 'same-session';
          state.capture.presenterStream = presenterStream;
        }

        const screenVideo = document.createElement('video');
        screenVideo.muted = true;
        screenVideo.playsInline = true;
        screenVideo.srcObject = displayStream;
        await screenVideo.play();
        let presenterVideo = null;
        if (presenterStream) {
          presenterVideo = document.createElement('video');
          presenterVideo.muted = true;
          presenterVideo.playsInline = true;
          presenterVideo.srcObject = presenterStream;
          await presenterVideo.play();
        }

        beginCanvasComposition(screenVideo, presenterVideo);
        const canvasStream = captureCanvas.captureStream(24);
        const audioContext = new AudioContext();
        const destination = audioContext.createMediaStreamDestination();
        const hasScreenAudio = connectAudio(audioContext, destination, displayStream, .32);
        const hasPresenterAudio = connectAudio(audioContext, destination, presenterStream, 1);
        const composedTracks = [...canvasStream.getVideoTracks()];
        if (hasScreenAudio || hasPresenterAudio) composedTracks.push(...destination.stream.getAudioTracks());
        const composedStream = new MediaStream(composedTracks);
        state.capture.audioContext = audioContext;
        state.capture.composedStream = composedStream;

        await countdown(3);
        const mimeType = [
          'video/webm;codecs=vp9,opus',
          'video/webm;codecs=vp8,opus',
          'video/webm',
        ].find((type) => MediaRecorder.isTypeSupported(type)) || '';
        const recorder = new MediaRecorder(
          composedStream,
          mimeType ? { mimeType, videoBitsPerSecond: 7_000_000 } : undefined,
        );
        state.capture.chunks = [];
        state.capture.recorder = recorder;
        state.capture.startedAt = performance.now();
        recorder.addEventListener('dataavailable', (event) => {
          if (event.data.size) state.capture.chunks.push(event.data);
        });
        recorder.addEventListener('stop', finishCapture, { once: true });
        displayStream.getVideoTracks()[0].addEventListener('ended', stopCapture, { once: true });
        recorder.start(1000);
        stopCaptureButton.disabled = false;
        captureMessage('Recording 0:00 · maximum 1:30', 'recording');
        state.capture.timer = window.setInterval(() => {
          const elapsedSeconds = Math.floor((performance.now() - state.capture.startedAt) / 1000);
          const minutes = Math.floor(elapsedSeconds / 60);
          const seconds = String(elapsedSeconds % 60).padStart(2, '0');
          captureMessage('Recording ' + minutes + ':' + seconds + ' · maximum 1:30', 'recording');
          if (elapsedSeconds >= 90) stopCapture();
        }, 500);
      } catch (error) {
        stopCaptureTracks();
        captureCanvas.hidden = true;
        recordCaptureButton.disabled = false;
        captureMessage('Permission was not granted. Nothing was recorded.');
        notify(error.message || 'Capture permission was not granted.', true);
      }
    }

    function stopCapture() {
      const recorder = state.capture.recorder;
      if (recorder?.state === 'recording') recorder.stop();
    }

    function stopCaptureTracks() {
      window.clearInterval(state.capture.timer);
      if (state.capture.animationFrame) window.cancelAnimationFrame(state.capture.animationFrame);
      for (const stream of [
        state.capture.displayStream,
        state.capture.presenterStream,
        state.capture.composedStream,
      ]) {
        for (const track of stream?.getTracks?.() || []) track.stop();
      }
      state.capture.audioContext?.close?.().catch(() => {});
      state.capture.timer = null;
      state.capture.animationFrame = null;
      stopCaptureButton.disabled = true;
      recordCaptureButton.disabled = false;
    }

    function finishCapture() {
      if (state.capture.suppressFinish) {
        state.capture.suppressFinish = false;
        return;
      }
      state.capture.durationMs = Math.max(250, Math.round(performance.now() - state.capture.startedAt));
      const mimeType = state.capture.recorder?.mimeType || 'video/webm';
      state.capture.blob = new Blob(state.capture.chunks, { type: mimeType });
      stopCaptureTracks();
      captureCanvas.hidden = true;
      if (state.capture.blob.size > 95 * 1024 * 1024) {
        captureMessage('This take is larger than 95 MB. Record a shorter take.');
        state.capture.blob = null;
        return;
      }
      state.capture.objectUrl = URL.createObjectURL(state.capture.blob);
      capturePreview.src = state.capture.objectUrl;
      capturePreview.hidden = false;
      captureReview.hidden = false;
      captureMessage('Preview the take, then approve or discard it.');
    }

    function approveCapture() {
      if (!state.capture.blob) return;
      state.capture.approved = true;
      captureReview.hidden = true;
      captureMessage('Take approved locally. It will upload only when you queue the task.', 'ready');
    }

    function resetCapture() {
      state.capture.suppressFinish = state.capture.recorder?.state === 'recording';
      stopCapture();
      stopCaptureTracks();
      if (state.capture.objectUrl) URL.revokeObjectURL(state.capture.objectUrl);
      state.capture.approved = false;
      state.capture.blob = null;
      state.capture.chunks = [];
      state.capture.recorder = null;
      state.capture.startedAt = null;
      state.capture.durationMs = null;
      state.capture.displaySurface = 'unknown';
      state.capture.presenterMode = 'none';
      state.capture.objectUrl = null;
      capturePreview.removeAttribute('src');
      capturePreview.load();
      capturePreview.hidden = true;
      captureReview.hidden = true;
      captureCanvas.hidden = true;
      captureMessage('Ready to request screen permission.');
    }

    async function sha256Hex(blob) {
      const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
      return [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
    }

    async function uploadApprovedCapture() {
      const blob = state.capture.blob;
      if (!blob || !state.capture.approved) {
        throw new Error('Record, preview, and approve an app-demo take first.');
      }
      const captureId = 'capture-' + Date.now() + '-' + crypto.randomUUID().slice(0, 8);
      const hash = await sha256Hex(blob);
      const response = await fetch('/forge/captures/' + encodeURIComponent(captureId), {
        method: 'PUT',
        credentials: 'same-origin',
        headers: {
          'content-type': blob.type.split(';')[0] || 'video/webm',
          'x-forge-duration-ms': String(state.capture.durationMs),
          'x-forge-sha256': hash,
          'x-forge-film-skill': 'guided-app-demo@1',
          'x-forge-file-name': captureId + '.webm',
          'x-forge-presenter-mode': state.capture.presenterMode,
          'x-forge-display-surface': state.capture.displaySurface,
          'x-forge-source-revision': form.elements.sourceRevision.value,
          'x-forge-license': form.elements.license.value,
          'x-forge-rights-approved': String(form.elements.rightsApproved.checked),
        },
        body: blob,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || ('Capture upload failed: ' + response.status));
      return payload.data;
    }

    function statusLabel(job) {
      if (!['blocked', 'ready', undefined].includes(job.finalRender?.status)) {
        return 'final ' + job.finalRender.status;
      }
      if (job.status === 'completed' && job.review?.selection) return 'preview accepted';
      return String(job.progress?.stage || job.status || 'unknown').replaceAll('-', ' ');
    }

    async function loadSkills() {
      state.skills = await api('/forge/skills');
      skillSelect.replaceChildren();
      for (const skill of state.skills) {
        const option = node('option', '', skill.ref + ' — ' + skill.title);
        option.value = skill.ref;
        skillSelect.append(option);
      }
      const requestedKind = studioParams.get('kind');
      if (
        requestedKind === 'guided-app-demo'
        && [...skillSelect.options].some((option) => option.value === 'guided-app-demo@1')
      ) {
        skillSelect.value = 'guided-app-demo@1';
      }
      const projectName = studioParams.get('projectName');
      if (projectName && /^[a-z0-9][a-z0-9-]{0,79}$/i.test(projectName)) {
        form.elements.projectName.value = projectName;
      }
      const sourceUrl = studioParams.get('sourceUrl');
      if (sourceUrl) {
        try {
          const parsed = new URL(sourceUrl);
          if (parsed.protocol === 'https:') {
            form.elements.context.value = 'Approved public source to review: ' + parsed.toString();
          }
        } catch {}
      }
      updateIntakeMode();
    }

    async function loadJobs(preserveSelection = true) {
      state.jobs = await api('/forge/jobs');
      if (!preserveSelection || !state.jobs.some((job) => job.id === state.selectedId)) {
        state.selectedId = state.jobs.at(-1)?.id || null;
      }
      renderQueue();
      renderDetail();
    }

    function renderQueue() {
      queueList.replaceChildren();
      if (!state.jobs.length) {
        queueList.append(node('span', 'hint', 'No forge jobs yet.'));
        return;
      }
      for (const job of [...state.jobs].reverse()) {
        const button = node('button', 'queue-item');
        button.type = 'button';
        button.setAttribute('aria-current', String(job.id === state.selectedId));
        button.append(node('strong', '', job.project?.name || job.id));
        button.append(node('small', '', (job.filmSkill?.ref || 'legacy recipe') + ' · ' + statusLabel(job)));
        button.addEventListener('click', () => {
          state.selectedId = job.id;
          renderQueue();
          renderDetail();
        });
        queueList.append(button);
      }
    }

    function addMeta(strip, label, value) {
      const item = node('div', 'meta');
      item.append(node('span', '', label), node('strong', '', value || '—'));
      strip.append(item);
    }

    function renderDetail() {
      const job = state.jobs.find((candidate) => candidate.id === state.selectedId);
      detail.replaceChildren();
      if (!job) {
        const empty = node('div', 'empty');
        empty.append(node('h2', '', 'One story. Deliberate choices.'));
        empty.append(node('p', '', 'Choose a Film style, approve its source, then review the result without improvising a new production method.'));
        detail.append(empty);
        return;
      }

      const title = node('div', 'job-title');
      const copy = node('div');
      copy.append(node('h2', '', job.project?.name || job.id));
      copy.append(node('p', '', job.brief?.prompt || job.shot?.motionPrompt || 'No prompt recorded.'));
      const badge = node('span', 'badge' + (job.status === 'completed' ? ' ok' : job.status === 'failed' ? ' warn' : ''), statusLabel(job));
      title.append(copy, badge);
      detail.append(title);

      const strip = node('div', 'meta-strip');
      addMeta(strip, 'Film style', job.filmSkill?.ref || 'Not pinned');
      addMeta(strip, 'Worker', job.lease?.workerId || 'Unclaimed');
      addMeta(strip, 'Preview progress', job.progress?.completed != null ? job.progress.completed + ' / ' + job.progress.total : job.status);
      addMeta(strip, 'Final render', job.finalRender?.status || 'blocked');
      detail.append(strip);

      const assetBlock = node('section', 'block');
      assetBlock.append(node('h3', '', 'Approved asset and provenance'));
      const table = node('table', 'asset-table');
      const head = node('thead');
      const headRow = node('tr');
      for (const heading of ['Asset', 'Source', 'Revision', 'Rights', 'SHA-256']) headRow.append(node('th', '', heading));
      head.append(headRow);
      const row = node('tr');
      const approvedSource = job.sourceCapture || job.keyframe || {};
      const provenance = approvedSource.provenance || {};
      const rights = provenance.rights || {};
      row.append(
        node('td', '', approvedSource.fileName || (job.sourceCapture ? 'Approved capture' : 'Keyframe')),
        node('td', '', provenance.sourceType || 'unrecorded'),
        node('td', '', provenance.sourceRevision || 'unrecorded'),
        node('td', '', (rights.tier || 'unrecorded') + ' · ' + (rights.license || 'unrecorded')),
        node('td', '', approvedSource.sha256 ? approvedSource.sha256.slice(0, 12) + '…' : '—'),
      );
      const body = node('tbody'); body.append(row); table.append(head, body); assetBlock.append(table); detail.append(assetBlock);

      const variantsBlock = node('section', 'block');
      variantsBlock.append(node('h3', '', 'Preview variants'));
      if (!job.variants?.length) {
        variantsBlock.append(node('p', 'hint', job.status === 'failed'
          ? (job.error || 'Generation failed.')
          : job.sourceKind === 'guided-app-capture'
            ? 'The encoded captured preview appears here when the Mac worker finishes.'
            : 'Variants appear here when the Mac worker completes all three seeds.'));
      } else {
        const variants = node('div', 'variants');
        for (const variant of job.variants) variants.append(renderVariant(job, variant));
        variantsBlock.append(variants);
      }
      detail.append(variantsBlock);

      if (job.finalRender?.variant) {
        const finalBlock = node('section', 'block');
        finalBlock.append(node('h3', '', 'Completed final render'));
        const finalVariants = node('div', 'variants');
        finalVariants.append(renderVariant(job, job.finalRender.variant, false));
        finalBlock.append(finalVariants);
        detail.append(finalBlock);
      }

      const gate = node('section', 'final-gate');
      const gateCopy = node('div');
      const selected = job.review?.selection;
      const finalActive = ['queued', 'running', 'completed'].includes(job.finalRender?.status);
      gateCopy.append(node('h3', '', finalActive ? 'Final render ' + job.finalRender.status : selected ? 'Selection approved' : 'Final render locked'));
      gateCopy.append(node('p', '', finalActive
        ? (job.sourceKind === 'guided-app-capture'
          ? 'The approved source hash, exact Film style, and quality gates are fixed in the job record.'
          : 'The selected seed, exact Film style, and quality gates are fixed in the job record.')
        : selected
          ? 'Variant ' + selected.variantId + ' is accepted. Queueing final will lock review decisions.'
          : (job.finalRender?.reason || 'Accept one completed preview before queueing a final render.')));
      const finalButton = node('button', 'primary', finalActive ? job.finalRender.status : 'Queue approved final');
      finalButton.type = 'button';
      finalButton.disabled = !selected || finalActive;
      finalButton.addEventListener('click', () => queueFinal(job.id));
      gate.append(gateCopy, finalButton);
      detail.append(gate);
    }

    function renderVariant(job, variant, reviewable = true) {
      const accepted = job.review?.selection?.variantId === variant.variantId;
      const article = node('article', 'variant' + (accepted ? ' accepted' : ''));
      const video = node('video');
      video.controls = true;
      video.preload = 'metadata';
      video.playsInline = true;
      video.src = '/forge/jobs/' + encodeURIComponent(job.id) + '/artifacts/' + encodeURIComponent(variant.variantId);
      video.setAttribute('aria-label', 'Preview ' + variant.variantId);
      article.append(video);
      const body = node('div', 'variant-body');
      const line = node('div', 'variant-line');
      line.append(
        node('strong', '', variant.variantId),
        node('span', '', variant.seed == null ? 'approved source' : 'seed ' + variant.seed),
      );
      body.append(line);
      if (reviewable) {
        const actions = node('div', 'decisions');
        for (const decision of ['accepted', 'retry', 'change-motion', 'change-keyframe', 'cloud-candidate']) {
          const button = node('button', 'decision' + (decision === 'accepted' ? ' accept' : ''), decision);
          button.type = 'button';
          button.disabled = ['queued', 'running', 'completed'].includes(job.finalRender?.status);
          button.addEventListener('click', () => decide(job.id, variant.variantId, decision));
          actions.append(button);
        }
        body.append(actions);
      }
      article.append(body);
      return article;
    }

    async function decide(jobId, variantId, decision) {
      try {
        await api('/forge/jobs/' + encodeURIComponent(jobId) + '/decision', {
          method: 'PATCH',
          body: JSON.stringify({ variantId, decision }),
        });
        await loadJobs();
        notify('Decision recorded: ' + decision + '.');
      } catch (error) {
        notify(error.message, true);
      }
    }

    async function queueFinal(jobId) {
      try {
        await api('/forge/jobs/' + encodeURIComponent(jobId) + '/final-render', {
          method: 'POST',
          body: JSON.stringify({}),
        });
        await loadJobs();
        notify('Approved final render queued.');
      } catch (error) {
        notify(error.message, true);
      }
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submit = form.querySelector('button[type="submit"]');
      const guided = isGuidedCapture();
      const file = form.elements.keyframe.files[0];
      if (!guided && !file) return notify('Choose an approved keyframe.', true);
      if (guided && !state.capture.approved) {
        return notify('Record, preview, and approve an app-demo take first.', true);
      }
      submit.disabled = true;
      submit.textContent = guided ? 'Uploading approved take…' : 'Reading evidence…';
      try {
        if (guided) {
          const capture = await uploadApprovedCapture();
          const created = await api('/forge/jobs', {
            method: 'POST',
            body: JSON.stringify({
              captureId: capture.id,
              prompt: form.elements.prompt.value,
              context: form.elements.context.value,
              filmSkill: form.elements.filmSkill.value,
              project: {
                name: form.elements.projectName.value,
                aspectRatio: '9:16',
                fps: 24,
                style: form.elements.style.value,
              },
              shot: { id: form.elements.shotId.value },
            }),
          });
          state.selectedId = created.id;
          await loadJobs();
          resetCapture();
          form.reset();
          updateIntakeMode();
          notify('Captured preview queued for the Mac.');
          return;
        }

        const seeds = [form.elements.seedA, form.elements.seedB, form.elements.seedC].map((input) => Number(input.value));
        if (new Set(seeds).size !== 3) throw new Error('Preview seeds must be distinct.');
        const payload = {
          prompt: form.elements.prompt.value,
          context: form.elements.context.value,
          filmSkill: form.elements.filmSkill.value,
          project: {
            name: form.elements.projectName.value,
            aspectRatio: '9:16',
            fps: 24,
            style: form.elements.style.value,
          },
          shot: {
            id: form.elements.shotId.value,
            mode: 'image-to-video',
            keyframe: file.name,
            keyframeApproved: form.elements.keyframeApproved.checked,
            motionPrompt: form.elements.motionPrompt.value,
            negativePrompt: form.elements.negativePrompt.value,
            preview: { preset: 'preview', seeds, width: 576, height: 1024, frames: 81, fps: 24 },
          },
          keyframe: {
            fileName: file.name,
            mediaType: file.type,
            dataBase64: await fileAsBase64(file),
            provenance: {
              sourceType: 'real-capture',
              sourceRevision: form.elements.sourceRevision.value,
              rights: {
                tier: 'production-safe',
                license: form.elements.license.value,
                approved: form.elements.rightsApproved.checked,
              },
            },
          },
        };
        const created = await api('/forge/jobs', { method: 'POST', body: JSON.stringify(payload) });
        state.selectedId = created.id;
        await loadJobs();
        form.reset();
        updateIntakeMode();
        notify('Three preview seeds queued.');
      } catch (error) {
        notify(error.message, true);
      } finally {
        submit.disabled = false;
        submit.textContent = isGuidedCapture() ? 'Queue captured preview' : 'Queue three previews';
      }
    });

    skillSelect.addEventListener('change', updateIntakeMode);
    recordCaptureButton.addEventListener('click', startCapture);
    stopCaptureButton.addEventListener('click', stopCapture);
    document.querySelector('#approve-capture').addEventListener('click', approveCapture);
    document.querySelector('#discard-capture').addEventListener('click', resetCapture);
    document.querySelector('#refresh').addEventListener('click', () => loadJobs().catch((error) => notify(error.message, true)));
    Promise.all([loadSkills(), loadJobs(false)]).catch((error) => notify(error.message, true));
    window.setInterval(() => {
      if (!document.hidden) loadJobs().catch(() => {});
    }, 15000);
  </script>
</body>
</html>`;
}
