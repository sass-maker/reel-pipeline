export function reviewPageHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Reel Review</title>
  <link rel="preconnect" href="https://rsms.me/" />
  <link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
  <style>
    :root {
      color-scheme: dark;
      --bg-0: #050507;
      --bg-1: #0c0c10;
      --bg-2: #15151b;
      --bg-3: rgba(255, 255, 255, 0.04);
      --line: rgba(255, 255, 255, 0.08);
      --line-soft: rgba(255, 255, 255, 0.05);
      --text: #f5f6fa;
      --muted: #9aa0ac;
      --dim: #6b6f7a;
      --accent: #7dd3fc;
      --approve: #34d399;
      --reject: #fb7185;
      --warn: #facc15;
      --info: #c4b5fd;
      --shadow-card: 0 30px 80px rgba(0, 0, 0, 0.55), 0 8px 24px rgba(0, 0, 0, 0.3);
      font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-feature-settings: 'cv11', 'ss01', 'ss03';
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      min-height: 100dvh;
      background:
        radial-gradient(1200px 600px at 50% -10%, rgba(125, 211, 252, 0.12), transparent 60%),
        radial-gradient(900px 500px at 90% 110%, rgba(196, 181, 253, 0.08), transparent 60%),
        var(--bg-0);
      color: var(--text);
      -webkit-font-smoothing: antialiased;
    }
    a { color: inherit; }
    button { font: inherit; cursor: pointer; }

    .app {
      max-width: 880px;
      margin: 0 auto;
      padding: 28px 20px 80px;
      display: flex;
      flex-direction: column;
      gap: 22px;
    }

    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
    }
    .brand {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .brand h1 {
      margin: 0;
      font-size: 22px;
      letter-spacing: -0.02em;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .brand .dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: var(--approve);
      box-shadow: 0 0 12px var(--approve);
    }
    .brand .sub {
      margin: 0;
      color: var(--muted);
      font-size: 13px;
    }
    .topbar .stats {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .stat {
      display: inline-flex;
      align-items: baseline;
      gap: 6px;
      padding: 8px 12px;
      border-radius: 12px;
      border: 1px solid var(--line);
      background: var(--bg-1);
      font-size: 12px;
      color: var(--muted);
    }
    .stat b { color: var(--text); font-size: 13px; font-variant-numeric: tabular-nums; }

    .tabs {
      display: flex;
      gap: 6px;
      background: var(--bg-1);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 5px;
      width: fit-content;
    }
    .tab {
      border: 0;
      background: transparent;
      color: var(--muted);
      padding: 8px 14px;
      border-radius: 10px;
      font-weight: 600;
      font-size: 13px;
      letter-spacing: -0.01em;
      transition: all 160ms ease;
    }
    .tab[aria-selected="true"] {
      background: var(--bg-2);
      color: var(--text);
      box-shadow: inset 0 0 0 1px var(--line);
    }
    .tab .count {
      margin-left: 6px;
      font-size: 11px;
      color: var(--dim);
      font-variant-numeric: tabular-nums;
    }
    .tab[aria-selected="true"] .count { color: var(--accent); }

    .stage {
      position: relative;
      min-height: 640px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .stage .stack {
      position: relative;
      width: min(100%, 460px);
      height: 640px;
    }

    .card {
      position: absolute;
      inset: 0;
      border-radius: 28px;
      background: linear-gradient(180deg, var(--bg-2), var(--bg-1) 70%);
      border: 1px solid var(--line);
      box-shadow: var(--shadow-card);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      transform-origin: center bottom;
      transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease, box-shadow 220ms ease;
      will-change: transform, opacity;
    }
    .card.dragging { transition: none; }
    .card[data-depth="0"] {
      z-index: 4;
    }
    .card[data-depth="1"] {
      z-index: 3;
      transform: translateY(14px) scale(0.96);
      opacity: 0.85;
      filter: blur(0.5px) saturate(0.9);
    }
    .card[data-depth="2"] {
      z-index: 2;
      transform: translateY(28px) scale(0.92);
      opacity: 0.55;
      filter: blur(1px) saturate(0.8);
    }
    .card[data-depth="3"] { display: none; }

    .card .accent {
      position: absolute;
      inset: 0;
      pointer-events: none;
      background: radial-gradient(360px 200px at 50% -10%, var(--card-accent, var(--accent)) 0%, transparent 60%);
      opacity: 0.18;
      mix-blend-mode: screen;
    }

    .card .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 18px 20px 0;
      z-index: 1;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 10px;
      border-radius: 999px;
      font-size: 11px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      font-weight: 700;
      border: 1px solid var(--line);
      background: var(--bg-3);
      color: var(--text);
    }
    .badge .swatch {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: var(--card-accent, var(--accent));
      box-shadow: 0 0 8px var(--card-accent, var(--accent));
    }
    .badge.channel { color: var(--warn); border-color: rgba(250, 204, 21, 0.25); background: rgba(250, 204, 21, 0.06); text-transform: none; letter-spacing: 0; }
    .badge.template { color: var(--info); border-color: rgba(196, 181, 253, 0.25); background: rgba(196, 181, 253, 0.06); text-transform: none; letter-spacing: 0; }

    .card .body {
      padding: 14px 22px 18px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      flex: 1;
      min-height: 0;
    }
    .card h2 {
      margin: 0;
      font-size: 26px;
      line-height: 1.12;
      letter-spacing: -0.025em;
      font-weight: 700;
    }
    .card .hook {
      margin: 0;
      color: var(--text);
      font-size: 16px;
      line-height: 1.4;
      opacity: 0.92;
    }
    .card .brief {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      border: 1px solid var(--line-soft);
      border-radius: 16px;
      background: rgba(0, 0, 0, 0.28);
      padding: 14px 16px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
      white-space: pre-wrap;
      scrollbar-width: thin;
      scrollbar-color: var(--line) transparent;
    }
    .card .brief::-webkit-scrollbar { width: 6px; }
    .card .brief::-webkit-scrollbar-thumb { background: var(--line); border-radius: 999px; }

    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .meta .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 9px;
      font-size: 11px;
      border-radius: 999px;
      color: var(--muted);
      border: 1px solid var(--line);
      background: rgba(0, 0, 0, 0.2);
    }
    .meta .chip .key { color: var(--dim); }

    .actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      padding: 14px 18px 18px;
    }
    .btn {
      border: 0;
      border-radius: 16px;
      padding: 14px 16px;
      font-weight: 800;
      font-size: 14px;
      letter-spacing: -0.01em;
      color: #0a0a0c;
      transition: transform 120ms ease, filter 120ms ease;
    }
    .btn:hover { filter: brightness(1.05); }
    .btn:active { transform: scale(0.98); }
    .btn.reject { background: linear-gradient(180deg, #fda4af, #fb7185); }
    .btn.approve { background: linear-gradient(180deg, #6ee7b7, #34d399); }
    .btn.ghost {
      background: var(--bg-2);
      color: var(--text);
      border: 1px solid var(--line);
    }
    .btn.primary {
      background: linear-gradient(180deg, #93c5fd, #60a5fa);
      color: #0a0a0c;
    }

    /* Swipe stamps */
    .stamp {
      position: absolute;
      top: 28px;
      padding: 6px 12px;
      border: 2.5px solid currentColor;
      border-radius: 10px;
      font-weight: 900;
      font-size: 18px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      opacity: 0;
      pointer-events: none;
      transition: opacity 100ms ease;
      z-index: 2;
    }
    .stamp.left { left: 22px; transform: rotate(-12deg); color: var(--reject); }
    .stamp.right { right: 22px; transform: rotate(12deg); color: var(--approve); }
    .card[data-swipe="left"] .stamp.left { opacity: 1; }
    .card[data-swipe="right"] .stamp.right { opacity: 1; }

    /* Variant review */
    .variant-shell {
      width: min(100%, 460px);
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .variant-strip {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding: 2px;
      scrollbar-width: none;
    }
    .variant-strip::-webkit-scrollbar { display: none; }
    .variant-chip {
      flex: 0 0 auto;
      padding: 8px 12px;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: var(--bg-1);
      color: var(--muted);
      font-size: 12px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 110px;
      transition: all 160ms ease;
    }
    .variant-chip .vid { font-weight: 700; color: var(--text); font-size: 13px; }
    .variant-chip .tmpl { color: var(--dim); font-size: 10.5px; letter-spacing: 0.02em; text-transform: uppercase; }
    .variant-chip.active { border-color: var(--accent); color: var(--accent); background: rgba(125, 211, 252, 0.08); }
    .variant-chip.accepted { border-color: var(--approve); color: var(--approve); background: rgba(52, 211, 153, 0.08); }
    .variant-chip.rejected { border-color: var(--reject); color: var(--reject); opacity: 0.6; }
    .variant-chip.needs { border-color: var(--warn); color: var(--warn); background: rgba(250, 204, 21, 0.06); }

    .video-card {
      border: 1px solid var(--line);
      border-radius: 24px;
      overflow: hidden;
      background: var(--bg-1);
      display: flex;
      flex-direction: column;
    }
    .video-card video {
      width: 100%;
      aspect-ratio: 9 / 16;
      background: #000;
      display: block;
    }
    .video-card .meta-row {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      padding: 12px 14px;
      border-bottom: 1px solid var(--line-soft);
      align-items: center;
    }
    .video-card h3 {
      margin: 0;
      font-size: 15px;
      font-weight: 700;
      line-height: 1.2;
    }
    .video-card .hook { padding: 8px 14px 12px; color: var(--muted); font-size: 13px; margin: 0; }
    .video-card .v-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 0 12px 12px; }

    .quality {
      border: 1px solid var(--line);
      border-radius: 22px;
      padding: 20px;
      background:
        radial-gradient(400px 200px at 80% -20%, rgba(125, 211, 252, 0.10), transparent 60%),
        linear-gradient(180deg, rgba(255, 255, 255, 0.025), transparent 60%),
        var(--bg-1);
    }
    .quality-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
      gap: 22px;
      align-items: center;
    }
    @media (max-width: 480px) {
      .quality-grid { grid-template-columns: 1fr; gap: 18px; }
    }
    .quality-head {
      display: flex;
      flex-direction: column;
      gap: 14px;
      align-items: flex-start;
    }
    .ring-wrap {
      position: relative;
      width: 140px;
      height: 140px;
      flex: 0 0 auto;
    }
    .ring-wrap svg { width: 100%; height: 100%; transform: rotate(-90deg); display: block; }
    .ring-track { fill: none; stroke: rgba(255, 255, 255, 0.06); stroke-width: 10; }
    .ring-bar {
      fill: none;
      stroke-linecap: round;
      stroke-width: 10;
      stroke: url(#ring-gradient);
      transition: stroke-dashoffset 600ms cubic-bezier(0.22, 1, 0.36, 1);
    }
    .ring-label {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
    }
    .ring-label .num {
      font-size: 38px;
      font-weight: 700;
      letter-spacing: -0.04em;
      font-variant-numeric: tabular-nums;
      line-height: 1;
    }
    .ring-label .unit {
      font-size: 11px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--dim);
    }
    .quality-meta {
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 100%;
    }
    .quality-gate {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      width: fit-content;
      padding: 5px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      border: 1px solid currentColor;
    }
    .quality-gate::before {
      content: '';
      width: 6px;
      height: 6px;
      border-radius: 999px;
      background: currentColor;
      box-shadow: 0 0 8px currentColor;
    }
    .quality-gate.ready { color: var(--approve); }
    .quality-gate.review { color: var(--warn); }
    .quality-gate.rejected { color: var(--reject); }
    .quality-meta .tag {
      font-size: 12px;
      color: var(--muted);
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .quality-meta .tag b { color: var(--text); font-weight: 600; }

    .radar {
      width: 100%;
      aspect-ratio: 1;
      max-width: 240px;
      margin: 0 auto;
      display: block;
    }
    .radar .grid { fill: none; stroke: rgba(255, 255, 255, 0.07); stroke-width: 1; }
    .radar .axis { stroke: rgba(255, 255, 255, 0.05); stroke-width: 1; }
    .radar .area { fill: rgba(125, 211, 252, 0.18); stroke: var(--accent); stroke-width: 1.5; stroke-linejoin: round; }
    .radar .area.low { fill: rgba(251, 113, 133, 0.18); stroke: var(--reject); }
    .radar .area.mid { fill: rgba(250, 204, 21, 0.18); stroke: var(--warn); }
    .radar .point { fill: var(--accent); }
    .radar .point.low { fill: var(--reject); }
    .radar .point.mid { fill: var(--warn); }
    .radar .label {
      fill: var(--muted);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }

    .dims {
      margin-top: 18px;
      padding-top: 16px;
      border-top: 1px solid var(--line-soft);
      display: grid;
      gap: 8px;
      grid-template-columns: 1fr 1fr;
    }
    @media (max-width: 480px) { .dims { grid-template-columns: 1fr; } }
    .dim {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 11.5px;
    }
    .dim .marker {
      width: 6px;
      height: 6px;
      border-radius: 2px;
      background: var(--approve);
      flex: 0 0 auto;
      box-shadow: 0 0 6px currentColor;
      color: var(--approve);
    }
    .dim.mid .marker { background: var(--warn); color: var(--warn); }
    .dim.low .marker { background: var(--reject); color: var(--reject); }
    .dim .label { color: var(--muted); flex: 1; min-width: 0; }
    .dim .value {
      color: var(--text);
      font-variant-numeric: tabular-nums;
      font-weight: 600;
      letter-spacing: -0.01em;
    }
    .reasons {
      margin: 16px 0 0;
      padding: 12px;
      border-radius: 14px;
      background: rgba(0, 0, 0, 0.32);
      border: 1px solid var(--line-soft);
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .reasons li {
      font-size: 12px;
      line-height: 1.45;
      color: var(--muted);
      display: flex;
      gap: 8px;
      align-items: flex-start;
    }
    .reasons li::before {
      content: '';
      width: 4px;
      height: 4px;
      border-radius: 999px;
      background: var(--warn);
      margin-top: 7px;
      flex: 0 0 auto;
    }
    .reasons.passing li::before { background: var(--approve); }

    /* Empty / loading / error */
    .empty, .error {
      width: min(100%, 460px);
      padding: 48px 28px;
      border-radius: 24px;
      border: 1px solid var(--line);
      background:
        radial-gradient(220px 140px at 50% -10%, rgba(125, 211, 252, 0.07), transparent 70%),
        var(--bg-1);
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }
    .empty .title { font-size: 17px; font-weight: 700; letter-spacing: -0.01em; }
    .empty .sub { color: var(--muted); font-size: 13px; line-height: 1.5; max-width: 320px; }
    .empty .glyph {
      width: 36px;
      height: 36px;
      margin-bottom: 6px;
      color: var(--dim);
    }
    .empty .glyph svg { width: 100%; height: 100%; display: block; }
    .error { border-color: rgba(251, 113, 133, 0.3); color: var(--reject); }

    .spinner {
      width: 28px;
      height: 28px;
      border-radius: 999px;
      border: 2px solid rgba(125, 211, 252, 0.18);
      border-top-color: var(--accent);
      animation: spin 720ms linear infinite;
      margin-bottom: 4px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Footer */
    .footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      padding-top: 6px;
      color: var(--muted);
      font-size: 12px;
    }
    .footer .keys {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    kbd {
      font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
      font-size: 10.5px;
      font-weight: 600;
      letter-spacing: 0.02em;
      min-width: 22px;
      padding: 2px 7px;
      text-align: center;
      border-radius: 6px;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.04);
      color: var(--text);
      box-shadow: inset 0 -1px 0 rgba(255, 255, 255, 0.04);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 22px;
    }
    .footer .keys {
      flex-wrap: wrap;
      row-gap: 8px;
    }
    .footer .keys .group {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border-radius: 12px;
      border: 1px solid var(--line);
      background: var(--bg-1);
      color: var(--muted);
    }
    .footer .keys .group span.k { color: var(--dim); font-size: 11.5px; }
    .footer .controls {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .variant-input {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      border-radius: 12px;
      border: 1px solid var(--line);
      background: var(--bg-1);
      color: var(--muted);
      font-size: 12px;
    }
    .variant-input input {
      width: 44px;
      border: 0;
      background: transparent;
      color: var(--text);
      text-align: center;
      font: inherit;
      font-size: 13px;
      font-weight: 700;
      outline: 0;
    }

    /* Toast */
    .toast-host {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: center;
      z-index: 50;
      pointer-events: none;
    }
    .toast {
      pointer-events: auto;
      background: rgba(20, 20, 25, 0.95);
      backdrop-filter: blur(14px);
      border: 1px solid var(--line);
      color: var(--text);
      padding: 10px 14px;
      border-radius: 14px;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 10px;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
      animation: toast-in 220ms cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    .toast .dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: var(--accent);
      box-shadow: 0 0 10px currentColor;
    }
    .toast.ok .dot { background: var(--approve); }
    .toast.warn .dot { background: var(--warn); }
    .toast.err .dot { background: var(--reject); }
    @keyframes toast-in {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .toast.leaving { animation: toast-out 240ms ease-in both; }
    @keyframes toast-out {
      to { opacity: 0; transform: translateY(8px); }
    }

    @media (max-width: 540px) {
      .topbar { flex-direction: column; align-items: flex-start; gap: 12px; }
      .topbar .stats { flex-wrap: wrap; }
      .card h2 { font-size: 22px; }
      .stage { min-height: 600px; }
      .stage .stack { height: 600px; }
    }
  </style>
</head>
<body>
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <h1><span class="dot" aria-hidden="true"></span> Reel Review</h1>
        <p class="sub">Swipe left to reject. Swipe right to approve. <kbd>←</kbd> <kbd>→</kbd> work too.</p>
      </div>
      <div class="stats">
        <div class="stat">Pending <b id="stat-pending">0</b></div>
        <div class="stat">Approved <b id="stat-approved">0</b></div>
        <div class="stat">Rendered <b id="stat-rendered">0</b></div>
        <div class="stat">Ready <b id="stat-ready">0</b></div>
      </div>
    </header>

    <nav class="tabs" role="tablist" aria-label="Review modes">
      <button class="tab" role="tab" data-mode="ideas" aria-selected="true">Ideas <span class="count" id="count-ideas">0</span></button>
      <button class="tab" role="tab" data-mode="rendered" aria-selected="false">Rendered <span class="count" id="count-rendered">0</span></button>
      <button class="tab" role="tab" data-mode="ready" aria-selected="false">Ready <span class="count" id="count-ready-tab">0</span></button>
    </nav>

    <section class="stage" id="stage"><div class="empty"><div class="spinner" aria-hidden="true"></div><div class="title">Loading reel drafts</div><div class="sub">Pulling generated, approved, and rendered records from R2.</div></div></section>

    <footer class="footer">
      <div class="keys">
        <div class="group"><kbd>←</kbd><span class="k">reject</span></div>
        <div class="group"><kbd>→</kbd><span class="k">approve</span></div>
        <div class="group"><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><span class="k">switch tab</span></div>
        <div class="group"><kbd>R</kbd><span class="k">render</span></div>
      </div>
      <div class="controls">
        <label class="variant-input" for="variant-count">Variants <input id="variant-count" type="number" min="1" max="6" value="3" /></label>
        <button class="btn primary" id="render-approved" type="button">Render next approved</button>
      </div>
    </footer>
  </div>
  <div class="toast-host" id="toasts" aria-live="polite"></div>

  <script>
    const PROJECT_COLORS = {};
    const stage = document.querySelector('#stage');
    const variantInput = document.querySelector('#variant-count');
    const tabs = document.querySelectorAll('.tab');
    const state = {
      mode: 'ideas',
      ideas: [],
      ideaIndex: 0,
      rendered: [],
      renderedIndex: 0,
      variantIndex: 0,
      ready: [],
      readyIndex: 0,
      stats: { approved: 0, rendered: 0, ready: 0, pending: 0 },
      dragging: null,
    };

    init();

    async function init() {
      tabs.forEach((tab) => tab.addEventListener('click', () => switchMode(tab.dataset.mode)));
      document.querySelector('#render-approved').addEventListener('click', renderNextApproved);
      document.addEventListener('keydown', onKey);
      await loadAll();
    }

    async function loadAll() {
      try {
        const [generated, approved, ready, renderedReady, needs] = await Promise.all([
          fetchReels('generated'),
          fetchReels('approved'),
          fetchReels('ready_to_post'),
          fetchReels('video_ready'),
          fetchReels('needs_review'),
        ]);
        state.ideas = generated;
        state.rendered = mergeUnique([...renderedReady, ...needs])
          .filter((reel) => Array.isArray(reel.variants) && reel.variants.length > 0);
        state.ready = ready.filter((reel) => Array.isArray(reel.variants) && reel.variants.length > 0);
        state.ideaIndex = 0;
        state.renderedIndex = 0;
        state.variantIndex = 0;
        state.readyIndex = 0;
        state.stats = {
          pending: generated.length,
          approved: approved.length,
          rendered: state.rendered.length,
          ready: ready.length,
        };
        paintStats();
        render();
      } catch (error) {
        renderError(error);
      }
    }

    async function fetchReels(status) {
      const res = await fetch('/reels?status=' + encodeURIComponent(status));
      if (!res.ok) throw new Error('Could not load reels (' + status + ')');
      const payload = await res.json();
      return payload.data || [];
    }

    function mergeUnique(records) {
      const seen = new Set();
      const out = [];
      for (const record of records) {
        if (seen.has(record.id)) continue;
        seen.add(record.id);
        out.push(record);
      }
      return out;
    }

    function paintStats() {
      document.querySelector('#stat-pending').textContent = state.stats.pending;
      document.querySelector('#stat-approved').textContent = state.stats.approved;
      document.querySelector('#stat-rendered').textContent = state.stats.rendered;
      document.querySelector('#stat-ready').textContent = state.stats.ready;
      document.querySelector('#count-ideas').textContent = state.ideas.length;
      document.querySelector('#count-rendered').textContent = state.rendered.length;
      document.querySelector('#count-ready-tab').textContent = state.ready.length;
    }

    function switchMode(mode) {
      state.mode = mode;
      state.variantIndex = 0;
      tabs.forEach((tab) => tab.setAttribute('aria-selected', tab.dataset.mode === mode ? 'true' : 'false'));
      render();
    }

    function render() {
      if (state.mode === 'ideas') return renderIdeas();
      if (state.mode === 'rendered') return renderRenderedReview();
      if (state.mode === 'ready') return renderReady();
    }

    function renderIdeas() {
      const remaining = state.ideas.slice(state.ideaIndex, state.ideaIndex + 3);
      if (!remaining.length) {
        stage.innerHTML = emptyHtml(GLYPHS.inbox, 'Inbox zero on ideas', 'No reels waiting on a swipe. New ideas show up here as agents submit them.');
        return;
      }
      stage.innerHTML = '<div class="stack" id="stack">' + remaining.map((reel, idx) => ideaCardHtml(reel, idx)).join('') + '</div>';
      bindTopCard(remaining[0]);
    }

    function ideaCardHtml(reel, depth) {
      const accent = colorFor(reel.projectSlug);
      const meta = [];
      if (reel.audience) meta.push(chipHtml('audience', reel.audience));
      if (reel.productUrl) meta.push(chipHtml('product', reel.productUrl));
      if (reel.template) meta.push(chipHtml('template', reel.template));
      if (Array.isArray(reel.demoSteps) && reel.demoSteps.length) meta.push(chipHtml('demo', reel.demoSteps.length + ' step(s)'));
      meta.push(chipHtml('id', reel.id));
      return ''
        + '<article class="card" data-depth="' + depth + '" data-id="' + escapeAttr(reel.id) + '" style="--card-accent: ' + accent + ';">'
        + '  <div class="accent"></div>'
        + '  <span class="stamp left">Reject</span>'
        + '  <span class="stamp right">Approve</span>'
        + '  <div class="head">'
        + '    <span class="badge"><span class="swatch"></span>' + escapeHtml(reel.projectSlug) + '</span>'
        + '    <span class="badge channel">' + escapeHtml(reel.channel) + '</span>'
        + '  </div>'
        + '  <div class="body">'
        + '    <h2>' + escapeHtml(reel.title) + '</h2>'
        + '    <p class="hook">' + escapeHtml(reel.hook) + '</p>'
        + '    <div class="brief">' + escapeHtml(reel.body) + '</div>'
        + '    <div class="meta">' + meta.join('') + '</div>'
        + '  </div>'
        + (depth === 0
            ? '  <div class="actions">'
              + '    <button class="btn reject" data-action="reject">Reject</button>'
              + '    <button class="btn approve" data-action="approve">Approve</button>'
              + '  </div>'
            : '')
        + '</article>';
    }

    function bindTopCard(reel) {
      const card = stage.querySelector('.card[data-depth="0"]');
      if (!card) return;
      card.querySelector('[data-action="reject"]').addEventListener('click', () => decideIdea(reel.id, 'reject'));
      card.querySelector('[data-action="approve"]').addEventListener('click', () => decideIdea(reel.id, 'approve'));

      let startX = 0;
      let startY = 0;
      let deltaX = 0;
      let deltaY = 0;
      let active = false;

      const begin = (event) => {
        if (event.target.closest('.brief')) return;
        active = true;
        const point = event.touches ? event.touches[0] : event;
        startX = point.clientX;
        startY = point.clientY;
        deltaX = 0;
        deltaY = 0;
        card.classList.add('dragging');
        if (card.setPointerCapture && event.pointerId !== undefined) {
          try { card.setPointerCapture(event.pointerId); } catch {}
        }
      };
      const move = (event) => {
        if (!active) return;
        const point = event.touches ? event.touches[0] : event;
        deltaX = point.clientX - startX;
        deltaY = point.clientY - startY;
        const rotate = Math.max(-18, Math.min(18, deltaX / 18));
        card.style.transform = 'translate(' + deltaX + 'px, ' + deltaY * 0.2 + 'px) rotate(' + rotate + 'deg)';
        if (deltaX > 60) card.dataset.swipe = 'right';
        else if (deltaX < -60) card.dataset.swipe = 'left';
        else delete card.dataset.swipe;
      };
      const end = () => {
        if (!active) return;
        active = false;
        card.classList.remove('dragging');
        if (deltaX > 130) { commit('approve'); return; }
        if (deltaX < -130) { commit('reject'); return; }
        card.style.transform = '';
        delete card.dataset.swipe;
      };
      const commit = (decision) => {
        const dir = decision === 'approve' ? 1 : -1;
        card.style.transform = 'translate(' + (dir * 640) + 'px, ' + Math.abs(deltaY) + 'px) rotate(' + (dir * 24) + 'deg)';
        card.style.opacity = '0';
        decideIdea(reel.id, decision);
      };

      card.addEventListener('pointerdown', begin);
      card.addEventListener('pointermove', move);
      card.addEventListener('pointerup', end);
      card.addEventListener('pointercancel', end);
    }

    async function decideIdea(id, decision) {
      try {
        const res = await fetch('/reels/' + encodeURIComponent(id) + '/decision', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ decision }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || 'Decision failed');
        toast(decision === 'approve' ? 'ok' : 'warn', decision === 'approve' ? 'Approved ' + id : 'Rejected ' + id);
        state.ideaIndex += 1;
        if (decision === 'approve') {
          state.stats.approved += 1;
        }
        state.stats.pending = Math.max(0, state.stats.pending - 1);
        paintStats();
        setTimeout(render, 220);
      } catch (error) {
        toast('err', error.message);
      }
    }

    function renderRenderedReview() {
      const reel = state.rendered[state.renderedIndex];
      if (!reel) {
        stage.innerHTML = emptyHtml(GLYPHS.frame, 'No rendered videos to review', 'Approve some ideas and render them. Variants land here for per-variant accept or reject.');
        return;
      }
      const variants = Array.isArray(reel.variants) ? reel.variants : [];
      if (!variants.length) {
        stage.innerHTML = emptyHtml(GLYPHS.empty, 'No variants on this render', 'Re-render with variantCount ≥ 1 to populate this reel.');
        return;
      }
      const reviewable = variants.findIndex((variant, index) => index >= state.variantIndex && (variant.status === 'video_ready' || variant.status === 'needs_review'));
      if (reviewable === -1) {
        const accepted = variants.find((variant) => variant.status === 'ready_to_post');
        stage.innerHTML = emptyHtml(accepted ? GLYPHS.check : GLYPHS.broom, accepted ? 'Variant accepted for ' + reel.title : 'All variants reviewed', accepted ? 'Ready to post. Switch to the Ready tab to see all accepted variants.' : 'Move to the next rendered reel.');
        return;
      }
      state.variantIndex = reviewable;
      const variant = variants[reviewable];
      stage.innerHTML = variantViewHtml(reel, variants, variant);
      bindVariantView(reel, variants, variant);
    }

    function variantViewHtml(reel, variants, variant) {
      const accent = colorFor(reel.projectSlug);
      const strip = variants.map((entry, idx) => {
        const cls = entry.status === 'ready_to_post' ? 'accepted'
          : entry.status === 'video_rejected' ? 'rejected'
          : entry.status === 'needs_review' ? 'needs'
          : (entry.variantId === variant.variantId ? 'active' : '');
        return ''
          + '<div class="variant-chip ' + cls + '">'
          + '  <span class="vid">' + escapeHtml(entry.variantId || ('v' + (idx + 1))) + '</span>'
          + '  <span class="tmpl">' + escapeHtml((entry.templateLabel || entry.template || 'no template')) + '</span>'
          + '</div>';
      }).join('');
      const score = Number.isFinite(variant.qualityScore) ? variant.qualityScore : null;
      const gate = variant.status === 'video_ready' ? 'ready' : variant.status === 'video_rejected' ? 'rejected' : 'review';
      const gateLabel = variant.status === 'video_ready' ? 'Passes gate' : variant.status === 'video_rejected' ? 'Rejected' : 'Needs review';
      const dims = variant.qualityScores || {};
      const dimRows = ['valueClarity','productProofStrength','visualTrust','captionReadability','mobileComposition','cringeRisk','postingReadiness']
        .filter((key) => Number.isFinite(dims[key]))
        .map((key) => {
          const pct = Math.round(dims[key] * 100);
          const tier = pct < 45 ? ' low' : pct < 70 ? ' mid' : '';
          return ''
            + '<div class="dim' + tier + '">'
            + '  <span class="marker"></span>'
            + '  <span class="label">' + escapeHtml(humanize(key)) + '</span>'
            + '  <span class="value">' + pct + '</span>'
            + '</div>';
        }).join('');
      const reasons = Array.isArray(variant.qualityReasons) ? variant.qualityReasons : [];
      const reasonsClass = variant.status === 'video_ready' ? 'reasons passing' : 'reasons';
      const reasonHtml = reasons.length ? '<ul class="' + reasonsClass + '">' + reasons.slice(0, 5).map((reason) => '<li>' + escapeHtml(reason) + '</li>').join('') + '</ul>' : '';
      const ringHtml = score !== null ? ringSvg(score, gate) : '';
      const radarHtml = Object.keys(dims).length ? radarSvg(dims, gate) : '';
      const tagRows = [];
      if (variant.templateLabel || variant.template) tagRows.push('<div class="tag">template <b>' + escapeHtml(variant.templateLabel || variant.template) + '</b></div>');
      if (variant.proofType) tagRows.push('<div class="tag">proof <b>' + escapeHtml(variant.proofType) + '</b></div>');
      if (Number.isFinite(variant.durationSeconds)) tagRows.push('<div class="tag">length <b>' + variant.durationSeconds + 's</b></div>');

      return ''
        + '<div class="variant-shell" style="--card-accent: ' + accent + ';">'
        + '  <div class="variant-strip">' + strip + '</div>'
        + '  <article class="video-card">'
        + '    <div class="meta-row">'
        + '      <h3>' + escapeHtml(reel.title) + '</h3>'
        + '      <span class="badge channel">' + escapeHtml(reel.channel) + '</span>'
        + '    </div>'
        + (variant.assetUrl
            ? '    <video controls playsinline preload="metadata" src="' + escapeAttr(variant.assetUrl) + '"></video>'
            : '    <div class="empty" style="border:0;padding:36px"><div class="emoji">📭</div><div class="title">No video URL on this variant</div></div>')
        + '    <p class="hook">' + escapeHtml(variant.hook || reel.hook) + '</p>'
        + '    <div class="v-actions">'
        + '      <button class="btn reject" data-action="reject-variant">Reject variant</button>'
        + '      <button class="btn approve" data-action="approve-variant">Ready to post</button>'
        + '    </div>'
        + '  </article>'
        + (score !== null
            ? '<div class="quality">'
              + '  <div class="quality-grid">'
              + '    <div class="quality-head">'
              + '      ' + ringHtml
              + '      <div class="quality-meta">'
              + '        <span class="quality-gate ' + gate + '">' + escapeHtml(gateLabel) + '</span>'
              + '        ' + tagRows.join('')
              + '      </div>'
              + '    </div>'
              + '    ' + radarHtml
              + '  </div>'
              + '  <div class="dims">' + dimRows + '</div>'
              + reasonHtml
              + '</div>'
            : '')
        + '</div>';
    }

    function bindVariantView(reel, variants, variant) {
      const root = stage.querySelector('.variant-shell');
      if (!root) return;
      root.querySelector('[data-action="reject-variant"]').addEventListener('click', () => decideVariant(reel.id, variant.variantId, 'reject'));
      root.querySelector('[data-action="approve-variant"]').addEventListener('click', () => decideVariant(reel.id, variant.variantId, 'approve'));
    }

    async function decideVariant(reelId, variantId, decision) {
      try {
        const res = await fetch('/reels/' + encodeURIComponent(reelId) + '/video-decision', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ decision, variantId }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || 'Variant decision failed');
        toast(decision === 'approve' ? 'ok' : 'warn', decision === 'approve' ? 'Variant ' + variantId + ' ready to post' : 'Variant ' + variantId + ' rejected');
        const updated = payload.data;
        const idx = state.rendered.findIndex((entry) => entry.id === reelId);
        if (idx !== -1) state.rendered[idx] = updated;
        if (updated.status === 'ready_to_post') {
          state.ready.push(updated);
          state.stats.ready += 1;
        }
        state.variantIndex += 1;
        if (state.variantIndex >= (updated.variants?.length ?? 0)) {
          state.renderedIndex += 1;
          state.variantIndex = 0;
        }
        paintStats();
        render();
      } catch (error) {
        toast('err', error.message);
      }
    }

    function renderReady() {
      const reels = state.ready;
      if (!reels.length) {
        stage.innerHTML = emptyHtml(GLYPHS.outbox, 'Nothing ready to post yet', 'Variants you accept move here. Posting itself is still gated separately.');
        return;
      }
      const html = reels.map((reel) => {
        const accent = colorFor(reel.projectSlug);
        const accepted = (reel.variants || []).find((variant) => variant.status === 'ready_to_post');
        if (!accepted) return '';
        return ''
          + '<div class="variant-shell" style="--card-accent: ' + accent + ';">'
          + '  <article class="video-card">'
          + '    <div class="meta-row">'
          + '      <h3>' + escapeHtml(reel.title) + '</h3>'
          + '      <span class="badge channel">' + escapeHtml(reel.channel) + '</span>'
          + '    </div>'
          + (accepted.assetUrl
              ? '    <video controls playsinline preload="metadata" src="' + escapeAttr(accepted.assetUrl) + '"></video>'
              : '')
          + '    <p class="hook">' + escapeHtml(reel.hook) + '</p>'
          + '  </article>'
          + '</div>';
      }).filter(Boolean).join('<div style="height:14px"></div>');
      stage.innerHTML = '<div style="width:min(100%,460px);display:flex;flex-direction:column;gap:14px;">' + html + '</div>';
    }

    async function renderNextApproved() {
      try {
        const approved = await fetchReels('approved');
        const reel = approved.find((entry) => !entry.renderJobId && (!Array.isArray(entry.variants) || entry.variants.length === 0));
        if (!reel) { toast('warn', 'No approved unrendered reels.'); return; }
        const variantCount = selectedVariantCount();
        toast('info', 'Rendering ' + reel.title + ' · ' + variantCount + ' variant(s)…');
        const res = await fetch('/reels/' + encodeURIComponent(reel.id) + '/render', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode: 'html-composition', variantCount }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || 'Render failed');
        const variants = payload.data?.variants ?? payload.data?.reel?.variants ?? [];
        toast('ok', 'Rendered ' + (variants.length || 1) + ' variant(s) · switching to Rendered tab');
        await loadAll();
        switchMode('rendered');
      } catch (error) {
        toast('err', error.message);
      }
    }

    function selectedVariantCount() {
      const value = Number(variantInput?.value ?? 1);
      return Number.isFinite(value) && value > 0 ? Math.min(6, Math.max(1, Math.round(value))) : 1;
    }

    function onKey(event) {
      if (event.target.tagName === 'INPUT') return;
      if (state.mode === 'ideas') {
        const reel = state.ideas[state.ideaIndex];
        if (!reel) return;
        if (event.key === 'ArrowLeft') decideIdea(reel.id, 'reject');
        if (event.key === 'ArrowRight') decideIdea(reel.id, 'approve');
      }
      if (event.key === 'r' || event.key === 'R') renderNextApproved();
      if (event.key === '1') switchMode('ideas');
      if (event.key === '2') switchMode('rendered');
      if (event.key === '3') switchMode('ready');
    }

    const GLYPHS = {
      inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13l3-8h12l3 8"/><path d="M3 13v6a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-6"/><path d="M3 13h5l1.5 2h5L16 13h5"/></svg>',
      frame: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9l5 3-5 3z" fill="currentColor"/></svg>',
      empty: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg>',
      check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>',
      broom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l16-16"/><path d="M10 14l-6 6"/><path d="M16 4l4 4"/></svg>',
      outbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13l3-8h12l3 8"/><path d="M3 13v6a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-6"/><path d="M9 16l3-3 3 3"/><path d="M12 13v-7"/></svg>',
      alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><circle cx="12" cy="16" r="0.6" fill="currentColor"/></svg>',
    };

    function emptyHtml(glyph, title, sub) {
      return '<div class="empty">'
        + (glyph ? '<div class="glyph">' + glyph + '</div>' : '')
        + '<div class="title">' + escapeHtml(title) + '</div>'
        + '<div class="sub">' + escapeHtml(sub) + '</div>'
        + '</div>';
    }

    function renderError(error) {
      stage.innerHTML = '<div class="error"><div class="glyph">' + GLYPHS.alert + '</div><div>' + escapeHtml(error.message || String(error)) + '</div></div>';
    }

    function toast(kind, message) {
      const host = document.querySelector('#toasts');
      const el = document.createElement('div');
      el.className = 'toast ' + (kind || '');
      el.innerHTML = '<span class="dot"></span>' + escapeHtml(message);
      host.appendChild(el);
      setTimeout(() => {
        el.classList.add('leaving');
        el.addEventListener('animationend', () => el.remove(), { once: true });
      }, 2400);
    }

    function chipHtml(key, value) {
      return '<span class="chip"><span class="key">' + escapeHtml(key) + '</span><span>' + escapeHtml(value) + '</span></span>';
    }

    function colorFor(slug) {
      if (PROJECT_COLORS[slug]) return PROJECT_COLORS[slug];
      const hue = Math.abs(hashCode(slug || 'default')) % 360;
      const color = 'hsl(' + hue + ' 85% 70%)';
      PROJECT_COLORS[slug] = color;
      return color;
    }

    function hashCode(value) {
      let hash = 0;
      const text = String(value);
      for (let i = 0; i < text.length; i += 1) {
        hash = (hash << 5) - hash + text.charCodeAt(i);
        hash |= 0;
      }
      return hash;
    }

    function humanize(value) {
      return String(value).replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
    }

    function ringSvg(score, gate) {
      const pct = Math.max(0, Math.min(1, score));
      const value = Math.round(pct * 100);
      const radius = 56;
      const circumference = 2 * Math.PI * radius;
      const offset = circumference * (1 - pct);
      const colors = gate === 'ready'
        ? ['#34d399', '#7dd3fc']
        : gate === 'rejected'
          ? ['#fb7185', '#f59e0b']
          : ['#facc15', '#f59e0b'];
      return ''
        + '<div class="ring-wrap">'
        + '  <svg viewBox="0 0 140 140" aria-hidden="true">'
        + '    <defs>'
        + '      <linearGradient id="ring-gradient" x1="0" y1="0" x2="1" y2="1">'
        + '        <stop offset="0%" stop-color="' + colors[0] + '" />'
        + '        <stop offset="100%" stop-color="' + colors[1] + '" />'
        + '      </linearGradient>'
        + '    </defs>'
        + '    <circle class="ring-track" cx="70" cy="70" r="' + radius + '" />'
        + '    <circle class="ring-bar" cx="70" cy="70" r="' + radius + '" stroke-dasharray="' + circumference.toFixed(2) + '" stroke-dashoffset="' + offset.toFixed(2) + '" />'
        + '  </svg>'
        + '  <div class="ring-label">'
        + '    <span class="num">' + value + '</span>'
        + '    <span class="unit">Quality</span>'
        + '  </div>'
        + '</div>';
    }

    function radarSvg(dims, gate) {
      const keys = ['valueClarity', 'productProofStrength', 'visualTrust', 'captionReadability', 'mobileComposition', 'cringeRisk', 'postingReadiness'];
      const labels = { valueClarity: 'Value', productProofStrength: 'Proof', visualTrust: 'Trust', captionReadability: 'Caption', mobileComposition: 'Mobile', cringeRisk: 'Tone', postingReadiness: 'Ready' };
      const size = 240;
      const center = size / 2;
      const maxRadius = center - 28;
      const axisCount = keys.length;
      const angleFor = (index) => -Math.PI / 2 + (index * 2 * Math.PI) / axisCount;
      const pointFor = (index, value) => {
        const angle = angleFor(index);
        const radius = maxRadius * Math.max(0, Math.min(1, value));
        return [center + Math.cos(angle) * radius, center + Math.sin(angle) * radius];
      };
      const labelPoint = (index) => {
        const angle = angleFor(index);
        const radius = maxRadius + 14;
        return [center + Math.cos(angle) * radius, center + Math.sin(angle) * radius];
      };

      const grid = [0.25, 0.5, 0.75, 1].map((ratio) => {
        const points = keys.map((_, index) => {
          const angle = angleFor(index);
          const radius = maxRadius * ratio;
          return [center + Math.cos(angle) * radius, center + Math.sin(angle) * radius];
        });
        return '<polygon class="grid" points="' + points.map((point) => point.join(',')).join(' ') + '" />';
      }).join('');

      const axes = keys.map((_, index) => {
        const [x, y] = pointFor(index, 1);
        return '<line class="axis" x1="' + center + '" y1="' + center + '" x2="' + x + '" y2="' + y + '" />';
      }).join('');

      const values = keys.map((key) => Number(dims[key]) || 0);
      const polyPoints = values.map((value, index) => pointFor(index, value).join(',')).join(' ');
      const polyTier = gate === 'rejected' ? 'low' : gate === 'review' ? 'mid' : '';

      const points = values.map((value, index) => {
        const [x, y] = pointFor(index, value);
        return '<circle class="point ' + polyTier + '" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3" />';
      }).join('');

      const axisLabels = keys.map((key, index) => {
        const [x, y] = labelPoint(index);
        const anchor = Math.abs(x - center) < 1 ? 'middle' : x > center ? 'start' : 'end';
        const baseline = y < center - 6 ? 'auto' : y > center + 6 ? 'hanging' : 'middle';
        return '<text class="label" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" text-anchor="' + anchor + '" dominant-baseline="' + baseline + '">' + labels[key] + '</text>';
      }).join('');

      return ''
        + '<svg class="radar" viewBox="0 0 ' + size + ' ' + size + '" aria-hidden="true">'
        + grid
        + axes
        + '<polygon class="area ' + polyTier + '" points="' + polyPoints + '" />'
        + points
        + axisLabels
        + '</svg>';
    }

    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    }
    function escapeAttr(value) { return escapeHtml(value); }
  </script>
</body>
</html>`;
}
