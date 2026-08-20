/**
 * THESIS: A living film archive where every beautiful result remains inseparable from the prompt and machinery that made it.
 * OWN-WORLD: Near-black projection room, full-height picture, restrained evidence beam, sharp system type, and film-ledgers instead of dashboard cards.
 * STORY: Revisit any saved production, inspect its prompt and workflow, then modify it or make the next one.
 * FIRST VIEWPORT: The latest reviewable film dominates beside its prompt and production route; recent history forms a low filmstrip below.
 * FORM: Experience-first archive with operate-mode libraries; selected from the strongest authored composition, not a catalog grid.
 */
import brandConfig from '../../config/brand-channels.json' with { type: 'json' };
import arsenalConfig from '../../config/studio-arsenal.json' with { type: 'json' };

const TOOLS = arsenalConfig.tools.filter((entry) => entry.ui !== false).map((entry) => structuredClone(entry));
const FILM_STYLES = arsenalConfig.recipes.map((entry) => [entry.id, {
  id:entry.id,
  name:entry.name,
  version:entry.version ?? 1,
}]);

const BRANDS = Object.entries(brandConfig.brands ?? {}).map(([slug, brand]) => ({
  slug,
  name: brand.name,
}));

const PLATFORM_SOUND_PRESETS = Object.freeze([
  { id:'makeba', artist:'Jain', title:'Makeba', videoId:'ryG4CSQ_aJE', spotifyTrackId:'2QfTXwdNLdx7qEJFqiN12r', startSeconds:38, mood:'Playful bounce' },
  { id:'one-kiss', artist:'Calvin Harris & Dua Lipa', title:'One Kiss', videoId:'h8P-d0RV2Mk', spotifyTrackId:'7ef4DlsgrMEH11cDZd32M6', startSeconds:46, mood:'Late-night house' },
  { id:'levitating', artist:'Dua Lipa', title:'Levitating', videoId:'WHuBW3qKm9g', spotifyTrackId:'463CkQjx2Zk1yXoBuierM9', startSeconds:43, mood:'Bright pop' },
  { id:'blinding-lights', artist:'The Weeknd', title:'Blinding Lights', videoId:'fHI8X4OXluQ', spotifyTrackId:'0VjIjW4GlUZAMYd2vXMi3b', startSeconds:49, mood:'Neon drive' },
]);
export function studioPageHtml() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Plan, generate, review, and assemble reproducible story-first videos with versioned Film styles.">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='16' fill='%230c1016'/%3E%3Cpath d='M7 16h18' stroke='%2382d9a7' stroke-width='3'/%3E%3C/svg%3E">
<title>Video Maker — Reel Pipeline</title>
<style>
  :root {
    color-scheme: dark;
    --bg:#07090d;
    --surface:#11151c;
    --raised:#171d26;
    --line:#29313d;
    --text:#f3f5f7;
    --muted:#aab2bc;
    --dim:#7f8995;
    --evidence:#d9e6ef;
    --verified:#82d9a7;
    --verified-wash:rgba(130,217,167,.045);
    --beam-mid:#536273;
    --beam-edge:#34404d;
    --risk:#ff6b76;
    --warning:#f3c980;
    --focus:#b9dcff;
    --radius:14px;
  }
  * { box-sizing: border-box; }
  html { background:var(--bg); }
  body {
    margin:0;
    min-width:320px;
    background:var(--bg);
    color:var(--text);
    font:14px/1.5 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    text-rendering:optimizeLegibility;
  }
  button, input, textarea, select { font:inherit; }
  button, a, input, textarea, select { outline:none; }
  :focus-visible { box-shadow:0 0 0 3px rgba(185,220,255,.34); }
  a { color:var(--evidence); }
  .skip-link { position:absolute; left:12px; top:-50px; z-index:20; min-height:44px; display:inline-flex; align-items:center; background:var(--text); color:var(--bg); padding:8px 12px; }
  .skip-link:focus { top:12px; }
  .product-bar {
    min-height:72px;
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:24px;
    padding:12px clamp(16px,3vw,40px);
    border-bottom:1px solid var(--line);
    background:#090c11;
  }
  .brand-lockup { display:flex; align-items:center; gap:13px; min-width:0; }
  .brand-mark {
    width:34px;
    height:34px;
    border:1px solid #43505f;
    border-radius:50%;
    background:#0c1016;
    position:relative;
    flex:0 0 auto;
  }
  .brand-mark::after {
    content:"";
    position:absolute;
    left:7px;
    right:7px;
    top:16px;
    height:2px;
    background:var(--verified);
  }
  .brand-lockup h1 { margin:0; font-size:1.04rem; letter-spacing:-.02em; }
  .brand-lockup p { margin:3px 0 0; color:var(--muted); font-size:.78rem; }
  .utility-links { display:flex; gap:14px; align-items:center; flex-wrap:wrap; }
  .utility-links a { min-height:44px; display:inline-flex; align-items:center; color:var(--muted); font-size:13px; text-decoration:none; }
  .utility-links a:hover { color:var(--text); }
  .utility-links a[aria-current="page"] { color:var(--text); border:1px solid var(--line); border-radius:9px; padding-inline:13px; background:var(--raised); }
  .primary-nav {
    display:flex;
    gap:4px;
    padding:10px clamp(16px,3vw,40px);
    border-bottom:1px solid var(--line);
    background:#0b0e13;
    overflow-x:auto;
  }
  .primary-nav [role="tablist"] { display:flex; gap:4px; }
  .primary-nav button {
    min-height:44px;
    border:1px solid transparent;
    background:transparent;
    color:var(--muted);
    padding:8px 14px;
    border-radius:8px;
    cursor:pointer;
    white-space:nowrap;
  }
  .primary-nav button:hover { color:var(--text); background:var(--surface); }
  .primary-nav button[aria-selected="true"] { color:var(--text); border-color:var(--line); background:var(--raised); }
  .operation-status { min-height:28px; display:flex; align-items:center; justify-content:flex-end; padding:4px clamp(16px,3vw,40px); border-bottom:1px solid var(--line); background:#090c11; color:var(--dim); font-size:11px; }
  .operation-status.busy { color:var(--evidence); }
  .shell { width:min(1440px,100%); margin:0 auto; padding:clamp(20px,3vw,42px); }
  .view[hidden] { display:none; }
  .view-head { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; margin-bottom:24px; }
  .view-head h2 { margin:0; font-size:24px; letter-spacing:-.025em; }
  .view-head p { margin:5px 0 0; color:var(--muted); max-width:68ch; }
  .count-note { color:var(--dim); font-size:12px; white-space:nowrap; }
  .create-grid { display:grid; grid-template-columns:minmax(320px,390px) minmax(0,1fr); gap:24px; align-items:start; }
  .stage { border:1px solid var(--line); background:var(--surface); border-radius:var(--radius); overflow:hidden; }
  .stage + .stage { margin-top:16px; }
  .stage-head { padding:16px 18px 12px; border-bottom:1px solid var(--line); }
  .stage-head h3 { margin:0; font-size:15px; letter-spacing:-.01em; }
  .stage-head p { margin:4px 0 0; color:var(--muted); font-size:13px; }
  .stage-body { padding:18px; }
  .conversation { min-height:220px; display:grid; align-content:start; gap:10px; margin-bottom:14px; }
  .message { max-width:86%; padding:10px 12px; border:1px solid var(--line); border-radius:10px; white-space:pre-wrap; }
  .message.operator { justify-self:end; background:var(--raised); }
  .message.assistant { justify-self:start; background:#0d1117; color:var(--evidence); }
  .message.empty { max-width:100%; color:var(--muted); background:transparent; border-style:dashed; }
  .composer { display:grid; gap:10px; }
  .composer textarea { min-height:112px; }
  .prompt-studio { max-width:920px; margin:clamp(24px,5vw,64px) auto 28px; border:1px solid var(--line); border-radius:16px; background:var(--surface); overflow:hidden; }
  .prompt-studio .composer { gap:0; }
  .prompt-studio label[for="request"] { padding:22px 22px 0; color:var(--text); font-size:15px; font-weight:700; }
  .prompt-studio textarea { min-height:170px; padding:14px 22px 20px; border:0; border-radius:0; background:transparent; font-size:18px; line-height:1.5; }
  .prompt-studio textarea:focus { outline:0; }
  .prompt-studio textarea:focus-visible { box-shadow:inset 0 0 0 2px var(--focus); }
  .prompt-studio.has-proposal { display:none; }
  .voice-controls { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 22px; border-top:1px solid var(--line); background:#0d1117; }
  .voice-controls p { margin:0; color:var(--dim); font-size:12px; }
  .voice-controls.recording p { color:var(--risk); }
  .workflow-progress { max-width:920px; margin:0 auto 22px; border:1px solid var(--line); border-radius:var(--radius); background:var(--surface); overflow:hidden; }
  .workflow-progress[hidden] { display:none; }
  .workflow-progress-head { display:flex; align-items:center; justify-content:space-between; gap:14px; padding:14px 16px; border-bottom:1px solid var(--line); }
  .workflow-progress-head h3 { margin:0; font-size:14px; }
  .workflow-progress-head p { margin:3px 0 0; color:var(--dim); font-size:11px; }
  .stage-rail { display:grid; grid-template-columns:repeat(8,minmax(90px,1fr)); overflow-x:auto; }
  .stage-card { min-height:96px; display:grid; align-content:space-between; gap:8px; padding:12px; border:0; border-right:1px solid var(--line); background:transparent; color:var(--text); text-align:left; }
  .stage-card:last-child { border-right:0; }
  .stage-card strong { font-size:12px; }
  .stage-card small { color:var(--dim); font-size:10px; text-transform:uppercase; }
  .stage-card.ready { background:#101b18; cursor:pointer; }
  .stage-card.completed small { color:var(--verified); }
  .stage-card.failed small,.stage-card.blocked small { color:var(--risk); }
  .stage-card[disabled] { opacity:.7; }
  .workflow-proposal { position:relative; max-width:1080px; margin:34px auto 56px; border-top:1px solid var(--beam-edge); border-bottom:1px solid var(--line); background:linear-gradient(110deg,var(--verified-wash),transparent 38%); }
  .workflow-proposal::before { position:absolute; top:-1px; left:0; width:min(260px,32%); height:1px; background:var(--verified); content:""; }
  .workflow-proposal[hidden] { display:none; }
  .proposal-head { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:clamp(28px,6vw,84px); align-items:end; padding:38px 0 34px; }
  .proposal-topline { display:flex; align-items:center; gap:12px; margin-bottom:12px; }
  .proposal-kicker { margin:0; color:var(--verified); font-size:11px; font-weight:760; letter-spacing:.035em; }
  .proposal-head h3 { max-width:18ch; margin:0; font-size:clamp(30px,4vw,48px); font-weight:760; letter-spacing:-.035em; line-height:1.02; text-wrap:balance; }
  .proposal-reason { max-width:64ch; margin:14px 0 0; color:var(--muted); font-size:14px; line-height:1.6; }
  .proposal-summary { display:flex; flex-wrap:wrap; gap:8px 22px; margin-top:22px; }
  .proposal-metric { display:flex; min-width:0; align-items:baseline; gap:7px; }
  .proposal-metric span { color:var(--dim); font-size:11px; }
  .proposal-metric strong { color:var(--evidence); font-size:12px; font-weight:700; overflow-wrap:anywhere; }
  .proposal-head-actions { display:grid; justify-items:end; gap:12px; min-width:230px; }
  .proposal-head-actions p { max-width:28ch; margin:0; color:var(--dim); font-size:11px; line-height:1.45; text-align:right; }
  .proposal-head-actions .button-row { justify-content:flex-end; }
  .proposal-head-actions .primary { min-width:142px; }
  .proposal-phases { position:relative; display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:clamp(18px,3vw,42px); padding:34px 0 38px; border-top:1px solid var(--line); border-bottom:1px solid var(--line); }
  .proposal-phases::before { position:absolute; top:47px; right:calc(25% - 5px); left:5px; height:1px; background:linear-gradient(90deg,var(--verified),var(--beam-mid) 70%,var(--beam-edge)); content:""; }
  .proposal-phase { position:relative; min-width:0; padding-top:28px; }
  .proposal-phase::before { position:absolute; z-index:1; top:7px; left:0; width:11px; height:11px; border:3px solid var(--bg); border-radius:50%; background:var(--verified); box-shadow:0 0 0 1px var(--beam-mid); content:""; }
  .proposal-phase:last-child::before { background:var(--surface); }
  .proposal-phase small { color:var(--dim); font-size:10px; }
  .proposal-phase strong { display:block; margin-top:6px; font-size:14px; }
  .proposal-phase p { max-width:28ch; margin:7px 0 0; color:var(--muted); font-size:12px; line-height:1.5; }
  .proposal-phase p,.proposal-model-row span { overflow-wrap:anywhere; }
  .proposal-blocker { display:grid; gap:12px; padding:18px 0; border-bottom:1px solid var(--line); }
  .proposal-blocker[hidden] { display:none; }
  .proposal-blocker p { margin:0; color:var(--risk); font-size:12px; }
  .proposal-reference-row { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:10px; max-width:720px; }
  .proposal-reference-row input { min-width:0; }
  .proposal-inspector { border-bottom:1px solid var(--line); }
  .proposal-inspector > summary { min-height:56px; display:flex; align-items:center; justify-content:space-between; padding:0; cursor:pointer; color:var(--evidence); font-size:12px; font-weight:750; }
  .proposal-inspector > summary span { color:var(--dim); font-weight:400; }
  .proposal-inspector-body { display:grid; gap:18px; padding:4px 0 24px; }
  .proposal-models { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px 32px; }
  .proposal-model-row { display:grid; grid-template-columns:120px minmax(0,1fr); gap:12px; color:var(--muted); font-size:12px; }
  .proposal-model-row strong { color:var(--text); }
  .comfy-inspection { display:grid; gap:10px; }
  .comfy-inspection[hidden] { display:none; }
  .comfy-node-list { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; }
  .comfy-node { padding:10px 0; border-bottom:1px solid var(--line); font-size:11px; }
  .comfy-node strong { display:block; }
  .comfy-node span { color:var(--dim); }
  .comfy-json { max-height:280px; margin:0; overflow:auto; }
  .proposal-command { display:grid; grid-template-columns:minmax(180px,.36fr) minmax(0,1fr); gap:32px; align-items:center; padding:24px 0; }
  .proposal-command-copy strong { display:block; font-size:13px; }
  .proposal-command-copy span { display:block; margin-top:4px; color:var(--dim); font-size:11px; line-height:1.45; }
  .proposal-controls { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:10px; }
  .proposal-controls input { min-width:0; }
  .workflow-proposal > .prompt-feedback { padding:0 0 18px; }
  .quick-settings { border-top:1px solid var(--line); background:#0b0f14; }
  .quick-settings > summary { min-height:52px; display:flex; align-items:center; justify-content:space-between; padding:0 22px; color:var(--muted); cursor:pointer; font-weight:650; }
  .quick-settings > summary span { color:var(--dim); font-size:12px; font-weight:400; }
  .quick-settings[open] > summary { color:var(--text); }
  .quick-options { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; padding:0 22px 18px; }
  .quick-options label { min-width:0; }
  .quick-options select { min-height:44px; }
  .quick-model-summary { grid-column:1/-1; margin:0; padding:12px 14px; border:1px solid var(--line); border-radius:10px; background:#0d1117; color:var(--muted); font-size:12px; line-height:1.5; }
  .quick-model-summary strong { color:var(--text); }
  .quick-model-summary.blocked { border-color:rgba(255,107,118,.5); color:var(--risk); }
  .film-contract { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; padding:12px 22px; border-top:1px solid var(--line); background:#0b0f14; }
  .film-contract strong { display:block; font-size:12px; color:var(--text); }
  .film-contract span { display:block; margin-top:3px; color:var(--muted); font-size:11px; overflow-wrap:anywhere; }
  .film-contract .state { flex:0 0 auto; margin-top:1px; }
  .film-help { padding:0 22px 12px; background:#0b0f14; }
  .film-help summary { min-height:36px; display:flex; align-items:center; color:var(--evidence); cursor:pointer; font-size:11px; font-weight:700; }
  .film-help p { max-width:72ch; margin:0 0 8px; color:var(--muted); font-size:12px; }
  .local-workflow-settings { grid-column:1/-1; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; padding-top:4px; }
  .local-workflow-settings[hidden] { display:none; }
  .local-workflow-settings .wide { grid-column:1/-1; }
  .local-recipe-readout { grid-column:1/-1; display:grid; gap:5px; padding:12px 0; border-top:1px solid var(--line); border-bottom:1px solid var(--line); }
  .local-recipe-readout strong { font-size:13px; }
  .local-recipe-readout span { color:var(--muted); font-size:12px; overflow-wrap:anywhere; }
  .episode-actions { grid-column:1/-1; display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; padding-top:4px; }
  .episode-workspace { max-width:920px; margin:0 auto 28px; border-top:1px solid var(--line); border-bottom:1px solid var(--line); }
  .episode-workspace[hidden] { display:none; }
  .episode-workspace-head { display:flex; align-items:end; justify-content:space-between; gap:18px; padding:18px 0; }
  .episode-workspace-head h3 { margin:0; font-size:16px; }
  .episode-workspace-head p { margin:4px 0 0; color:var(--muted); font-size:12px; }
  .episode-workspace-controls { display:flex; align-items:end; justify-content:flex-end; gap:8px; flex-wrap:wrap; }
  .episode-workspace-controls label { min-width:130px; }
  .episode-more { position:relative; }
  .episode-more > summary { list-style:none; }
  .episode-more > summary::-webkit-details-marker { display:none; }
  .episode-more-panel { position:absolute; z-index:3; right:0; top:calc(100% + 6px); width:min(280px,calc(100vw - 32px)); display:grid; gap:8px; padding:12px; border:1px solid var(--line); border-radius:10px; background:var(--surface); box-shadow:0 12px 30px rgba(0,0,0,.28); }
  .episode-shot-list { border-top:1px solid var(--line); }
  .episode-shot { display:grid; grid-template-columns:58px minmax(0,1fr) auto; gap:14px; align-items:center; min-width:0; padding:13px 0; border-bottom:1px solid var(--line); }
  .episode-shot:last-child { border-bottom:0; }
  .episode-shot-list:not(.show-all) .episode-shot:nth-child(n+7) { display:none; }
  .episode-shot-order { color:var(--dim); font-variant-numeric:tabular-nums; }
  .episode-shot-copy { min-width:0; }
  .episode-shot-copy strong { display:block; font-size:13px; }
  .episode-shot-copy p { margin:3px 0 0; color:var(--muted); font-size:12px; overflow-wrap:anywhere; }
  .episode-shot-meta { display:flex; align-items:center; justify-content:flex-end; gap:8px; flex-wrap:wrap; }
  .episode-shot-state { color:var(--muted); font-size:11px; white-space:nowrap; }
  .episode-shot-state.accepted { color:var(--verified); }
  .episode-shot-state.rejected { color:var(--risk); }
  .episode-feedback { min-height:20px; margin:12px 0; }
  .prompt-actions { display:flex; justify-content:space-between; gap:12px; align-items:center; padding:16px 22px 18px; border-top:1px solid var(--line); }
  .prompt-actions .button-row { justify-content:flex-end; }
  .auto-note { color:var(--dim); font-size:12px; }
  .prompt-feedback { margin:0; padding:0 22px 16px; min-height:0; }
  .capability-picker { max-width:920px; margin:0 auto 28px; }
  .capability-picker-head { display:flex; justify-content:space-between; gap:16px; align-items:end; margin-bottom:10px; }
  .capability-picker-head h3 { margin:0; font-size:14px; }
  .capability-picker-head p { margin:3px 0 0; color:var(--dim); font-size:12px; }
  .capability-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:9px; }
  .capability-choice { min-height:104px; display:grid; align-content:space-between; gap:12px; padding:14px; border:1px solid var(--line); border-radius:11px; background:#0d1117; color:var(--text); text-align:left; cursor:pointer; }
  .capability-choice:hover { border-color:#536273; background:#111721; }
  .capability-choice[aria-pressed="true"] { border-color:var(--verified); background:#101b18; }
  .capability-choice strong { display:block; font-size:13px; }
  .capability-choice span { display:block; margin-top:4px; color:var(--muted); font-size:11px; line-height:1.4; }
  .capability-choice small { color:var(--evidence); font-size:10px; letter-spacing:.04em; text-transform:uppercase; }
  .button-row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
  .button {
    min-height:44px;
    border:1px solid var(--line);
    border-radius:10px;
    background:#0d1117;
    color:var(--text);
    padding:8px 13px;
    font-weight:650;
    text-decoration:none;
    cursor:pointer;
  }
  .button:hover { border-color:#5d6b7b; background:#111721; }
  .button.primary { background:var(--verified); border-color:var(--verified); color:#07130c; }
  .button.primary:hover { background:#9ce8b8; }
  .button.danger { color:#ffd3d7; border-color:#6c3940; }
  .button[disabled] { opacity:.48; cursor:not-allowed; }
  .field-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
  .field-grid > label { align-self:start; }
  .brief-group { border-top:1px solid var(--line); padding:12px 0; }
  .brief-group:last-of-type { border-bottom:1px solid var(--line); }
  .brief-group summary { color:var(--text); font-weight:600; cursor:pointer; }
  .brief-group[open] summary { margin-bottom:10px; }
  .directory-row { display:grid; grid-template-columns:minmax(0,.7fr) minmax(0,1fr) auto; gap:8px; align-items:end; grid-column:1/-1; }
  .cast-list { grid-column:1/-1; display:grid; gap:7px; }
  .cast-card { display:grid; gap:10px; padding:11px; border:1px solid var(--line); border-radius:9px; background:#0d1117; color:var(--muted); font-size:12px; }
  .cast-card-head { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
  .cast-card-head strong { color:var(--text); }
  .cast-status { display:flex; flex-wrap:wrap; gap:6px; margin-top:4px; }
  .cast-status span { padding:3px 6px; border:1px solid var(--line); border-radius:999px; color:var(--dim); font-size:10px; }
  .cast-status .ready { color:var(--verified); border-color:rgba(94,211,142,.38); }
  .cast-status .blocked { color:var(--risk); border-color:rgba(255,107,118,.42); }
  .cast-fields { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
  .conditional-fields[hidden] { display:none; }
  label { display:grid; gap:5px; color:var(--muted); font-size:12px; }
  label.wide { grid-column:1/-1; }
  input, textarea, select {
    width:100%;
    min-height:42px;
    background:#0d1117;
    border:1px solid #303946;
    color:var(--text);
    border-radius:10px;
    padding:10px 11px;
  }
  input:hover, textarea:hover, select:hover { border-color:#465363; }
  input:focus, textarea:focus, select:focus { border-color:var(--focus); }
  textarea { min-height:86px; resize:vertical; }
  .checkline { display:flex; min-height:44px; grid-column:1/-1; align-items:center; gap:9px; color:var(--muted); font-size:13px; }
  .checkline input { width:auto; margin-top:3px; }
  .brief-actions { display:flex; justify-content:space-between; gap:12px; align-items:center; margin-top:16px; padding-top:14px; border-top:1px solid var(--line); }
  .brief-state { color:var(--muted); font-size:12px; }
  .workflow-list { display:grid; }
  .workflow {
    display:grid;
    min-height:56px;
    grid-template-columns:minmax(0,1fr) auto;
    gap:12px;
    align-items:center;
    width:100%;
    text-align:left;
    padding:13px 16px;
    border:0;
    border-bottom:1px solid var(--line);
    background:transparent;
    color:var(--text);
    cursor:pointer;
  }
  .workflow:last-child { border-bottom:0; }
  .workflow:hover { background:var(--raised); }
  .workflow.active { background:#111a19; }
  .workflow strong { display:block; font-size:13px; }
  .workflow span { display:block; color:var(--muted); font-size:12px; margin-top:2px; }
  .planner { margin-bottom:22px; }
  .planner-head { display:flex; justify-content:space-between; align-items:center; gap:16px; }
  .planner-head p { max-width:68ch; }
  .planner-body { display:grid; grid-template-columns:minmax(260px,.7fr) minmax(380px,1.3fr); }
  .planner-step { min-width:0; padding:20px; border-bottom:1px solid var(--line); }
  .planner-step:nth-child(odd) { border-right:1px solid var(--line); }
  #planner-step-recipe,#planner-step-options { grid-column:1/-1; border-right:0; }
  .planner-step.is-locked { opacity:.54; }
  .planner-step.is-locked > :not(.step-heading) { pointer-events:none; }
  .step-heading { display:flex; align-items:flex-start; gap:11px; margin-bottom:15px; }
  .step-heading h3 { margin:0; font-size:14px; }
  .step-heading p { margin:3px 0 0; color:var(--muted); font-size:12px; }
  .step-number { display:grid; place-items:center; width:26px; height:26px; flex:0 0 auto; border:1px solid #465363; border-radius:50%; color:var(--evidence); font-size:12px; font-weight:800; }
  .choice-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:8px; }
  .choice-card { min-height:86px; display:grid; align-content:start; gap:4px; width:100%; padding:12px; border:1px solid var(--line); border-radius:10px; background:#0d1117; color:var(--text); text-align:left; cursor:pointer; }
  .choice-card:hover { border-color:#536273; background:#111721; }
  .choice-card[aria-pressed="true"] { border-color:var(--verified); background:#101b18; box-shadow:inset 0 0 0 1px rgba(130,217,167,.2); }
  .choice-card strong { font-size:13px; }
  .choice-card span { color:var(--muted); font-size:11px; }
  .choice-card .mini-state { color:var(--dim); }
  .inline-create { margin-top:12px; border-top:1px solid var(--line); }
  .inline-create summary,.evidence-options summary { min-height:44px; display:flex; align-items:center; color:var(--evidence); cursor:pointer; font-size:12px; font-weight:650; }
  .inline-create form { padding-top:8px; }
  .recipe-group + .recipe-group { margin-top:18px; }
  .recipe-group h4 { margin:0 0 8px; color:var(--dim); font-size:11px; letter-spacing:.07em; text-transform:uppercase; }
  .recipe-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:9px; }
  .recipe-card { min-height:170px; display:flex; flex-direction:column; gap:8px; width:100%; padding:14px; border:1px solid var(--line); border-radius:11px; background:#0d1117; color:var(--text); text-align:left; cursor:pointer; }
  .recipe-card:hover { border-color:#536273; background:#111721; }
  .recipe-card[aria-pressed="true"] { border-color:var(--verified); background:#101b18; box-shadow:inset 0 0 0 1px rgba(130,217,167,.2); }
  .recipe-card-head { display:flex; justify-content:space-between; gap:9px; align-items:flex-start; }
  .recipe-card strong { font-size:13px; }
  .recipe-card p { margin:0; color:var(--muted); font-size:12px; }
  .recipe-meta { display:flex; gap:5px; flex-wrap:wrap; margin-top:auto; }
  .recipe-meta span { padding:2px 6px; border:1px solid var(--line); border-radius:999px; color:var(--dim); font-size:10px; }
  .recipe-blocker { color:var(--warning)!important; }
  .recommended-recipes > h4,.all-recipes > summary { margin:0 0 8px; color:var(--dim); font-size:11px; letter-spacing:.07em; text-transform:uppercase; }
  .all-recipes { margin-top:14px; border-top:1px solid var(--line); }
  .all-recipes > summary { min-height:44px; display:flex; align-items:center; margin:0; color:var(--evidence); cursor:pointer; font-weight:700; }
  .all-recipes[open] > summary { margin-bottom:10px; }
  .recipe-option-fields { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
  .evidence-options { border-top:1px solid var(--line); }
  .evidence-options .field-grid { padding-top:8px; }
  .planner-terminal { display:grid; grid-template-columns:minmax(220px,1fr) auto; gap:12px 20px; align-items:center; padding:16px 20px; background:#0b0f14; }
  .planner-terminal strong { font-size:13px; }
  .planner-terminal p { margin:3px 0 0; color:var(--muted); font-size:12px; }
  .planner-terminal .feedback { grid-column:1/-1; margin:0; min-height:0; }
  .planner-terminal .button[hidden] { display:none; }
  .advanced-studio { margin-top:16px; }
  .advanced-studio > summary { min-height:52px; display:flex; align-items:center; color:var(--evidence); border:1px solid var(--line); border-radius:var(--radius); padding:0 16px; cursor:pointer; font-weight:700; }
  .advanced-studio[open] > summary { border-radius:var(--radius) var(--radius) 0 0; background:var(--surface); }
  .advanced-studio > p { margin:0; padding:12px 16px; border-inline:1px solid var(--line); color:var(--muted); }
  .advanced-studio .create-grid { padding-top:16px; }
  .manual-planner { max-width:920px; margin:0 auto; }
  .manual-planner > summary { min-height:44px; padding:10px 16px; color:var(--muted); border-color:transparent; justify-content:center; font-size:12px; font-weight:600; }
  .manual-planner[open] > summary { border-color:var(--line); }
  .manual-planner .planner { margin:16px 0 0; }
  .state {
    display:inline-flex;
    align-items:center;
    gap:6px;
    border:1px solid var(--line);
    border-radius:999px;
    padding:3px 8px;
    color:var(--muted);
    font-size:11px;
    white-space:nowrap;
  }
  .state::before { content:""; width:6px; height:6px; border-radius:50%; background:var(--dim); }
  .state.ready::before, .state.scheduled::before, .state.distributed::before { background:var(--verified); }
  .state.blocked::before, .state.failed::before { background:var(--risk); }
  .state.needs-input::before, .state.needs-review::before { background:var(--warning); }
  .feedback { min-height:20px; margin-top:10px; color:var(--muted); font-size:13px; }
  .feedback.error { color:var(--risk); }
  .feedback.success { color:var(--verified); }
  .lane-console { margin-bottom:24px; border-block:1px solid var(--line); background:#0b0e13; }
  .lane-console-head { display:flex; align-items:flex-start; justify-content:space-between; gap:18px; padding:16px 0 14px; }
  .lane-console-head h3 { margin:0; font-size:15px; }
  .lane-console-head p { margin:4px 0 0; color:var(--muted); font-size:12px; }
  .lane-switcher { display:flex; gap:5px; flex-wrap:wrap; }
  .lane-switcher button { min-width:44px; min-height:44px; border:1px solid transparent; border-radius:8px; padding:7px 10px; background:transparent; color:var(--muted); cursor:pointer; }
  .lane-switcher button:hover { color:var(--text); background:var(--surface); }
  .lane-switcher button[aria-pressed="true"] { color:var(--text); border-color:var(--line); background:var(--raised); }
  .lane-ledger { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); border-top:1px solid var(--line); }
  .lane-ledger > div { min-width:0; padding:14px 16px 16px 0; }
  .lane-ledger > div + div { padding-left:16px; border-left:1px solid var(--line); }
  .lane-ledger strong { display:flex; align-items:baseline; justify-content:space-between; gap:10px; font-size:13px; }
  .lane-ledger strong span { color:var(--evidence); font-size:18px; font-variant-numeric:tabular-nums; }
  .lane-ledger p { margin:4px 0 0; color:var(--dim); font-size:11px; }
  .automation-note { padding:12px 0; border-top:1px solid var(--line); color:var(--muted); font-size:12px; }
  .automation-note summary { min-height:40px; display:flex; align-items:center; color:var(--warning); cursor:pointer; font-weight:650; }
  .automation-note ul { margin:4px 0 8px; padding-left:20px; }
  .automation-note li + li { margin-top:7px; }
  .production-list { display:grid; gap:32px; }
  .production-toolbar { display:flex; align-items:end; justify-content:flex-end; gap:8px; flex-wrap:wrap; }
  .production-toolbar label { min-width:min(260px,100%); }
  .editorial-decision { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:14px; align-items:center; margin-top:16px; padding:14px; border-block:1px solid var(--line); background:#0b0f14; }
  .editorial-decision strong { display:block; font-size:13px; }
  .editorial-decision p { margin:4px 0 0; color:var(--muted); font-size:12px; }
  .editorial-history { color:var(--dim); font-size:11px; }
  .video-section-head {
    display:flex;
    align-items:flex-end;
    justify-content:space-between;
    gap:18px;
    margin-bottom:12px;
  }
  .video-section-head h3 { margin:0; font-size:16px; letter-spacing:-.015em; }
  .video-section-head p { margin:4px 0 0; color:var(--muted); font-size:12px; }
  .video-section-head span { color:var(--dim); font-size:12px; white-space:nowrap; }
  .ready-productions { border-top:1px solid var(--line); }
  .video-library-index { border-top:1px solid var(--line); }
  .video-library-row {
    display:grid;
    grid-template-columns:minmax(0,1fr) auto;
    gap:20px;
    align-items:center;
    min-height:72px;
    padding:12px 0;
    border-bottom:1px solid var(--line);
  }
  .video-library-row[aria-current="true"] { background:#0b100f; }
  .video-library-row h4 { margin:0; font-size:14px; }
  .video-library-row p { margin:3px 0 0; color:var(--dim); font-size:11px; }
  .video-library-row-meta { display:flex; align-items:center; justify-content:flex-end; gap:8px; flex-wrap:wrap; }
  .production {
    display:grid;
    grid-template-columns:minmax(0,1.35fr) minmax(220px,.65fr);
    gap:22px;
    padding:20px 0;
    border-bottom:1px solid var(--line);
  }
  .production.featured {
    grid-template-columns:minmax(300px,.72fr) minmax(360px,1.28fr);
    gap:clamp(24px,4vw,56px);
    padding:28px 0 32px;
  }
  .production.featured h3 { font-size:clamp(22px,2.6vw,36px); line-height:1.08; letter-spacing:-.03em; }
  .production-info { min-width:0; align-self:center; }
  .production-media { min-width:0; display:grid; place-items:center; }
  .production h3 { margin:0 0 5px; font-size:16px; }
  .production p { margin:4px 0; color:var(--muted); }
  .production-meta { display:flex; gap:8px; flex-wrap:wrap; margin-top:10px; }
  .production-evidence {
    display:grid;
    grid-template-columns:repeat(2,minmax(0,1fr));
    gap:8px 14px;
    margin:14px 0 0;
    padding:12px;
    border:1px solid var(--line);
    border-radius:10px;
    background:#0d1117;
  }
  .production-evidence div { min-width:0; }
  .production-evidence dt { color:var(--dim); font-size:10px; letter-spacing:.06em; text-transform:uppercase; }
  .production-evidence dd { margin:3px 0 0; color:var(--muted); overflow-wrap:anywhere; }
  .automation-evidence { grid-template-columns:repeat(3,minmax(0,1fr)); }
  .automation-evidence .recovery { grid-column:1/-1; padding-top:8px; border-top:1px solid var(--line); }
  .automation-evidence .recovery dd { color:var(--evidence); }
  .production video { display:block; width:100%; max-height:360px; background:#000; border-radius:12px; }
  .production.featured video { width:auto; max-width:100%; max-height:580px; box-shadow:0 22px 54px rgba(0,0,0,.34); }
  .production iframe,.production-media > img { width:100%; min-height:360px; max-height:520px; border:0; border-radius:10px; background:#090c11; object-fit:contain; }
  .production.featured iframe,.production.featured .production-media > img { min-height:480px; }
  .production.platform-audio-production { grid-template-columns:minmax(280px,.7fr) minmax(0,1.3fr); }
  .platform-audio-production > div:first-child { align-self:start; }
  .platform-audio-setup { margin-top:14px; padding-top:12px; border-top:1px solid var(--line); }
  .platform-audio-setup summary { min-height:44px; display:flex; align-items:center; color:var(--evidence); cursor:pointer; font-weight:600; }
  .platform-audio-form { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; padding:8px 0 4px; }
  .platform-audio-form label { color:var(--muted); font-size:12px; }
  .platform-audio-form .wide { grid-column:1/-1; }
  .soundtrack-preset-note { margin:0; color:var(--dim); font-size:12px; }
  .soundtrack-custom { grid-column:1/-1; padding:0 0 2px; }
  .soundtrack-custom > summary { min-height:44px; display:flex; align-items:center; color:var(--muted); cursor:pointer; font-size:12px; }
  .soundtrack-custom[open] > summary { color:var(--text); }
  .soundtrack-custom-fields { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; padding:4px 0 8px; }
  .soundtrack-now { grid-column:1/-1; display:flex; align-items:baseline; justify-content:space-between; gap:16px; padding-bottom:12px; border-bottom:1px solid var(--line); }
  .soundtrack-now span { color:var(--dim); font-size:11px; }
  .soundtrack-now strong { color:var(--text); text-align:right; }
  .platform-audio-review { display:grid; gap:12px; }
  .sync-stage { display:grid; grid-template-columns:minmax(220px,.7fr) minmax(320px,1.3fr); grid-template-areas:"visual controls" "visual guidance" "visual source" "visual proof" "visual handoff"; column-gap:18px; row-gap:12px; align-items:start; }
  .sync-visual { grid-area:visual; }
  .sync-controls { grid-area:controls; }
  .sync-guidance { grid-area:guidance; }
  .sync-source { grid-area:source; }
  .silent-proof { grid-area:proof; }
  .platform-handoff { grid-area:handoff; }
  .sync-source,.sync-visual { min-width:0; }
  .sync-source span,.sync-visual span { display:block; margin-bottom:6px; color:var(--dim); font-size:11px; letter-spacing:.05em; text-transform:uppercase; }
  .youtube-player { width:100%; aspect-ratio:16/9; background:#07090d; border-radius:10px; overflow:hidden; }
  .youtube-player iframe { width:100%; height:100%; border:0; }
  .spotify-player iframe { display:block; width:100%; border:0; border-radius:10px; }
  .sync-visual video { display:block; width:100%; max-height:480px; aspect-ratio:9/16; object-fit:contain; border-radius:10px; }
  .sync-controls { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
  .sync-status { flex:1 1 220px; min-height:20px; color:var(--muted); font-size:13px; }
  .sync-guidance { margin:-4px 0 0; color:var(--dim); font-size:12px; }
  .silent-proof { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; padding:10px 0; border-top:1px solid var(--line); border-bottom:1px solid var(--line); }
  .silent-proof span { color:var(--dim); font-size:11px; letter-spacing:.04em; text-transform:uppercase; }
  .silent-proof strong { display:block; margin-top:3px; color:var(--muted); font-size:13px; font-weight:600; overflow-wrap:anywhere; }
  .silent-proof a { color:var(--evidence); text-underline-offset:3px; }
  .platform-handoff { margin:0; color:var(--muted); font-size:13px; line-height:1.5; }
  .legacy-productions { margin-top:18px; border-top:1px solid var(--line); }
  .legacy-productions > summary { display:flex; align-items:center; min-height:52px; color:var(--muted); cursor:pointer; font-weight:600; }
  .legacy-productions[open] > summary { border-bottom:1px solid var(--line); }
  .legacy-productions .production:last-child { border-bottom:0; }
  .pending-productions { border-top:1px solid var(--line); border-bottom:1px solid var(--line); }
  .pending-productions > summary {
    min-height:68px;
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:18px;
    color:var(--text);
    cursor:pointer;
    font-weight:700;
  }
  .pending-productions > summary span { color:var(--dim); font-size:12px; font-weight:400; }
  .pending-productions[open] > summary { border-bottom:1px solid var(--line); }
  .production-plan {
    display:grid;
    grid-template-columns:minmax(0,1fr) auto;
    gap:18px;
    align-items:center;
    padding:16px 0;
    border-bottom:1px solid var(--line);
  }
  .production-plan:last-child { border-bottom:0; }
  .production-plan h3 { margin:0; font-size:14px; }
  .production-plan p { margin:4px 0 0; max-width:78ch; color:var(--muted); font-size:12px; }
  .production-plan .production-meta { margin-top:8px; }
  .production-plan-actions { display:flex; align-items:center; justify-content:flex-end; gap:8px; flex-wrap:wrap; }
  .empty-state { border:1px dashed #374352; border-radius:var(--radius); padding:28px; color:var(--muted); }
  .distribution-grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(300px,.72fr); gap:20px; }
  .evidence-list { list-style:none; padding:0; margin:0; }
  .evidence-list li { display:flex; align-items:flex-start; gap:9px; padding:9px 0; border-bottom:1px solid var(--line); }
  .evidence-list li:last-child { border-bottom:0; }
  .evidence-list .mark { color:var(--risk); width:18px; }
  .evidence-list li.pass .mark { color:var(--verified); }
  .evidence-list > .evidence-group { display:block; padding:0; border:0; }
  .evidence-group + .evidence-group { margin-top:14px; }
  .evidence-group h4 { margin:0; color:var(--dim); font-size:11px; letter-spacing:.06em; text-transform:uppercase; }
  .evidence-group > .evidence-list { margin-top:5px; }
  .evidence-fix { margin-left:auto; white-space:nowrap; }
  .boundary { border:1px solid #514927; background:#18170f; color:#e7dca9; padding:12px 14px; border-radius:10px; margin-top:14px; }
  .schedule-form { display:grid; gap:12px; }
  .schedule-status { min-height:20px; color:var(--evidence); font-size:13px; }
  .tools-layout { display:grid; grid-template-columns:240px minmax(0,1fr); border:1px solid var(--line); border-radius:var(--radius); overflow:hidden; min-height:620px; }
  .tool-nav { border-right:1px solid var(--line); background:#0b0e13; padding:10px; }
  .tool-nav button { display:block; min-height:44px; width:100%; text-align:left; border:0; background:transparent; color:var(--muted); padding:8px 10px; border-radius:7px; cursor:pointer; }
  .tool-nav button:hover { color:var(--text); background:var(--surface); }
  .tool-nav button.active { color:var(--text); background:#111a19; }
  .tool-panel { display:none; padding:22px; }
  .tool-panel.active { display:block; }
  .tool-panel h3 { margin:0; font-size:17px; }
  .hint { color:var(--muted); margin:4px 0 16px; }
  .tool-panel form { display:grid; gap:11px; max-width:680px; }
  .result { margin-top:16px; }
  .result pre { background:#090c11; border:1px solid var(--line); border-radius:10px; padding:12px; overflow:auto; white-space:pre-wrap; word-break:break-word; }
  .result .meta { display:flex; gap:10px; align-items:center; margin-bottom:6px; font-size:12px; color:var(--dim); }
  .copy { min-height:44px; border:1px solid var(--line); background:transparent; color:var(--muted); border-radius:7px; padding:7px 10px; cursor:pointer; }
  .copy:hover { color:var(--text); border-color:#46515e; }
  table { border-collapse:collapse; width:100%; margin-top:10px; font-size:13px; }
  th, td { text-align:left; border-bottom:1px solid var(--line); padding:8px; vertical-align:top; }
  th { color:var(--muted); font-weight:600; }
  .loading-line { height:48px; border-bottom:1px solid var(--line); background:linear-gradient(90deg,var(--surface),var(--raised),var(--surface)); background-size:220% 100%; animation:loading 1.2s linear infinite; }
  @keyframes loading { to { background-position:-220% 0; } }
  .archive-head { max-width:1080px; margin:0 auto 34px; }
  .archive-head h2 { max-width:15ch; font-size:clamp(34px,5vw,64px); line-height:.98; letter-spacing:-.038em; text-wrap:balance; }
  .archive-head p { max-width:58ch; margin-top:12px; font-size:15px; line-height:1.6; }
  .archive-head > div { display:flex; flex-wrap:wrap; gap:8px 22px; margin-top:22px; color:var(--muted); font-size:11px; }
  .archive-head > div span { position:relative; }
  .archive-head > div span + span::before { position:absolute; left:-12px; color:var(--verified); content:'·'; }
  .history-showcase { position:relative; max-width:1080px; margin:0 auto; display:grid; grid-template-columns:minmax(280px,.58fr) minmax(0,1fr); min-height:650px; border-block:1px solid var(--line); background:linear-gradient(112deg,var(--verified-wash),transparent 42%); }
  .history-showcase::before { position:absolute; z-index:1; top:-1px; left:0; width:38%; height:1px; background:var(--verified); content:""; }
  .history-picture { position:relative; min-width:0; display:grid; align-items:center; padding:30px clamp(24px,4vw,50px) 30px 0; }
  .history-picture video { display:block; width:100%; max-height:590px; aspect-ratio:9/16; object-fit:contain; background:#000; box-shadow:18px 24px 54px rgba(0,0,0,.38); }
  .history-picture-empty { min-height:520px; display:grid; place-items:center; padding:30px; border:1px solid var(--line); color:var(--muted); text-align:center; }
  .history-video-label { position:absolute; z-index:2; top:44px; left:12px; padding:5px 7px; background:var(--text); color:var(--bg); font-size:10px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; }
  .history-story { min-width:0; align-self:center; padding:48px 0 44px clamp(4px,2vw,24px); }
  .history-story-topline { display:flex; align-items:center; gap:12px; margin-bottom:18px; color:var(--verified); font-size:11px; font-weight:750; }
  .history-story h3 { max-width:15ch; margin:0; font-size:clamp(32px,4.6vw,58px); line-height:1; letter-spacing:-.038em; text-wrap:balance; }
  .history-section { display:grid; grid-template-columns:96px minmax(0,1fr); gap:20px; padding:22px 0; border-bottom:1px solid var(--line); }
  .history-section:first-of-type { margin-top:24px; border-top:1px solid var(--line); }
  .history-section > strong { color:var(--dim); font-size:11px; font-weight:650; }
  .history-prompt { margin:0; color:var(--evidence); font-size:clamp(15px,1.65vw,19px); line-height:1.55; }
  .history-workflow-meta { display:flex; flex-wrap:wrap; gap:7px 18px; color:var(--muted); font-size:12px; }
  .history-workflow-meta strong { color:var(--text); }
  .history-route { position:relative; display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:16px; margin-top:20px; }
  .history-route::before { position:absolute; top:5px; right:calc(25% - 4px); left:4px; height:1px; background:linear-gradient(90deg,var(--verified),var(--beam-mid),var(--beam-edge)); content:""; }
  .history-route div { position:relative; min-width:0; padding-top:18px; color:var(--dim); font-size:10px; }
  .history-route div::before { position:absolute; z-index:1; top:0; left:0; width:9px; height:9px; border:2px solid var(--bg); border-radius:50%; background:var(--verified); box-shadow:0 0 0 1px var(--beam-mid); content:""; }
  .history-route div:last-child::before { background:var(--surface); }
  .history-route strong { display:block; margin-top:4px; color:var(--text); font-size:11px; line-height:1.35; }
  .history-actions { display:flex; flex-wrap:wrap; gap:8px; padding-top:24px; }
  .history-filmstrip { max-width:1080px; margin:0 auto 46px; display:flex; overflow-x:auto; border-bottom:1px solid var(--line); }
  .history-filmstrip button { position:relative; flex:1 0 154px; min-width:0; min-height:96px; padding:18px 14px 16px; border:0; border-right:1px solid var(--line); background:transparent; color:var(--muted); text-align:left; cursor:pointer; }
  .history-filmstrip button:last-child { border-right:0; }
  .history-filmstrip button:hover { background:var(--verified-wash); color:var(--text); }
  .history-filmstrip button[aria-current="true"] { background:#0b100f; color:var(--text); }
  .history-filmstrip button[aria-current="true"]::before { position:absolute; top:-1px; right:0; left:0; height:1px; background:var(--verified); content:""; }
  .history-filmstrip span { display:block; color:var(--dim); font-size:10px; }
  .history-filmstrip strong { display:block; margin-top:9px; font-size:12px; line-height:1.35; }
  .history-ledger { max-width:1080px; margin:0 auto; border-top:1px solid var(--line); }
  .history-ledger > summary,.history-operations > summary { min-height:62px; display:flex; align-items:center; justify-content:space-between; gap:18px; cursor:pointer; color:var(--text); font-size:13px; font-weight:720; }
  .history-ledger > summary span,.history-operations > summary span { color:var(--dim); font-size:11px; font-weight:400; }
  .history-ledger-row { display:grid; grid-template-columns:140px minmax(0,1fr) auto; gap:24px; align-items:center; padding:16px 0; border-top:1px solid var(--line); }
  .history-ledger-row time { color:var(--dim); font-size:11px; }
  .history-ledger-row h4 { margin:0; font-size:14px; }
  .history-ledger-row p { margin:4px 0 0; color:var(--muted); font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .history-operations { max-width:1080px; margin:24px auto 0; border-top:1px solid var(--line); }
  .history-operations .lane-console { margin-top:0; }
  .library-layout { max-width:1080px; margin:0 auto; display:grid; grid-template-columns:260px minmax(0,1fr); border-block:1px solid var(--line); }
  .library-index { min-width:0; border-right:1px solid var(--line); }
  .library-index button { width:100%; min-height:58px; display:grid; gap:3px; padding:11px 18px 11px 0; border:0; border-bottom:1px solid var(--line); background:transparent; color:var(--muted); text-align:left; cursor:pointer; }
  .library-index button:last-child { border-bottom:0; }
  .library-index button:hover { color:var(--text); }
  .library-index button[aria-current="true"] { color:var(--text); background:linear-gradient(90deg,var(--verified-wash),transparent); }
  .library-index strong { font-size:13px; }
  .library-index span { color:var(--dim); font-size:10px; }
  .library-detail { position:relative; min-width:0; padding:clamp(30px,5vw,64px); }
  .library-detail::before { position:absolute; top:-1px; left:0; width:min(220px,32%); height:1px; background:var(--verified); content:""; }
  .library-kicker { margin:0 0 14px; color:var(--verified); font-size:11px; font-weight:760; }
  .library-detail h3 { max-width:16ch; margin:0; font-size:clamp(34px,4.6vw,58px); line-height:1; letter-spacing:-.038em; text-wrap:balance; }
  .library-description { max-width:62ch; margin:18px 0 0; color:var(--muted); font-size:15px; line-height:1.65; }
  .library-facts { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); margin:34px 0 0; border-block:1px solid var(--line); }
  .library-fact { min-width:0; padding:18px 18px 18px 0; }
  .library-fact + .library-fact { padding-left:18px; border-left:1px solid var(--line); }
  .library-fact span { display:block; color:var(--dim); font-size:10px; }
  .library-fact strong { display:block; margin-top:6px; font-size:13px; overflow-wrap:anywhere; }
  .library-controls { margin-top:28px; }
  .library-controls h4 { margin:0 0 10px; font-size:12px; }
  .library-control-list { display:flex; flex-wrap:wrap; gap:7px; }
  .library-control-list span { padding:6px 9px; border:1px solid var(--line); color:var(--muted); font-size:11px; }
  .library-route { margin-top:32px; }
  .library-route h4 { margin:0 0 14px; font-size:12px; }
  .library-note { max-width:70ch; margin:28px 0 0; color:var(--dim); font-size:11px; line-height:1.55; }
  .library-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:30px; }
  @media (prefers-reduced-motion:reduce) { *,*::before,*::after { animation:none!important; transition:none!important; } }
  @media (max-width:900px) {
    .history-showcase { grid-template-columns:minmax(240px,.6fr) minmax(0,1fr); }
    .history-picture { padding-right:24px; }
    .history-story { padding-left:8px; }
    .history-section { grid-template-columns:76px minmax(0,1fr); gap:14px; }
    .library-layout { grid-template-columns:210px minmax(0,1fr); }
    .library-detail { padding:34px; }
    .quick-options { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .capability-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .create-grid,.distribution-grid { grid-template-columns:1fr; }
    .production,.production.featured { grid-template-columns:1fr; }
    .production.featured { gap:20px; }
    .production.platform-audio-production { grid-template-columns:1fr; }
    .production-plan { grid-template-columns:1fr; }
    .production-plan-actions { justify-content:flex-start; }
    .video-library-row { grid-template-columns:1fr; gap:10px; padding:14px 0; }
    .video-library-row-meta { justify-content:flex-start; }
    .tools-layout { grid-template-columns:1fr; grid-template-rows:auto minmax(0,1fr); }
    .tool-nav { display:flex; align-items:center; gap:4px; overflow-x:auto; border-right:0; border-bottom:1px solid var(--line); }
    .tool-nav button { flex:0 0 auto; width:auto; white-space:nowrap; }
    .planner-body { grid-template-columns:1fr; }
    .planner-step,#planner-step-recipe,#planner-step-options { grid-column:auto; border-right:0; }
    .recipe-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .planner-terminal { grid-template-columns:1fr; }
    .lane-console-head { align-items:stretch; flex-direction:column; }
    .automation-evidence { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .editorial-decision { grid-template-columns:1fr; }
  }
  @media (max-width:600px) {
    .archive-head { padding:28px 0 22px; }
    .archive-head h2 { max-width:11ch; font-size:clamp(38px,13vw,54px); }
    .archive-head > div { gap:6px 17px; }
    .archive-head > div span + span::before { left:-10px; }
    .history-showcase { grid-template-columns:1fr; }
    .history-picture { padding:24px 0 0; }
    .history-picture video { width:auto; max-width:100%; height:min(62vh,560px); margin:0 auto; }
    .history-story { padding:32px 0 8px; }
    .history-story h3 { font-size:35px; }
    .history-section { grid-template-columns:1fr; gap:7px; }
    .history-route { grid-template-columns:1fr; gap:10px; }
    .history-route-step { min-height:0; padding:13px 0 13px 22px; }
    .history-route-step::before { top:19px; left:0; }
    .history-filmstrip button { flex:0 0 158px; border-bottom:1px solid var(--line); }
    .history-ledger-row { grid-template-columns:1fr; gap:7px; }
    .history-ledger-row .button-row { justify-content:flex-start; }
    .library-layout { grid-template-columns:1fr; }
    .library-index { display:flex; overflow-x:auto; border-right:0; border-bottom:1px solid var(--line); }
    .library-index button { flex:0 0 180px; padding:12px 16px 12px 0; border-right:1px solid var(--line); border-bottom:0; }
    .library-detail { padding:30px 0; }
    .library-detail h3 { font-size:40px; }
    .library-facts { grid-template-columns:1fr; }
    .library-fact,.library-fact + .library-fact { padding:14px 0; border-left:0; border-top:1px solid var(--line); }
    .library-fact:first-child { border-top:0; }
    .product-bar { align-items:flex-start; padding:12px 16px; }
    .brand-lockup p { display:none; }
    .utility-links { gap:10px; justify-content:flex-end; }
    .utility-links { display:none; }
    .utility-links a { font-size:12px; }
    .primary-nav { padding:8px 10px; }
    .primary-nav button { padding:8px 9px; }
    .shell { padding:18px 16px 28px; }
    .view-head { align-items:flex-start; flex-direction:column; gap:6px; }
    .production-toolbar { width:100%; justify-content:stretch; }
    .production-toolbar label { flex:1; }
    .view-head h2 { font-size:21px; }
    .prompt-studio { margin:20px 0; }
    .prompt-studio textarea { min-height:150px; font-size:16px; }
    .quick-options { grid-template-columns:1fr; }
    .workflow-proposal { margin-top:22px; }
    .proposal-head { grid-template-columns:1fr; gap:24px; padding:28px 0; }
    .proposal-head h3 { max-width:12ch; font-size:34px; }
    .proposal-head-actions { justify-items:stretch; min-width:0; }
    .proposal-head-actions p { max-width:none; text-align:left; }
    .proposal-head-actions .button-row { display:grid; grid-template-columns:1fr 1.35fr; }
    .proposal-summary { display:grid; grid-template-columns:1fr 1fr; gap:8px 18px; }
    .proposal-phases { grid-template-columns:1fr; gap:24px; padding:28px 0; }
    .proposal-phases::before { top:39px; bottom:40px; left:5px; width:1px; height:auto; background:linear-gradient(180deg,var(--verified),var(--beam-mid) 70%,var(--beam-edge)); }
    .proposal-phase { padding:0 0 0 32px; }
    .proposal-phase::before { top:4px; left:0; }
    .proposal-command { grid-template-columns:1fr; gap:14px; }
    .proposal-reference-row,.proposal-controls { grid-template-columns:1fr; }
    .proposal-models { grid-template-columns:1fr; }
    .proposal-model-row { grid-template-columns:1fr; gap:3px; }
    .comfy-node-list { grid-template-columns:1fr; }
    .local-workflow-settings { grid-template-columns:1fr; }
    .local-workflow-settings .wide { grid-column:auto; }
    .episode-workspace-head { align-items:stretch; flex-direction:column; }
    .episode-workspace-controls { justify-content:flex-start; }
    .episode-more-panel { left:0; right:auto; }
    .episode-shot { grid-template-columns:42px minmax(0,1fr); }
    .episode-shot-meta { grid-column:2; justify-content:flex-start; }
    .capability-grid { grid-template-columns:1fr; }
    .prompt-actions { align-items:stretch; flex-direction:column; }
    .film-contract { align-items:flex-start; flex-direction:column; }
    .prompt-actions .button-row { justify-content:stretch; }
    .field-grid { grid-template-columns:1fr; }
    .directory-row,.cast-fields { grid-template-columns:1fr; }
    label.wide,.checkline { grid-column:auto; }
    .brief-actions { align-items:flex-start; flex-direction:column; }
    .button-row { width:100%; }
    .button-row .button { flex:1; min-width:0; text-align:center; white-space:normal; }
    .workflow { grid-template-columns:1fr; }
    .platform-audio-form,.soundtrack-custom-fields,.sync-stage,.silent-proof { grid-template-columns:1fr; }
    .soundtrack-now { align-items:flex-start; flex-direction:column; gap:3px; }
    .soundtrack-now strong { text-align:left; }
    .sync-stage { grid-template-areas:none; }
    .sync-controls,.sync-guidance,.sync-source,.sync-visual,.silent-proof,.platform-handoff { grid-area:auto; }
    .state { justify-self:start; }
    .stage-body,.tool-panel { padding:15px; }
    .message { max-width:94%; }
    .planner-head { align-items:flex-start; }
    .planner-body { display:block; }
    .planner-step { padding:16px 14px; }
    .choice-grid,.recipe-grid,.recipe-option-fields { grid-template-columns:1fr; }
    .recipe-card { min-height:0; }
    .planner-terminal { padding:14px; }
    .lane-ledger { display:none; }
    .lane-switcher { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); }
    .lane-switcher button { width:100%; }
    .lane-switcher button::after { content:" · " attr(data-count); color:var(--dim); }
    .video-section-head { align-items:flex-start; flex-direction:column; gap:4px; }
    .pending-productions > summary { align-items:flex-start; flex-direction:column; justify-content:center; gap:2px; }
    .automation-evidence { grid-template-columns:1fr; }
    table { display:block; overflow-x:auto; }
  }

</style>
</head>
<body>
<a class="skip-link" href="#workspace">Skip to workspace</a>
<header class="product-bar">
  <div class="brand-lockup">
    <span class="brand-mark" aria-hidden="true"></span>
    <div>
      <h1>Video Maker</h1>
      <p>Describe it. We’ll make it.</p>
    </div>
  </div>
  <nav class="utility-links" aria-label="Products">
    <a href="/studio" aria-current="page">Video Maker</a>
  </nav>
</header>
<nav class="primary-nav" id="content-nav" aria-label="Video Maker">
  <div role="tablist" aria-label="Video Maker views">
    <button id="tab-create" type="button" role="tab" aria-selected="true" aria-controls="view-create" data-view="create">Create</button>
    <button id="tab-history" type="button" role="tab" aria-selected="false" aria-controls="view-history" data-view="history" tabindex="-1">History</button>
    <button id="tab-recipes" type="button" role="tab" aria-selected="false" aria-controls="view-recipes" data-view="recipes" tabindex="-1">Recipes</button>
    <button id="tab-workflows" type="button" role="tab" aria-selected="false" aria-controls="view-workflows" data-view="workflows" tabindex="-1">Workflows</button>
    <button id="tab-distribute" type="button" role="tab" aria-selected="false" aria-controls="view-distribute" data-view="distribute" tabindex="-1" hidden>Distribute</button>
    <button id="tab-tools" type="button" role="tab" aria-selected="false" aria-controls="view-tools" data-view="tools" tabindex="-1" hidden>Tools</button>
  </div>
</nav>
<div class="operation-status" id="operation-status" role="status" aria-live="polite" aria-busy="false">Studio ready</div>
<main class="shell" id="workspace" tabindex="-1" aria-busy="false">
  <section class="view" id="view-create" role="tabpanel" aria-labelledby="tab-create">
    <div class="view-head">
      <div>
        <h2>Describe the video.</h2>
        <p>Say what happens, how it should feel, and what the viewer should understand.</p>
      </div>
      <span class="count-note" id="brief-count" hidden>Loading briefs…</span>
    </div>
    <section class="prompt-studio" aria-labelledby="prompt-title">
      <form class="composer" id="composer">
        <label for="request" id="prompt-title">What should we make?</label>
        <textarea id="request" required placeholder="A 30-second cinematic video about a lonely astronaut finding a garden on Mars."></textarea>
        <div class="voice-controls" id="voice-controls">
          <p id="voice-status">Talk through the idea, then edit the transcript before creating.</p>
          <button class="button" type="button" id="voice-button">Talk</button>
        </div>
        <details class="quick-settings">
          <summary>Settings <span>Optional</span></summary>
        <div class="quick-options" aria-label="Optional video settings">
          <label>Film style
            <select id="quick-recipe">
              <option value="">Auto</option>
              <option value="night-out-carousel">Night Out carousel</option>
              <option value="coherent-local-film">Coherent local film</option>
            </select>
          </label>
          <label>Video type
            <select id="quick-kind">
              <option value="">Auto</option>
              <option value="faceless">Faceless lesson</option>
              <option value="brand-reel">Brand reel</option>
              <option value="guided-app-demo">Guided app demo</option>
              <option value="coherent-film">Coherent film</option>
              <option value="lyric-video">Lyric video</option>
            </select>
          </label>
          <label>Duration
            <select id="quick-duration"><option value="">Auto</option><option value="15">15 seconds</option><option value="30">30 seconds</option><option value="45">45 seconds</option><option value="60">60 seconds</option></select>
          </label>
          <label class="quick-model-setting" hidden>Theme<select id="quick-theme"></select></label>
          <label class="quick-model-setting" hidden>Model<select id="quick-model"></select></label>
          <label class="quick-model-setting" hidden>Content scope
            <select id="quick-content-scope"><option value="general">General</option><option value="mature-enabled">Mature-enabled adults</option></select>
          </label>
          <p class="quick-model-summary quick-model-setting" id="quick-model-summary" hidden></p>
          <div class="local-workflow-settings" id="local-workflow-settings" hidden>
            <div class="local-recipe-readout" id="local-recipe-readout" aria-live="polite"></div>
            <label class="wide">Character reference image path
              <input id="quick-reference-image" placeholder="/absolute/path/to/approved-character.png" autocomplete="off">
            </label>
            <label>Seed<input id="quick-video-seed" type="number" min="0" max="4294967295" value="2307"></label>
            <label>Shot duration
              <select id="quick-shot-duration"><option value="2">2 seconds</option><option value="3.375" selected>3.4 seconds</option><option value="5">5 seconds</option><option value="6">6 seconds</option></select>
            </label>
            <label>Episode character<select id="quick-character"><option value="">No directory character</option></select></label>
            <label>Character voice
              <select id="quick-character-voice"><option value="af_heart">Heart</option><option value="am_adam">Adam</option><option value="bm_george">George</option><option value="bf_emma">Emma</option></select>
            </label>
            <label>Episode length<select id="quick-episode-duration"><option value="120">2 minutes</option><option value="180">3 minutes</option></select></label>
            <label>Final music file <span class="optional">(optional while planning)</span><input id="quick-episode-music" placeholder="/absolute/path/to/song.wav"></label>
            <label class="wide">Music ownership or licence evidence <span class="optional">(required to assemble)</span><textarea id="quick-episode-music-evidence" placeholder="Recorded locally for this episode, or exact licence evidence."></textarea></label>
            <div class="episode-actions">
              <span class="auto-note">Episodes are editable shot plans. Nothing renders until you generate a shot.</span>
              <div class="button-row">
                <button class="button" type="button" id="interrupt-local-video">Stop active render</button>
                <button class="button" type="button" id="plan-local-episode">Plan episode</button>
              </div>
            </div>
          </div>
        </div>
        </details>
        <div class="film-contract" id="quick-film-contract" aria-live="polite"></div>
        <details class="film-help"><summary>How Film styles work</summary><p>A Film style is a fixed, versioned production contract. Deterministic local production remains available; frontier image, video, and music generation uses approved manual imports. Paid generation requires a separate per-job budget and operator approval.</p><p>Shortcut: press Command or Control + Enter to plan the workflow. Press / outside a field to return to the prompt.</p></details>
        <div class="prompt-actions">
          <span class="auto-note">Automatic paid generation spend is $0; approved media is imported manually.</span>
          <div class="button-row">
            <button class="button" type="button" id="new-brief-button">Clear</button>
            <button class="button primary" type="submit" id="compose-button">Plan workflow</button>
          </div>
        </div>
        <div class="feedback prompt-feedback" id="compose-feedback" aria-live="polite"></div>
      </form>
    </section>
    <section class="workflow-proposal" id="workflow-proposal" hidden aria-labelledby="workflow-proposal-title">
      <header class="proposal-head">
        <div>
          <div class="proposal-topline"><p class="proposal-kicker">Proposed route · nothing has run</p><span class="state" id="workflow-proposal-state">Proposed</span></div>
          <h3 id="workflow-proposal-title">Proposed workflow</h3>
          <p class="proposal-reason" id="workflow-proposal-reason"></p>
          <div class="proposal-summary" id="workflow-proposal-summary"></div>
        </div>
        <div class="proposal-head-actions">
          <p>The exact model, graph, prompt, and seed are frozen together when you run this version.</p>
          <div class="button-row">
            <button class="button" type="button" id="workflow-proposal-new">New video</button>
            <button class="button primary" type="button" id="workflow-proposal-play">Run this plan</button>
          </div>
        </div>
      </header>
      <div class="proposal-phases" id="workflow-proposal-phases"></div>
      <div class="proposal-blocker" id="workflow-proposal-blocker" hidden>
        <p id="workflow-proposal-blocker-copy"></p>
        <div class="proposal-reference-row">
          <input id="workflow-proposal-reference" aria-label="Reference image path" placeholder="/absolute/path/to/character-or-scene.png" autocomplete="off">
          <button class="button" type="button" id="workflow-proposal-reference-save">Use reference</button>
        </div>
      </div>
      <details class="proposal-inspector" id="workflow-proposal-inspector">
        <summary>Inspect model, runtime, and graph <span>Exact technical plan</span></summary>
        <div class="proposal-inspector-body">
          <div class="proposal-models" id="workflow-proposal-models"></div>
          <button class="button" type="button" id="workflow-proposal-comfy">Inspect runtime graph</button>
          <div class="comfy-inspection" id="workflow-proposal-comfy-result" hidden></div>
        </div>
      </details>
      <div class="proposal-command">
        <div class="proposal-command-copy"><strong>Direct the plan</strong><span>Change pacing, framing, duration, quality lane, or creative intent. Studio creates a new version before anything runs.</span></div>
        <form class="proposal-controls" id="workflow-proposal-revise">
          <input id="workflow-proposal-instruction" aria-label="Modify workflow" placeholder="Make it a faster landscape preview with a calmer camera">
          <button class="button" type="submit" id="workflow-proposal-revise-button">Revise plan</button>
        </form>
      </div>
      <div class="feedback prompt-feedback" id="workflow-proposal-feedback" aria-live="polite"></div>
    </section>
    <section class="workflow-progress" id="workflow-progress" hidden aria-labelledby="workflow-progress-title">
      <div class="workflow-progress-head">
        <div><h3 id="workflow-progress-title">Production workflow</h3><p>Eight fixed steps. Prompts cannot add executable actions.</p></div>
        <button class="button" type="button" id="workflow-mode">Use quick mode</button>
      </div>
      <div class="stage-rail" id="stage-rail"></div>
      <div class="feedback prompt-feedback" id="workflow-feedback" aria-live="polite"></div>
    </section>
    <section class="episode-workspace" id="episode-workspace" hidden aria-labelledby="episode-workspace-title">
      <div class="episode-workspace-head">
        <div><h3 id="episode-workspace-title">Episode workflow</h3><p id="episode-workspace-summary">Plan, render, review, then assemble.</p></div>
        <div class="episode-workspace-controls">
          <button class="button" type="button" id="episode-generate-next">Generate next shot</button>
          <button class="button primary" type="button" id="episode-assemble">Assemble episode</button>
          <details class="episode-more"><summary class="button">More controls</summary><div class="episode-more-panel">
            <label>Render phase<select id="episode-phase"><option value="preview">Fast preview</option><option value="final">LTX 2.3 final</option></select></label>
            <button class="button" type="button" id="episode-toggle-all">Show all shots</button>
            <button class="button" type="button" id="episode-refresh">Refresh status</button>
          </div></details>
        </div>
      </div>
      <div class="episode-shot-list" id="episode-shot-list"></div>
      <div class="feedback episode-feedback" id="episode-feedback" aria-live="polite"></div>
    </section>
    <details class="advanced-studio manual-planner" id="manual-planner">
      <summary>Choose the production path manually</summary>
    <section class="planner stage" id="production-planner" aria-labelledby="planner-title">
      <div class="stage-head planner-head">
        <div>
          <h3 id="planner-title">Production planner</h3>
          <p>Project → idea → Film style → options. Changing an earlier choice clears incompatible later choices.</p>
        </div>
        <span class="state" id="planner-state">Select a project</span>
      </div>
      <div class="planner-body">
        <section class="planner-step" id="planner-step-project" aria-labelledby="planner-project-title">
          <div class="step-heading"><span class="step-number">1</span><div><h3 id="planner-project-title" tabindex="-1">Project</h3><p>Choose the Fleet product this video serves.</p></div></div>
          <div class="choice-grid project-choices" id="planner-projects"><div class="loading-line"></div></div>
        </section>
        <section class="planner-step is-locked" id="planner-step-idea" aria-labelledby="planner-idea-title" aria-disabled="true">
          <div class="step-heading"><span class="step-number">2</span><div><h3 id="planner-idea-title" tabindex="-1">Idea</h3><p>Select saved intent or add a project-specific idea.</p></div></div>
          <div class="choice-grid idea-choices" id="planner-ideas"><div class="empty-state">Choose a project first.</div></div>
          <details class="inline-create">
            <summary>Add an idea</summary>
            <form id="planner-idea-form" class="field-grid">
              <label>Idea title<input id="planner-idea-name" required placeholder="What is the video about?"></label>
              <label>Opening hook<input id="planner-idea-hook" placeholder="Optional opening promise"></label>
              <label class="wide">Angle or notes<textarea id="planner-idea-angle" placeholder="Optional point of view or evidence to include"></textarea></label>
              <div class="button-row wide"><button class="button" type="submit" id="planner-add-idea">Save idea</button></div>
            </form>
          </details>
        </section>
        <section class="planner-step is-locked" id="planner-step-recipe" aria-labelledby="planner-recipe-title" aria-disabled="true">
          <div class="step-heading"><span class="step-number">3</span><div><h3 id="planner-recipe-title" tabindex="-1">Film style</h3><p>Compare the versioned production contract, engine, spend posture, and blockers.</p></div></div>
          <div id="planner-recipes"><div class="empty-state">Choose an idea first.</div></div>
        </section>
        <section class="planner-step is-locked" id="planner-step-options" aria-labelledby="planner-options-title" aria-disabled="true">
          <div class="step-heading"><span class="step-number">4</span><div><h3 id="planner-options-title" tabindex="-1">Options</h3><p>Set bounded production choices; execution still requires a separate action.</p></div></div>
          <form id="planner-options" class="field-grid">
            <label>Channel<select id="planner-channel"><option value="youtube_shorts">YouTube Shorts</option><option value="instagram_reels">Instagram Reels</option></select></label>
            <label>Duration (seconds)<input id="planner-duration" type="number" min="5" max="90" value="30"></label>
            <label>Quality tier<select id="planner-quality"><option value="draft">Draft</option><option value="standard">Standard</option><option value="high">High</option></select></label>
            <label>Variants<input id="planner-variants" type="number" min="1" max="6" value="1"></label>
            <div class="recipe-option-fields wide" id="planner-recipe-options"></div>
            <details class="evidence-options wide">
              <summary>Source and rights inputs</summary>
              <div class="field-grid">
                <label>Canonical source URL<input id="planner-source-url" type="url" placeholder="https://…"></label>
                <label>Destination URL<input id="planner-destination-url" type="url" placeholder="https://…"></label>
                <label class="wide">Source-backed claim<textarea id="planner-claim" placeholder="Exact claim the video may make"></textarea></label>
                <label>Source rights<select id="planner-rights"><option value="unknown">Not reviewed</option><option value="approved">Approved / owned</option><option value="rejected">Rejected</option></select></label>
              </div>
            </details>
          </form>
        </section>
      </div>
      <div class="planner-terminal">
        <div><strong id="planner-summary">Select a project to begin.</strong><p id="planner-blocker">Nothing renders when a selection is saved.</p></div>
        <div class="button-row">
          <button class="button primary" type="button" id="planner-save" disabled>Save production plan</button>
          <button class="button" type="button" id="planner-edit" disabled>Edit</button>
          <button class="button" type="button" id="planner-build" disabled>Build preview</button>
          <button class="button" type="button" id="planner-preview" disabled>Preview</button>
          <button class="button" type="button" id="planner-post" disabled>Prepare in Postiz</button>
        </div>
        <div class="feedback" id="planner-feedback" aria-live="polite"></div>
      </div>
    </section>
    </details>
    <details class="advanced-studio" id="advanced-brief" hidden>
      <summary>Advanced production details</summary>
      <p>Review the generated brief or refine evidence, rights, lyric timing, and distribution fields.</p>
    <div class="create-grid">
      <div>
        <section class="stage" aria-labelledby="conversation-title">
          <div class="stage-head">
            <h3 id="conversation-title">Conversation</h3>
            <p>Ask for a lesson, product reel, app demo, coherent film, podcast short, or lyric video.</p>
          </div>
          <div class="stage-body">
            <div class="conversation" id="conversation" role="list" aria-label="Brief conversation" aria-live="polite">
              <div class="message empty" role="listitem">Your production conversation will appear here.</div>
            </div>
          </div>
        </section>
        <section class="stage" aria-labelledby="workflow-title">
          <div class="stage-head">
            <h3 id="workflow-title">Video workflows</h3>
            <p>Every path names its real runtime and prerequisites.</p>
          </div>
          <div class="workflow-list" id="workflow-list">
            <div class="loading-line"></div><div class="loading-line"></div><div class="loading-line"></div>
          </div>
        </section>
      </div>
      <section class="stage" aria-labelledby="brief-title">
        <div class="stage-head">
          <h3 id="brief-title">Production brief</h3>
          <p id="brief-subtitle">Create or select a brief to edit its normalized production state.</p>
        </div>
        <div class="stage-body">
          <form id="brief-form">
            <details class="brief-group" open>
              <summary>Basics</summary>
              <div class="field-grid">
                <label>Video kind
                  <select id="brief-kind">
                    <option value="faceless">Faceless lesson</option>
                    <option value="brand-reel">Brand reel</option>
                    <option value="guided-app-demo">Guided app demo</option>
                    <option value="coherent-film">Coherent film</option>
                    <option value="podcast-short">Podcast short</option>
                    <option value="lyric-video">Literal lyric video</option>
                  </select>
                </label>
                <label>Fleet brand
                  <select id="brief-project"><option value="">Choose a brand</option></select>
                </label>
                <label>Channel
                  <select id="brief-channel">
                    <option value="youtube_shorts">YouTube Shorts</option>
                    <option value="instagram_reels">Instagram Reels</option>
                  </select>
                </label>
                <label>Duration
                  <input id="brief-duration" type="number" min="5" max="1200" value="60">
                </label>
                <label>Render engine
                  <select id="brief-engine">
                    <option value="mock">Mock proof</option>
                    <option value="kokoro">Kokoro local</option>
                    <option value="lyric-canvas">Lyric canvas</option>
                    <option value="blender">Blender literal scenes</option>
                    <option value="html-composition">HTML / Canvas composition</option>
                    <option value="ascii">ASCII animation</option>
                    <option value="grok-video">Approved Grok asset</option>
                    <option value="brand-reel">Brand Reel handoff</option>
                    <option value="editorial">Editorial</option>
                    <option value="threejs">Three.js Visual Lab</option>
                  </select>
                </label>
                <label>Title
                  <input id="brief-name" placeholder="Video title">
                </label>
              </div>
            </details>
            <details class="brief-group" id="lyric-fields" hidden>
              <summary>Music and lyrics</summary>
              <div class="field-grid">
                <label>Approved local audio path
                  <input id="lyric-audio-path" placeholder="./artifacts/song-original.wav">
                </label>
                <label>Timed lyrics
                  <textarea id="lyric-timed-text" rows="7" placeholder="[00:00.00]First exact lyric line&#10;[00:03.00]Second exact lyric line"></textarea>
                </label>
                <label>Timed lyric format
                  <select id="lyric-format">
                    <option value="lrc">LRC</option>
                    <option value="srt">SRT</option>
                  </select>
                </label>
                <label>Composition and lyric rights
                  <select id="lyric-composition-rights">
                    <option value="unknown">Not established</option>
                    <option value="owned">Owned</option>
                    <option value="licensed">Licensed</option>
                    <option value="public-domain">Public domain</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </label>
                <label>Master-recording rights
                  <select id="lyric-master-rights">
                    <option value="unknown">Not established</option>
                    <option value="owned">Owned</option>
                    <option value="licensed">Licensed</option>
                    <option value="original-recording">Original recording</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </label>
                <label>Rights evidence
                  <textarea id="lyric-rights-evidence" placeholder="Licence record, ownership note, or public-domain basis. Attribution alone is not permission."></textarea>
                </label>
                <label>Rights evidence URL
                  <input id="lyric-rights-url" type="url" placeholder="https://…">
                </label>
                <label>Attribution
                  <textarea id="lyric-attribution" placeholder="Songwriters, composition, performer or recording source, and required licence credit"></textarea>
                </label>
                <label>Literal art direction
                  <select id="lyric-visual-style">
                    <option value="literal-cinematic">Literal cinematic</option>
                    <option value="kinetic-type">Kinetic type</option>
                  </select>
                </label>
                <label class="checkline"><input id="lyric-reduced-motion" type="checkbox"> Use reduced motion</label>
              </div>
              <div class="boundary" id="blender-readiness">Checking Blender 5.2 readiness…</div>
              <p class="hint">Studio never fetches lyrics. Supply exact timed text and separately cleared composition and recording rights.</p>
            </details>
            <details class="brief-group">
              <summary>Story and creative direction</summary>
              <div class="field-grid">
                <label>Hook
                  <textarea id="brief-hook" placeholder="The opening promise or tension"></textarea>
                </label>
                <label>Summary / script intent
                  <textarea id="brief-summary" placeholder="What the video must communicate"></textarea>
                </label>
                <label>Creative direction
                  <textarea id="brief-direction" placeholder="Visual rhythm, evidence, presenter, atmosphere"></textarea>
                </label>
                <label>Call to action
                  <input id="brief-cta" placeholder="What should the viewer do?">
                </label>
              </div>
            </details>
            <details class="brief-group">
              <summary>Characters</summary>
              <div class="field-grid">
                <div class="directory-row">
                  <label>Search directory<input id="character-search" type="search" placeholder="Name, role, source"></label>
                  <label>Character directory<select id="character-select"><option value="">No saved characters</option></select></label>
                  <button class="button" type="button" id="add-character-to-cast">Add to cast</button>
                </div>
                <div class="cast-list" id="cast-list"><span class="hint">No characters in this reel.</span></div>
                <details class="inline-create wide">
                  <summary>Create a reusable fictional character</summary>
                  <div class="field-grid">
                    <label>Name<input id="character-name" placeholder="Mira"></label>
                    <label>Age<input id="character-age" type="number" min="25" max="120" value="25"></label>
                    <label class="wide">Appearance<textarea id="character-appearance" placeholder="silver bob, amber eyes, athletic build"></textarea></label>
                    <label class="wide">Prompt anchors<textarea id="character-tokens" placeholder="distinctive cheekbones, cinematic rim light"></textarea></label>
                    <label class="checkline"><input id="character-adult" type="checkbox" checked> Fictional adult, age confirmed</label>
                    <label class="checkline"><input id="character-consent" type="checkbox" checked> Affirmative consent posture</label>
                    <div class="button-row wide"><button class="button" type="button" id="save-character">Save character</button></div>
                  </div>
                </details>
              </div>
            </details>
            <details class="brief-group">
              <summary>Soundtrack and mix</summary>
              <div class="field-grid">
                <label>Music lane<select id="soundtrack-lane"><option value="procedural-draft">Procedural draft</option><option value="owned-local">Owned / licensed local audio</option><option value="platform-sound">Add in platform</option><option value="generated">Generated locally</option></select></label>
                <label>Music gain (dB)<input id="soundtrack-gain" type="number" min="-60" max="12" step="0.5" value="-8"></label>
                <label>Trim start (seconds)<input id="soundtrack-trim-start" type="number" min="0" max="86400" step="0.1" value="0"></label>
                <label>Timeline offset (seconds)<input id="soundtrack-offset" type="number" min="0" max="600" step="0.1" value="0"></label>
                <label>Fade in (seconds)<input id="soundtrack-fade-in" type="number" min="0" max="30" step="0.1" value="0.2"></label>
                <label>Fade out (seconds)<input id="soundtrack-fade-out" type="number" min="0" max="30" step="0.1" value="0.5"></label>
                <label class="checkline"><input id="soundtrack-loop" type="checkbox" checked> Loop music to fit</label>
                <label class="checkline"><input id="soundtrack-duck" type="checkbox"> Duck under narration</label>
                <label>Ducking threshold<input id="soundtrack-duck-threshold" type="number" min="0.001" max="1" step="0.001" value="0.08"></label>
                <label>Ducking ratio<input id="soundtrack-duck-ratio" type="number" min="1" max="30" step="0.5" value="8"></label>
                <div class="field-grid wide conditional-fields" id="soundtrack-owned-fields" hidden>
                  <label class="wide">Approved local audio path<input id="soundtrack-path" placeholder="./artifacts/music/track.wav"></label>
                  <label>Rights posture<select id="soundtrack-rights"><option value="unknown">Unknown</option><option value="owned">Owned</option><option value="licensed">Licensed</option></select></label>
                  <label>Rights evidence<input id="soundtrack-rights-evidence" placeholder="Licence or ownership record"></label>
                </div>
                <div class="field-grid wide conditional-fields" id="soundtrack-platform-fields" hidden>
                  <label>Platform<select id="soundtrack-provider"><option value="instagram">Instagram</option><option value="tiktok">TikTok</option><option value="youtube">YouTube</option><option value="spotify">Spotify</option></select></label>
                  <label>Official sound URL<input id="soundtrack-url" type="url" placeholder="https://…"></label>
                  <label>Start at (seconds)<input id="soundtrack-platform-start" type="number" min="0" max="86400" step="0.1" value="0"></label>
                </div>
                <div class="field-grid wide conditional-fields" id="soundtrack-generated-fields" hidden>
                  <label class="wide">Music prompt<textarea id="soundtrack-prompt" placeholder="funky disco-house instrumental, elastic bass, bright brass stabs"></textarea></label>
                  <label>BPM<input id="soundtrack-bpm" type="number" min="40" max="240" value="118"></label>
                  <label>Key<input id="soundtrack-key" placeholder="A minor"></label>
                  <label>Meter<input id="soundtrack-meter" placeholder="4/4"></label>
                  <label>Reference audio path<input id="soundtrack-reference-audio" placeholder="./artifacts/music/reference.wav"></label>
                  <label>Variations<input id="soundtrack-variations" type="number" min="1" max="4" value="2"></label>
                  <label>Selected variation<select id="soundtrack-selected-variation"><option value="">Generate or select a variation</option></select></label>
                  <label class="checkline"><input id="soundtrack-instrumental" type="checkbox" checked> Instrumental</label>
                </div>
              </div>
              <p class="hint" id="soundtrack-boundary">Procedural music is a draft fallback, not final-quality audio.</p>
            </details>
            <details class="brief-group">
              <summary>Evidence and distribution</summary>
              <div class="field-grid">
                <label>Source rights
                  <select id="brief-rights">
                    <option value="unknown">Not reviewed</option>
                    <option value="approved">Approved / owned</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </label>
                <label>Canonical source URL
                  <input id="brief-source-url" type="url" placeholder="https://…">
                </label>
                <label>Source-backed claim
                  <textarea id="brief-claim" placeholder="The exact claim this video is allowed to make"></textarea>
                </label>
                <label>Destination URL
                  <input id="brief-destination" type="url" placeholder="https://…">
                </label>
                <label>Stable public video URL
                  <input id="brief-public-url" type="url" placeholder="Required only for Postiz draft handoff">
                </label>
                <label class="checkline"><input id="brief-creative-approved" type="checkbox"> Creative is explicitly approved for distribution</label>
                <label class="checkline"><input id="brief-quality-accepted" type="checkbox"> Accept current quality evidence for distribution</label>
              </div>
            </details>
            <div class="brief-actions">
              <span class="brief-state" id="brief-state">No brief selected</span>
              <div class="button-row">
                <button class="button" type="submit" id="save-brief-button" disabled>Save brief</button>
                <button class="button primary" type="button" id="execute-button" disabled>Create video</button>
              </div>
            </div>
            <div class="feedback" id="brief-feedback" aria-live="polite"></div>
          </form>
        </div>
      </section>
    </div>
    </details>
  </section>

  <section class="view" id="view-history" role="tabpanel" aria-labelledby="tab-history" hidden>
    <header class="archive-head">
      <p>Production history · every saved route and result</p>
      <h2>Everything you made. Ready to revisit.</h2>
      <div><span>Watch the artifact</span><span>Read the prompt</span><span>Inspect the workflow</span></div>
    </header>
    <section class="history-showcase" id="history-showcase" aria-live="polite"><div class="loading-line"></div></section>
    <nav class="history-filmstrip" id="history-filmstrip" aria-label="Recent production history"></nav>
    <details class="history-ledger" id="history-ledger"><summary>All studio history <span>Every prompt, route, and reviewable artifact</span></summary><div id="history-ledger-list"></div></details>
    <details class="history-operations" id="history-operations">
      <summary>Production operations <span>Queues, automation lanes, incomplete work, and legacy renders</span></summary>
      <div class="production-toolbar"><label>Search operations<input id="production-search" type="search" placeholder="Title, project, Film style"></label><button class="button" type="button" id="refresh-productions">Refresh operations</button></div>
    <section class="lane-console" aria-labelledby="lane-console-title">
      <div class="lane-console-head">
        <div><h3 id="lane-console-title">Content lanes</h3><p>One production queue, separated by who initiated the work. Automation status is read-only here.</p></div>
        <div class="lane-switcher" role="group" aria-label="Filter productions by content lane">
          <button type="button" data-production-lane="all" aria-pressed="true">All</button>
          <button type="button" data-production-lane="project-automation" aria-pressed="false">Project Autopilot</button>
          <button type="button" data-production-lane="operator-request" aria-pressed="false">Ask Me</button>
          <button type="button" data-production-lane="personal-automation" aria-pressed="false">Personal Automations</button>
        </div>
      </div>
      <div class="lane-ledger" id="lane-ledger" aria-live="polite"><div><strong>Loading lane status…</strong></div></div>
      <div id="automation-note"></div>
    </section>
    <div id="production-list"><div class="loading-line"></div><div class="loading-line"></div></div>
    </details>
  </section>

  <section class="view" id="view-recipes" role="tabpanel" aria-labelledby="tab-recipes" hidden>
    <header class="archive-head">
      <p>Recipes · what the maker creates</p>
      <h2>Start with a recognizable result.</h2>
      <div><span>Choose a format</span><span>Adjust the controls</span><span>Make it yours</span></div>
    </header>
    <div class="library-layout">
      <nav class="library-index" id="recipe-library-index" aria-label="Recipe library"></nav>
      <article class="library-detail" id="recipe-library-detail"><div class="loading-line"></div></article>
    </div>
  </section>

  <section class="view" id="view-workflows" role="tabpanel" aria-labelledby="tab-workflows" hidden>
    <header class="archive-head">
      <p>Workflows · how the maker executes</p>
      <h2>See the machine before it moves.</h2>
      <div><span>Direct the shot</span><span>Bind the model</span><span>Review the evidence</span></div>
    </header>
    <div class="library-layout">
      <nav class="library-index" id="workflow-library-index" aria-label="Workflow library"></nav>
      <article class="library-detail" id="workflow-library-detail"><div class="loading-line"></div></article>
    </div>
  </section>

  <section class="view" id="view-distribute" role="tabpanel" aria-labelledby="tab-distribute" hidden>
    <div class="view-head">
      <div>
        <h2>Prepare and schedule</h2>
        <p>Create an unscheduled draft or choose a future publish time. Postiz remains the credential, publication-state, calendar, and analytics owner.</p>
      </div>
      <span class="state" id="postiz-state">Checking Postiz</span>
    </div>
    <div class="distribution-grid">
      <section class="stage">
        <div class="stage-head">
          <h3>Distribution evidence</h3>
          <p>Every item must be explicit before a network request is possible.</p>
        </div>
        <div class="stage-body">
          <label>Production
            <select id="distribution-brief"><option value="">Choose a production</option></select>
          </label>
          <p class="hint" id="evidence-progress">Choose a production to inspect its handoff evidence.</p>
          <ul class="evidence-list" id="evidence-list"></ul>
          <div class="button-row" style="margin-top:16px">
            <button class="button" type="button" id="prepare-button" disabled>Prepare handoff</button>
            <button class="button" type="button" id="draft-button" disabled>Create Postiz draft</button>
          </div>
          <div class="feedback" id="distribution-feedback" aria-live="polite"></div>
        </div>
      </section>
      <section class="stage">
        <div class="stage-head">
          <h3>Schedule in Postiz</h3>
          <p>Choose device-local time; Studio sends Postiz the exact UTC timestamp.</p>
        </div>
        <div class="stage-body">
          <div class="schedule-form">
            <label for="schedule-time">Publish date and time
              <input id="schedule-time" type="datetime-local">
            </label>
            <p id="schedule-timezone" class="hint"></p>
            <p id="schedule-status" class="schedule-status" aria-live="polite"></p>
            <p id="postiz-boundary" class="hint">Loading the configured distribution boundary…</p>
            <div class="boundary">Scheduling creates a Postiz queue item. It does not mean YouTube or Instagram has published the video yet.</div>
          </div>
          <div class="button-row" style="margin-top:16px">
            <button class="button primary" id="schedule-button" type="button" disabled>Schedule in Postiz</button>
            <a class="button" id="open-postiz" href="#" target="_blank" rel="noreferrer" aria-disabled="true">Open Postiz</a>
          </div>
        </div>
      </section>
    </div>
  </section>

  <section class="view" id="view-tools" role="tabpanel" aria-labelledby="tab-tools" hidden>
    <div class="view-head">
      <div>
        <h2>Advanced tools</h2>
        <p>The original Studio workbench remains available for individual ideation, metadata, scripting, factory, and artifact operations.</p>
      </div>
    </div>
    <div class="tools-layout">
      <nav class="tool-nav" id="tool-nav" aria-label="Studio tools"></nav>
      <div id="tool-panels"></div>
    </div>
  </section>
</main>
<script>
const TOOLS = ${JSON.stringify(TOOLS)};
const BRANDS = ${JSON.stringify(BRANDS)};
const PLATFORM_SOUND_PRESETS = ${JSON.stringify(PLATFORM_SOUND_PRESETS)};
const FILM_STYLE_DEFINITIONS = new Map(${JSON.stringify(FILM_STYLES)});
let briefs = [];
let activeBrief = null;
let capabilities = [];
let blenderReadiness = null;
let postizReadiness = null;
let showAllWorkflows = false;
let briefDirty = false;
let modelOptions = { themePacks:[], modelProfiles:[] };
let plannerData = { projects:[], ideas:[], recipes:[], themePacks:[], modelProfiles:[] };
let plannerSelection = { projectSlug:null, ideaId:null, recipeId:null };
let plannerReady = false;
let plannerOptionsDirty = false;
let productionData = { briefs:[], legacyRenders:[], episodes:[] };
let autopilotStatus = null;
let automationPolicies = [];
let activeProductionLane = 'all';
let productionSearch = '';
let selectedProductionId = null;
let historyEntries = [];
let activeHistoryId = null;
let recipeLibrary = { recipes:[], workflowRecipes:[] };
let activeRecipeId = null;
let workflowLibrary = [];
let activeWorkflowId = null;
let pendingStudioRequests = 0;
let characters = [];
let activeEpisode = null;
let showAllEpisodeShots = false;
let voiceSource = null;
let voiceRecording = null;
let voiceRecorder = null;
let voiceStream = null;
let voiceChunks = [];
const platformPreviewPlayers = new Map();
let youtubeApiPromise = null;
let spotifyApiPromise = null;

const viewButtons = Array.from(document.querySelectorAll('[data-view]:not([hidden])'));
const toolShortcutButtons = Array.from(document.querySelectorAll('[data-tool-shortcut]'));
for (const button of viewButtons) {
  button.addEventListener('click', () => {
    activateView(button.dataset.view);
  });
  button.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = viewButtons.indexOf(button);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? viewButtons.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + viewButtons.length) % viewButtons.length;
    activateView(viewButtons[nextIndex].dataset.view);
    viewButtons[nextIndex].focus();
  });
}
for (const button of toolShortcutButtons) {
  button.addEventListener('click', () => {
    activateView('tools');
    activateTool(button.dataset.toolShortcut);
  });
}

document.getElementById('open-postiz').addEventListener('click', (event) => {
  if (event.currentTarget.getAttribute('aria-disabled') === 'true') event.preventDefault();
});
for (const button of document.querySelectorAll('[data-production-lane]')) {
  button.addEventListener('click', () => {
    activeProductionLane = button.dataset.productionLane;
    for (const option of document.querySelectorAll('[data-production-lane]')) {
      option.setAttribute('aria-pressed', String(option === button));
    }
    renderLaneConsole();
    renderProductionList();
  });
}

function activateView(id) {
  if (id === 'productions') id = 'history';
  for (const button of viewButtons) {
    const selected = button.dataset.view === id;
    button.setAttribute('aria-selected', selected ? 'true' : 'false');
    button.tabIndex = selected ? 0 : -1;
  }
  if (id !== 'tools') {
    for (const button of toolShortcutButtons) button.classList.remove('active');
  }
  for (const view of document.querySelectorAll('.view')) view.hidden = view.id !== 'view-' + id;
  const url = new URL(window.location.href);
  if (id === 'create') url.searchParams.delete('view');
  else url.searchParams.set('view', id);
  window.history.replaceState({}, '', url);
  if (id === 'history') loadHistory();
  if (id === 'recipes') loadRecipeLibrary();
  if (id === 'workflows') loadWorkflowLibrary();
  if (id === 'distribute') renderDistribution();
}

for (const brand of BRANDS) {
  const option = document.createElement('option');
  option.value = brand.slug;
  option.textContent = brand.name;
  document.getElementById('brief-project').appendChild(option);
}

document.getElementById('quick-kind').addEventListener('change', renderQuickKindSelection);
for (const id of ['quick-recipe','quick-theme','quick-model','quick-content-scope']) {
  document.getElementById(id).addEventListener('change', renderQuickModelSelection);
}
document.getElementById('quick-reference-image').addEventListener('input', renderQuickModelSelection);

function renderQuickKindSelection() {
  const selected = value('quick-kind');
  for (const choice of document.querySelectorAll('[data-quick-kind]')) {
    choice.setAttribute('aria-pressed', String(choice.dataset.quickKind === selected));
  }
}

async function loadModelOptions() {
  modelOptions = await api('/studio/model-options');
  fillQuickSelect('quick-theme', modelOptions.themePacks);
  fillQuickSelect('quick-model', modelOptions.modelProfiles);
  renderQuickModelSelection();
  return modelOptions;
}

function fillQuickSelect(id, entries) {
  const select = document.getElementById(id);
  const previous = select.value || 'auto';
  select.innerHTML = entries.map((entry) => '<option value="' + escapeText(entry.id) + '">' + escapeText(entry.name) + '</option>').join('');
  setValue(id, entries.some((entry) => entry.id === previous) ? previous : 'auto');
}

function quickGenerationMode() {
  if (value('quick-recipe') === 'night-out-carousel') return 'image-to-reel';
  if (value('quick-recipe') === 'coherent-local-film') return 'image-to-video';
  return null;
}

function quickModelState() {
  const generationMode = quickGenerationMode();
  if (!generationMode) return { allowed:true, profile:null, blocker:null };
  const requested = modelOptions.modelProfiles.find((entry) => entry.id === (value('quick-model') || 'auto'));
  if (!requested) return { allowed:false, profile:null, blocker:'Model options are still loading.' };
  const compatible = requested.id === 'auto'
    ? modelOptions.modelProfiles.find((entry) => entry.id !== 'auto' && entry.autoEligible === true && entry.generationModes.includes(generationMode) && entry.readiness.ready)
    : requested;
  if (!compatible) return { allowed:false, profile:requested, blocker:'Auto found no ready ' + generationMode + ' model on this Mac.' };
  if (!compatible.generationModes.includes(generationMode)) {
    return { allowed:false, profile:compatible, blocker:compatible.name + ' does not support ' + generationMode + '.' };
  }
  if (!compatible.readiness.ready) return { allowed:false, profile:compatible, blocker:compatible.readiness.blocker };
  if (value('quick-recipe') === 'coherent-local-film' && !value('quick-reference-image')) {
    return { allowed:false, profile:compatible, blocker:'Add a local character reference image path.' };
  }
  return { allowed:true, profile:compatible, blocker:null };
}

function renderQuickModelSelection() {
  const generationMode = quickGenerationMode();
  const visible = Boolean(generationMode);
  for (const element of document.querySelectorAll('.quick-model-setting')) element.hidden = !visible;
  const localVisible = value('quick-recipe') === 'coherent-local-film';
  document.getElementById('local-workflow-settings').hidden = !localVisible;
  const summary = document.getElementById('quick-model-summary');
  if (!visible) {
    renderQuickFilmContract();
    refreshComposeAvailability();
    return;
  }
  const state = quickModelState();
  const profile = state.profile;
  summary.classList.toggle('blocked', !state.allowed);
  summary.innerHTML = profile
    ? '<strong>' + escapeText(profile.name) + '</strong> · ' + escapeText(profile.speed) + ' · ' + escapeText(profile.quality) + ' · ' + escapeText(profile.resourceClass) +
      (profile.nativeAudio ? ' · native audio' : ' · reel adds local audio') + '<br>' +
      escapeText(state.blocker || profile.license) + '<br>' + escapeText('Trust: ' + profile.trust.tier.replaceAll('-', ' ') + '. ' + profile.trust.basis)
    : escapeText(state.blocker || 'Choose an approved imported-media route.');
  renderLocalRecipeReadout(profile);
  renderQuickFilmContract(state);
  refreshComposeAvailability();
}

function renderQuickFilmContract(currentState = quickModelState()) {
  const box = document.getElementById('quick-film-contract');
  const recipeId = value('quick-recipe');
  const profile = currentState.profile;
  const recipe = workflowRecipeForProfile(profile?.id);
  if (!recipeId) {
    box.innerHTML = '<div><strong>Film style · Auto</strong><span>Studio resolves a runnable versioned style from the video intent before generation.</span></div><span class="state ready">preflight active</span>';
    return;
  }
  const productionStyle = FILM_STYLE_DEFINITIONS.get(recipeId);
  if (recipeId !== 'coherent-local-film') {
    const name = productionStyle ? productionStyle.name + '@' + productionStyle.version : recipeId + '@1';
    const detail = currentState.blocker
      ? operatorReadinessSummary(currentState.blocker)
      : (profile ? profile.name + ' · ' + profile.license : 'Ready through the registered local production path.');
    box.innerHTML = '<div><strong>Film style · ' + escapeText(name) + '</strong><span>' + escapeText(detail) + '</span></div>' +
      '<span class="state ' + (currentState.allowed ? 'ready' : 'blocked') + '">' + escapeText(currentState.allowed ? 'ready locally' : 'needs setup') + '</span>';
    return;
  }
  const ready = currentState.allowed;
  const exactStyle = recipe ? recipe.name + '@' + recipe.version : 'Exact local style not selected';
  const detail = currentState.blocker
    ? operatorReadinessSummary(currentState.blocker)
    : (profile ? profile.name + ' · ' + profile.license : 'Choose an exact local model.');
  box.innerHTML = '<div><strong>Film style · ' + escapeText(exactStyle) + '</strong><span>' + escapeText(detail) + '</span></div>' +
    '<span class="state ' + (ready ? 'ready' : 'blocked') + '">' + escapeText(ready ? (recipe?.qualityLane === 'preview' ? 'preview only' : 'ready locally') : 'needs setup') + '</span>';
}

function operatorReadinessSummary(blocker) {
  const message = String(blocker || '');
  if (/reference image/i.test(message)) return 'Add an approved character reference under Settings.';
  if (/disk|storage/i.test(message)) return 'Needs setup, but the storage guard currently prevents installation. Open Settings for technical evidence.';
  if (/parked|paid generation|operator approval/i.test(message)) return message;
  if (/runtime canary|MPS|aten::|sampling step/i.test(message)) return 'This model failed its retained local runtime check. Import approved media instead.';
  if (/missing|not found|path/i.test(message)) return 'Needs local setup. Open Settings for the exact missing runtime evidence.';
  return message;
}

function workflowRecipeForProfile(profileId) {
  const recipeId = {
    'ltx-2.3-mlx-q4':'ltx-2.3-mlx-q4-final',
    'ltx-2b-comfy-preview':'ltx-2b-comfy-i2v-preview',
  }[profileId];
  return modelOptions.workflowRecipes?.find((entry) => entry.id === recipeId) || null;
}

function renderLocalRecipeReadout(profile) {
  const box = document.getElementById('local-recipe-readout');
  if (value('quick-recipe') !== 'coherent-local-film') {
    box.innerHTML = '';
    return;
  }
  const recipe = workflowRecipeForProfile(profile?.id);
  if (!recipe) {
    box.innerHTML = '<strong>Local model generation is parked.</strong><span>Import approved external media; paid runs require a per-job budget and operator approval.</span>';
    return;
  }
  const state = recipe.readiness.ready ? 'Ready' : 'Blocked';
  const detail = recipe.readiness.blocker || (
    recipe.qualityLane === 'preview'
      ? 'Fast planning lane. Review quality before using any shot.'
      : 'Final-quality lane through the existing MLX Local Video Forge runtime.'
  );
  box.innerHTML = '<strong>Film style · ' + escapeText(recipe.name + '@' + recipe.version) + ' · ' + escapeText(state) + '</strong>' +
    '<span>' + escapeText(recipe.qualityLane + ' · ' + recipe.resourceEnvelope.expectedDiskGb + ' GB installed footprint · serial · 85% disk / 90% RAM guards') + '</span>' +
    '<span>' + escapeText(detail) + '</span>';
}

function refreshComposeAvailability() {
  const button = document.getElementById('compose-button');
  if (button.dataset.busy === 'true') return;
  const state = quickModelState();
  button.disabled = !state.allowed;
  button.title = state.blocker || '';
}

async function loadProductionPlanner(projectSlug) {
  const suffix = projectSlug ? '?projectSlug=' + encodeURIComponent(projectSlug) : '';
  plannerData = await api('/studio/production-planner' + suffix);
  plannerReady = true;
  renderPlanner();
  return plannerData;
}

function renderPlanner() {
  renderPlannerProjects();
  renderPlannerIdeas();
  renderPlannerRecipes();
  setPlannerStep('idea', Boolean(plannerSelection.projectSlug));
  setPlannerStep('recipe', Boolean(plannerSelection.ideaId));
  setPlannerStep('options', Boolean(plannerSelection.recipeId));
  renderPlannerTerminal();
}

function setPlannerStep(id, enabled) {
  const step = document.getElementById('planner-step-' + id);
  step.classList.toggle('is-locked', !enabled);
  step.setAttribute('aria-disabled', enabled ? 'false' : 'true');
  step.inert = !enabled;
}

function focusPlannerStep(id) {
  window.setTimeout(() => document.getElementById('planner-' + id + '-title')?.focus(), 0);
}

function renderPlannerProjects() {
  const box = document.getElementById('planner-projects');
  if (!plannerData.projects.length) {
    box.innerHTML = '<div class="empty-state">No Fleet projects are configured.</div>';
    return;
  }
  box.innerHTML = '<label>Fleet project<select id="planner-project-select"><option value="">Choose a project</option>' + plannerData.projects.map((project) =>
    '<option value="' + escapeText(project.slug) + '"' + (plannerSelection.projectSlug === project.slug ? ' selected' : '') + '>' + escapeText(project.name) + ' · ' + escapeText(project.domain) + '</option>').join('') + '</select></label>';
  document.getElementById('planner-project-select').addEventListener('change', (event) => {
    if (event.target.value) choosePlannerProject(event.target.value);
  });
}

async function choosePlannerProject(projectSlug) {
  if (plannerSelection.projectSlug === projectSlug) return;
  plannerSelection = { projectSlug, ideaId:null, recipeId:null };
  plannerOptionsDirty = true;
  setFeedback('planner-feedback', 'Loading ideas for the selected project…');
  try {
    await loadProductionPlanner(projectSlug);
    setFeedback('planner-feedback', 'Project selected. Choose or add an idea.', 'success');
    focusPlannerStep('idea');
  } catch (error) {
    setFeedback('planner-feedback', error.message, 'error');
  }
}

function renderPlannerIdeas() {
  const box = document.getElementById('planner-ideas');
  if (!plannerSelection.projectSlug) {
    box.innerHTML = '<div class="empty-state">Choose a project first.</div>';
    return;
  }
  if (!plannerData.ideas.length) {
    box.innerHTML = '<div class="empty-state">No ideas for this project yet. Add the first one below.</div>';
    return;
  }
  const selected = plannerData.ideas.find((idea) => idea.id === plannerSelection.ideaId);
  const visible = [selected, ...plannerData.ideas].filter((idea, index, list) => idea && list.findIndex((entry) => entry.id === idea.id) === index).slice(0, 4);
  const remaining = plannerData.ideas.filter((idea) => !visible.some((entry) => entry.id === idea.id));
  box.innerHTML = visible.map(renderPlannerIdeaCard).join('') + (remaining.length
    ? '<details class="all-recipes" style="grid-column:1/-1"><summary>All saved ideas · ' + escapeText(String(plannerData.ideas.length)) + '</summary><div class="choice-grid">' + remaining.map(renderPlannerIdeaCard).join('') + '</div></details>'
    : '');
  for (const button of box.querySelectorAll('[data-planner-idea]')) button.addEventListener('click', () => {
    plannerSelection.ideaId = button.dataset.plannerIdea;
    plannerSelection.recipeId = null;
    plannerOptionsDirty = true;
    renderPlanner();
    setFeedback('planner-feedback', 'Idea selected. Compare the available Film styles.', 'success');
    focusPlannerStep('recipe');
  });
}

function renderPlannerIdeaCard(idea) {
  return '<button class="choice-card" type="button" data-planner-idea="' + escapeText(idea.id) + '" aria-pressed="' +
    (plannerSelection.ideaId === idea.id ? 'true' : 'false') + '">' +
    '<strong>' + escapeText(idea.title) + '</strong><span>' + escapeText(idea.hook || idea.angle || 'No hook yet') + '</span>' +
    '<span class="mini-state">' + escapeText(idea.status || 'new') + '</span></button>';
}

function renderPlannerRecipes() {
  const box = document.getElementById('planner-recipes');
  if (!plannerSelection.ideaId) {
    box.innerHTML = '<div class="empty-state">Choose an idea first.</div>';
    return;
  }
  const priority = ['image-slideshow', 'web-motion', 'ascii-story', 'product-proof'];
  const selected = selectedPlannerRecipe();
  const recommended = [selected, ...priority.map((id) => plannerData.recipes.find((recipe) => recipe.id === id))]
    .filter((recipe, index, list) => recipe && list.findIndex((entry) => entry.id === recipe.id) === index)
    .slice(0, 4);
  const remaining = plannerData.recipes.filter((recipe) => !recommended.some((entry) => entry.id === recipe.id));
  box.innerHTML = '<section class="recommended-recipes"><h4>Common starting points</h4><div class="recipe-grid">' + recommended.map(renderPlannerRecipeCard).join('') + '</div></section>' +
    '<details class="all-recipes"><summary>All Film styles · ' + escapeText(String(plannerData.recipes.length)) + '</summary>' + renderPlannerRecipeGroups(remaining) + '</details>';
  for (const button of box.querySelectorAll('[data-planner-recipe]')) button.addEventListener('click', () => choosePlannerRecipe(button.dataset.plannerRecipe));
}

function renderPlannerRecipeGroups(recipes) {
  const groups = new Map();
  for (const recipe of recipes) {
    if (!groups.has(recipe.group)) groups.set(recipe.group, []);
    groups.get(recipe.group).push(recipe);
  }
  return Array.from(groups.entries()).map(([group, entries]) =>
    '<section class="recipe-group"><h4>' + escapeText(group) + '</h4><div class="recipe-grid">' + entries.map(renderPlannerRecipeCard).join('') + '</div></section>').join('');
}

function renderPlannerRecipeCard(recipe) {
  const readiness = recipeReadinessLabel(recipe.readiness);
  return '<button class="recipe-card" type="button" data-planner-recipe="' + escapeText(recipe.id) + '" aria-pressed="' +
    (plannerSelection.recipeId === recipe.id ? 'true' : 'false') + '">' +
    '<span class="recipe-card-head"><strong>' + escapeText(recipe.name) + '</strong><span class="state ' + escapeText(recipe.readiness.state) + '">' + escapeText(readiness) + '</span></span>' +
    '<p>' + escapeText(recipe.description) + '</p>' +
    (recipe.readiness.blocker ? '<p class="recipe-blocker">' + escapeText(recipe.readiness.blocker) + '</p>' : '') +
    '<span class="recipe-meta"><span>' + escapeText(recipe.outputStyle) + '</span><span>' + escapeText(recipe.spend.label) + '</span><span>' + escapeText(recipe.owner) + '</span><span>' + escapeText(recipe.runtime) + '</span></span></button>';
}

function choosePlannerRecipe(recipeId) {
  plannerSelection.recipeId = recipeId;
  plannerOptionsDirty = true;
  const recipe = selectedPlannerRecipe();
  setValue('planner-channel', recipe.defaults.channel);
  setValue('planner-duration', recipe.defaults.durationSeconds);
  setValue('planner-quality', recipe.defaults.qualityTier);
  setValue('planner-variants', recipe.defaults.variantCount);
  renderRecipeOptionFields(recipe, Object.fromEntries(recipe.options.map((option) => [option.id, option.default])));
  renderPlanner();
  setFeedback('planner-feedback', recipe.readiness.blocker || 'Film style selected. Review the bounded options, then save the plan.', recipe.readiness.ready ? 'success' : '');
  focusPlannerStep('options');
}

function renderRecipeOptionFields(recipe, values) {
  const box = document.getElementById('planner-recipe-options');
  if (!recipe) { box.innerHTML = ''; return; }
  box.innerHTML = recipe.options.map((option) => {
    const selected = values?.[option.id] ?? option.default;
    if (option.type === 'select') {
      return '<label>' + escapeText(option.label) + '<select data-recipe-option="' + escapeText(option.id) + '">' + option.choices.map((choice) =>
        '<option value="' + escapeText(choice) + '"' + (choice === selected ? ' selected' : '') + '>' + escapeText(choice.replaceAll('-', ' ')) + '</option>').join('') + '</select></label>';
    }
    if (option.type === 'boolean') {
      return '<label class="checkline"><input data-recipe-option="' + escapeText(option.id) + '" type="checkbox"' + (selected ? ' checked' : '') + '> ' + escapeText(option.label) + '</label>';
    }
    return '<label>' + escapeText(option.label) + '<input data-recipe-option="' + escapeText(option.id) + '" value="' + escapeText(selected || '') + '" placeholder="' + escapeText(option.placeholder || '') + '"></label>';
  }).join('');
}

function selectedPlannerRecipe() {
  return plannerData.recipes.find((recipe) => recipe.id === plannerSelection.recipeId) ?? null;
}

function collectPlannerOptions() {
  const values = {};
  for (const input of document.querySelectorAll('[data-recipe-option]')) {
    values[input.dataset.recipeOption] = input.type === 'checkbox' ? input.checked : input.value;
  }
  return {
    channel:value('planner-channel'),
    durationSeconds:Number(value('planner-duration')),
    qualityTier:value('planner-quality'),
    variantCount:Number(value('planner-variants')),
    values,
  };
}

function plannerBrief() {
  if (plannerOptionsDirty) return null;
  if (!activeBrief?.recipeId) return null;
  if (activeBrief.projectSlug !== plannerSelection.projectSlug) return null;
  if (activeBrief.ideaId !== plannerSelection.ideaId) return null;
  if (activeBrief.recipeId !== plannerSelection.recipeId) return null;
  return activeBrief;
}

function renderPlannerTerminal() {
  const state = document.getElementById('planner-state');
  const summary = document.getElementById('planner-summary');
  const blocker = document.getElementById('planner-blocker');
  const save = document.getElementById('planner-save');
  const edit = document.getElementById('planner-edit');
  const build = document.getElementById('planner-build');
  const preview = document.getElementById('planner-preview');
  const post = document.getElementById('planner-post');
  const brief = plannerBrief();
  const recipe = selectedPlannerRecipe();
  for (const button of [save, edit, build, preview, post]) button.classList.remove('primary');
  save.disabled = !recipe;
  save.hidden = Boolean(brief);
  edit.hidden = !brief;
  build.hidden = !brief;
  preview.hidden = !brief;
  post.hidden = !brief;
  edit.disabled = false;
  setPlannerActionState(build, brief?.actions?.build);
  setPlannerActionState(preview, brief?.actions?.preview);
  setPlannerActionState(post, brief?.actions?.post);
  build.textContent = brief?.actions?.build?.label || 'Build preview';
  if (!brief) save.classList.add('primary');
  else if (brief.actions.post.enabled) post.classList.add('primary');
  else if (brief.actions.preview.enabled) preview.classList.add('primary');
  else if (brief.actions.build.enabled) build.classList.add('primary');
  if (!plannerSelection.projectSlug) {
    state.textContent = 'Select a project'; summary.textContent = 'Select a project to begin.'; blocker.textContent = 'Nothing renders when a selection is saved.';
  } else if (!plannerSelection.ideaId) {
    state.textContent = 'Select an idea'; summary.textContent = 'Project selected.'; blocker.textContent = 'Choose or add an idea for this project.';
  } else if (!recipe) {
    state.textContent = 'Select a Film style'; summary.textContent = 'Project and idea selected.'; blocker.textContent = 'Compare output, spend, runtime, and readiness before choosing.';
  } else if (!brief) {
    state.textContent = 'Ready to save'; summary.textContent = recipe.name + ' · ' + recipe.spend.label + ' · ' + recipe.owner;
    blocker.textContent = recipe.readiness.blocker || 'Saving creates a planned brief; it does not run the Film style.';
  } else {
    state.textContent = brief.lifecycle.replaceAll('-', ' '); summary.textContent = recipe.name + ' saved as revision ' + brief.revision + '.';
    blocker.textContent = brief.actions.build.blocker || brief.actions.preview.blocker || brief.actions.post.blocker || 'All terminal actions are ready.';
  }
  state.className = 'state' + (brief ? ' ' + brief.lifecycle : recipe ? ' ' + recipe.readiness.state : '');
}

function setPlannerActionState(button, action) {
  button.disabled = !action?.enabled;
  button.title = action?.enabled ? '' : action?.blocker || 'This action is not available yet.';
  const label = action?.label || button.textContent;
  button.setAttribute('aria-label', action?.enabled ? label : label + ': ' + (action?.blocker || 'not available yet'));
}

async function savePlannerPlan() {
  const recipe = selectedPlannerRecipe();
  if (!recipe) return;
  setBusy('planner-save', true, 'Saving plan…');
  setFeedback('planner-feedback', 'Saving normalized selections. No renderer will run.');
  try {
    activeBrief = await api('/studio/production-plans', {
      method:'POST',
      body:JSON.stringify({
        ...plannerSelection,
        options:collectPlannerOptions(),
        evidence:{
          canonicalUrl:value('planner-source-url') || null,
          destinationUrl:value('planner-destination-url') || null,
          claim:value('planner-claim') || null,
          rightsStatus:value('planner-rights'),
        },
      }),
    });
    plannerOptionsDirty = false;
    await loadBriefs(activeBrief.id);
    renderPlannerTerminal();
    setFeedback('planner-feedback', 'Production plan saved. Choose Edit, build or continuation, Preview, or Prepare in Postiz as evidence permits.', 'success');
  } catch (error) {
    setFeedback('planner-feedback', error.message, 'error');
  } finally {
    setBusy('planner-save', false, 'Save production plan');
    renderPlannerTerminal();
  }
}

async function restorePlannerFromBrief(brief) {
  if (!plannerReady || !brief?.recipeId) return;
  plannerSelection = { projectSlug:brief.projectSlug, ideaId:brief.ideaId, recipeId:brief.recipeId };
  if (!plannerData.ideas.some((idea) => idea.id === brief.ideaId)) await loadProductionPlanner(brief.projectSlug);
  setValue('planner-channel', brief.recipeOptions?.channel || brief.channel);
  setValue('planner-duration', brief.recipeOptions?.durationSeconds || brief.durationSeconds);
  setValue('planner-quality', brief.recipeOptions?.qualityTier || 'standard');
  setValue('planner-variants', brief.recipeOptions?.variantCount || 1);
  setValue('planner-source-url', brief.sourceEvidence?.canonicalUrl || '');
  setValue('planner-destination-url', brief.sourceEvidence?.destinationUrl || '');
  setValue('planner-claim', brief.sourceEvidence?.claim || '');
  setValue('planner-rights', brief.sourceEvidence?.rightsStatus || 'unknown');
  renderRecipeOptionFields(selectedPlannerRecipe(), brief.recipeOptions?.values || {});
  plannerOptionsDirty = false;
  renderPlanner();
}

document.getElementById('planner-idea-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!plannerSelection.projectSlug) return;
  setBusy('planner-add-idea', true, 'Saving…');
  try {
    const idea = await api('/studio/project-ideas', {
      method:'POST',
      body:JSON.stringify({ projectSlug:plannerSelection.projectSlug, title:value('planner-idea-name'), hook:value('planner-idea-hook'), angle:value('planner-idea-angle') }),
    });
    plannerSelection.ideaId = idea.id;
    plannerSelection.recipeId = null;
    plannerOptionsDirty = true;
    await loadProductionPlanner(plannerSelection.projectSlug);
    event.currentTarget.reset();
    event.currentTarget.closest('details').open = false;
    setFeedback('planner-feedback', 'Idea saved and selected. Choose a Film style.', 'success');
    focusPlannerStep('recipe');
  } catch (error) {
    setFeedback('planner-feedback', error.message, 'error');
  } finally {
    setBusy('planner-add-idea', false, 'Save idea');
  }
});

document.getElementById('planner-save').addEventListener('click', savePlannerPlan);
document.getElementById('planner-options').addEventListener('input', () => { plannerOptionsDirty = true; renderPlannerTerminal(); });
document.getElementById('planner-options').addEventListener('change', () => { plannerOptionsDirty = true; renderPlannerTerminal(); });
document.getElementById('planner-edit').addEventListener('click', () => {
  const details = document.getElementById('advanced-brief');
  details.open = true;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  details.scrollIntoView({ behavior:reducedMotion ? 'auto' : 'smooth', block:'start' });
});
document.getElementById('planner-build').addEventListener('click', async () => {
  const brief = plannerBrief();
  const action = brief?.actions?.build;
  if (!action?.enabled) return;
  if (action.kind === 'continue') { window.location.href = action.href; return; }
  setBusy('planner-build', true, 'Building…');
  setFeedback('planner-feedback', 'Building the explicit preview. No distribution action will run.');
  try {
    const result = await api(action.endpoint, { method:'POST', body:JSON.stringify({ confirm:true }) });
    activeBrief = result.brief;
    await loadBriefs(activeBrief.id);
    await restorePlannerFromBrief(activeBrief);
    setFeedback('planner-feedback', 'Preview built. Open Productions to review the real artifact.', 'success');
  } catch (error) {
    setFeedback('planner-feedback', error.message, 'error');
  } finally {
    renderPlannerTerminal();
  }
});
document.getElementById('planner-preview').addEventListener('click', () => { activateView('productions'); });
document.getElementById('planner-post').addEventListener('click', () => {
  const brief = plannerBrief();
  if (!brief) return;
  activateView('distribute');
  document.getElementById('distribution-brief').value = brief.id;
  renderDistribution();
});

document.getElementById('voice-button').addEventListener('click', async () => {
  if (voiceRecorder?.state === 'recording') {
    voiceRecorder.stop();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    setVoiceStatus('Voice recording is not supported in this browser.', 'error');
    return;
  }
  try {
    voiceStream = await navigator.mediaDevices.getUserMedia({ audio:true });
    voiceChunks = [];
    voiceRecorder = new MediaRecorder(voiceStream);
    voiceRecorder.addEventListener('dataavailable', (event) => { if (event.data.size) voiceChunks.push(event.data); });
    voiceRecorder.addEventListener('stop', submitVoiceRecording, { once:true });
    voiceRecorder.start();
    document.getElementById('voice-controls').classList.add('recording');
    document.getElementById('voice-button').textContent = 'Stop';
    setVoiceStatus('Recording locally… press Stop when the idea is complete.');
  } catch (error) {
    setVoiceStatus('Microphone unavailable: ' + error.message, 'error');
  }
});

async function submitVoiceRecording() {
  const mimeType = voiceRecorder?.mimeType || voiceChunks[0]?.type || 'audio/webm';
  const blob = new Blob(voiceChunks, { type:mimeType });
  voiceStream?.getTracks().forEach((track) => track.stop());
  voiceStream = null;
  document.getElementById('voice-controls').classList.remove('recording');
  document.getElementById('voice-button').textContent = 'Talk';
  setVoiceStatus('Saving and checking the local transcription runtime…');
  try {
    const audioBase64 = await blobToBase64(blob);
    const result = await api('/studio/voice-intake', {
      method:'POST',
      body:JSON.stringify({ audioBase64, mimeType }),
    });
    voiceRecording = result.recording;
    voiceSource = {
      kind:'voice', transcript:result.transcript, recordingPath:result.recording.recordingPath,
      transcription:result.evidence,
    };
    document.getElementById('request').value = result.transcript;
    setVoiceStatus('Transcript ready. Edit it above before creating.', 'success');
  } catch (error) {
    voiceRecording = error.payload?.data?.recording ?? null;
    voiceSource = null;
    setVoiceStatus(
      voiceRecording
        ? 'Recording saved locally. No transcription model is ready, so type or paste the request.'
        : error.message,
      voiceRecording ? '' : 'error',
    );
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result).split(',')[1] || ''));
    reader.addEventListener('error', () => reject(reader.error));
    reader.readAsDataURL(blob);
  });
}

function setVoiceStatus(message, state) {
  const status = document.getElementById('voice-status');
  status.textContent = message;
  status.style.color = state === 'error' ? 'var(--risk)' : state === 'success' ? 'var(--verified)' : '';
}

document.getElementById('composer').addEventListener('submit', async (event) => {
  event.preventDefault();
  const requestInput = document.getElementById('request');
  const request = requestInput.value.trim();
  if (!request) return;
  const refining = Boolean(activeBrief);
  setBusy('compose-button', true, refining ? 'Updating workflow…' : 'Planning workflow…');
  setFeedback(
    'compose-feedback',
    refining
      ? 'Applying that direction to a new inspectable workflow version…'
      : 'Choosing a bounded recipe, exact model, and visible production steps…',
  );
  try {
    const fields = quickCreateFields();
    if (refining) {
      if (briefDirty) await saveBrief({ silent:true });
      if (activeBrief.workflowProposal) {
        activeBrief = await api('/studio/briefs/' + encodeURIComponent(activeBrief.id) + '/workflow-proposal/revise', {
          method:'POST', body:JSON.stringify({ instruction:request }),
        });
      } else {
        activeBrief = await api('/studio/briefs/' + encodeURIComponent(activeBrief.id) + '/refine', {
          method:'POST', body:JSON.stringify({ instruction:request }),
        });
      }
    } else {
      const source = voiceSource
        ? { ...voiceSource, transcript:request }
        : voiceRecording
          ? { kind:'voice', transcript:request, recordingPath:voiceRecording.recordingPath, transcription:{ provider:null, localOnly:true, status:'typed-fallback' } }
          : null;
      activeBrief = await api('/studio/briefs', {
        method:'POST',
        body:JSON.stringify({ request, fields, source, mode:'quick' }),
      });
    }
    await loadBriefs(activeBrief.id);
    requestInput.value = '';
    setFeedback(
      'compose-feedback',
      activeBrief.workflowProposal
        ? 'Workflow v' + activeBrief.workflowProposal.version + ' is ready to inspect. Nothing renders until you press Play.'
        : 'Brief updated. Review its registered production path before execution.',
      'success',
    );
  } catch (error) {
    setFeedback('compose-feedback', error.message, 'error');
  } finally {
    setBusy('compose-button', false, activeBrief ? 'Update workflow' : 'Plan workflow');
    refreshComposeAvailability();
  }
});

function quickCreateFields() {
  const fields = {};
  const recipeId = value('quick-recipe');
  const kind = value('quick-kind');
  const duration = value('quick-duration');
  if (recipeId) {
    fields.recipeId = recipeId;
    fields.recipeOptions = duration ? { durationSeconds:Number(duration) } : {};
    fields.themePackId = value('quick-theme') || 'auto';
    fields.modelProfileId = value('quick-model') || 'auto';
    fields.contentScope = value('quick-content-scope') || 'general';
    if (recipeId === 'coherent-local-film') {
      const profileId = fields.modelProfileId;
      const recipe = workflowRecipeForProfile(profileId);
      const durationSeconds = Number(value('quick-shot-duration') || 3.375);
      const frameCount = Math.min(97, 1 + 8 * Math.max(1, Math.round((durationSeconds * 24 - 1) / 8)));
      fields.executionInputs = {
        prompt:value('request'),
        referenceImage:value('quick-reference-image'),
        workflowRecipeId:recipe?.id || '',
        qualityLane:recipe?.qualityLane || 'final',
        seed:value('quick-video-seed') || '2307',
        durationSeconds:String(durationSeconds),
        aspectRatio:'9:16',
        quality:'final',
        width:'512',
        height:'320',
        frames:String(frameCount),
        motionStrength:'0.25',
      };
    }
  }
  if (kind) {
    fields.kind = kind;
    if (kind === 'lyric-video') fields.engine = 'lyric-canvas';
  }
  if (duration && !recipeId) fields.durationSeconds = Number(duration);
  return fields;
}

document.getElementById('plan-local-episode').addEventListener('click', async () => {
  const concept = value('request') || activeBrief?.summary;
  if (!concept) {
    setFeedback('compose-feedback', 'Describe the episode before planning it.', 'error');
    return;
  }
  const selectedCharacter = characters.find((entry) => entry.id === value('quick-character'));
  const referenceImage = value('quick-reference-image');
  const musicPath = value('quick-episode-music');
  const musicEvidence = value('quick-episode-music-evidence');
  if (selectedCharacter && !referenceImage && !(selectedCharacter.references || []).length) {
    setFeedback('compose-feedback', 'Add a reference image path for the selected episode character.', 'error');
    return;
  }
  setBusy('plan-local-episode', true, 'Planning…');
  try {
    activeEpisode = await api('/studio/episodes', {
      method:'POST',
      body:JSON.stringify({
        concept,
        title:concept.split(/[.!?]/)[0].slice(0, 80),
        targetDurationSeconds:Number(value('quick-episode-duration') || 120),
        referenceImage:referenceImage || null,
        cast:selectedCharacter ? [{
          characterId:selectedCharacter.id,
          characterRevision:selectedCharacter.revision,
          voiceId:value('quick-character-voice') || 'af_heart',
          referenceImage:referenceImage || null,
        }] : [],
        soundtrack:musicPath ? {
          lane:'owned-local',
          path:musicPath,
          rightsPosture:musicEvidence ? 'owned' : 'unknown',
          rightsEvidence:musicEvidence || null,
        } : { lane:'procedural-draft', bpm:116 },
      }),
    });
    showAllEpisodeShots = false;
    renderEpisodeWorkspace();
    setFeedback('compose-feedback', 'Episode plan saved. Review the shot list, then generate one shot at a time.', 'success');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('episode-workspace').scrollIntoView({ behavior:reducedMotion ? 'auto' : 'smooth', block:'start' });
  } catch (error) {
    setFeedback('compose-feedback', error.message, 'error');
  } finally {
    setBusy('plan-local-episode', false, 'Plan episode');
  }
});

document.getElementById('interrupt-local-video').addEventListener('click', async () => {
  setBusy('interrupt-local-video', true, 'Stopping…');
  try {
    await api('/studio/local-video/interrupt', { method:'POST', body:JSON.stringify({ confirm:true }) });
    setFeedback('compose-feedback', 'Interrupt sent to the local Comfy queue.', 'success');
  } catch (error) {
    setFeedback('compose-feedback', error.message, 'error');
  } finally {
    setBusy('interrupt-local-video', false, 'Stop active render');
  }
});

function renderEpisodeWorkspace() {
  const workspace = document.getElementById('episode-workspace');
  workspace.hidden = !activeEpisode;
  if (!activeEpisode) return;
  const run = activeEpisode.run || null;
  const accepted = run?.shots?.filter((shot) => shot.reviewState === 'accepted').length || 0;
  const completed = run?.shots?.filter((shot) => shot.videoPath).length || 0;
  document.getElementById('episode-workspace-title').textContent = activeEpisode.title;
  document.getElementById('episode-workspace-summary').textContent = activeEpisode.shots.length + ' shots · ' + activeEpisode.targetDurationSeconds + ' seconds · ' + completed + ' rendered · ' + accepted + ' accepted' + (run ? ' · ' + run.phase + ' phase' : '');
  document.getElementById('episode-shot-list').classList.toggle('show-all', showAllEpisodeShots);
  document.getElementById('episode-toggle-all').textContent = showAllEpisodeShots ? 'Show first 6' : 'Show all ' + activeEpisode.shots.length;
  const rows = activeEpisode.shots.map((shot) => {
    const result = run?.shots?.find((entry) => entry.id === shot.id);
    const state = result?.reviewState || result?.status || 'pending';
    const video = result?.videoPath
      ? '<a class="button" target="_blank" rel="noreferrer" href="/studio/render-file?path=' + encodeURIComponent(result.videoPath) + '">Open video</a>'
      : '';
    const receipt = result?.receiptPath
      ? '<a class="button" target="_blank" rel="noreferrer" href="/studio/render-file?path=' + encodeURIComponent(result.receiptPath) + '">Receipt</a>'
      : '';
    const review = result?.videoPath && state === 'needs-review'
      ? '<button class="button" type="button" data-episode-action="accept" data-shot-id="' + escapeText(shot.id) + '">Accept</button><button class="button" type="button" data-episode-action="reject" data-shot-id="' + escapeText(shot.id) + '">Reject</button>'
      : state === 'rejected' || !result?.videoPath
        ? '<button class="button" type="button" data-episode-action="generate" data-shot-id="' + escapeText(shot.id) + '">Generate</button>'
        : '';
    return '<article class="episode-shot">' +
      '<span class="episode-shot-order">' + String(shot.order).padStart(2, '0') + '</span>' +
      '<div class="episode-shot-copy"><strong>' + escapeText(shot.id + ' · ' + shot.durationSeconds + 's') + '</strong><p>' + escapeText(shot.prompt) + '</p></div>' +
      '<div class="episode-shot-meta"><span class="episode-shot-state ' + escapeText(state) + '">' + escapeText(state.replaceAll('-', ' ')) + '</span>' + video + receipt + review + '</div>' +
      '</article>';
  }).join('');
  document.getElementById('episode-shot-list').innerHTML = rows || '<div class="empty-state">No shots have been planned.</div>';
}

async function refreshActiveEpisode() {
  if (!activeEpisode?.id) return;
  activeEpisode = await api('/studio/episodes/' + encodeURIComponent(activeEpisode.id));
  renderEpisodeWorkspace();
}

async function generateEpisodeShot(shotId) {
  if (!activeEpisode) return;
  setFeedback('episode-feedback', 'Generating ' + shotId + ' serially. The 90% RAM guard remains active…');
  try {
    await api('/studio/episodes/' + encodeURIComponent(activeEpisode.id) + '/render', {
      method:'POST',
      body:JSON.stringify({ confirm:true, shotId, phase:value('episode-phase') }),
    });
    await refreshActiveEpisode();
    setFeedback('episode-feedback', shotId + ' is ready for review.', 'success');
  } catch (error) {
    setFeedback('episode-feedback', error.message, 'error');
  }
}

document.getElementById('episode-shot-list').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-episode-action]');
  if (!button) return;
  const shotId = button.dataset.shotId;
  if (button.dataset.episodeAction === 'generate') {
    button.disabled = true;
    await generateEpisodeShot(shotId);
    return;
  }
  const reviewState = button.dataset.episodeAction === 'accept' ? 'accepted' : 'rejected';
  try {
    await api('/studio/episodes/' + encodeURIComponent(activeEpisode.id) + '/shots/' + encodeURIComponent(shotId) + '/review', {
      method:'POST', body:JSON.stringify({ reviewState }),
    });
    await refreshActiveEpisode();
    setFeedback('episode-feedback', shotId + ' marked ' + reviewState + '.', reviewState === 'accepted' ? 'success' : '');
  } catch (error) {
    setFeedback('episode-feedback', error.message, 'error');
  }
});

document.getElementById('episode-generate-next').addEventListener('click', async () => {
  if (!activeEpisode) return;
  const runShots = activeEpisode.run?.phase === value('episode-phase') ? activeEpisode.run.shots : [];
  const next = activeEpisode.shots.find((shot) => {
    const result = runShots?.find((entry) => entry.id === shot.id);
    return !result?.videoPath || result.reviewState === 'rejected';
  });
  if (!next) {
    setFeedback('episode-feedback', 'Every shot in this phase has a render. Accept or reject the remaining review shots.', 'success');
    return;
  }
  setBusy('episode-generate-next', true, 'Generating…');
  await generateEpisodeShot(next.id);
  setBusy('episode-generate-next', false, 'Generate next shot');
});

document.getElementById('episode-toggle-all').addEventListener('click', () => {
  showAllEpisodeShots = !showAllEpisodeShots;
  renderEpisodeWorkspace();
});

document.getElementById('episode-refresh').addEventListener('click', async () => {
  setBusy('episode-refresh', true, 'Refreshing…');
  try { await refreshActiveEpisode(); } catch (error) { setFeedback('episode-feedback', error.message, 'error'); }
  setBusy('episode-refresh', false, 'Refresh');
});

document.getElementById('episode-assemble').addEventListener('click', async () => {
  if (!activeEpisode) return;
  setBusy('episode-assemble', true, 'Assembling…');
  try {
    const result = await api('/studio/episodes/' + encodeURIComponent(activeEpisode.id) + '/assemble', {
      method:'POST', body:JSON.stringify({ confirm:true }),
    });
    const feedback = document.getElementById('episode-feedback');
    feedback.className = 'feedback episode-feedback success';
    feedback.innerHTML = 'Episode assembled. <a target="_blank" rel="noreferrer" href="/studio/render-file?path=' + encodeURIComponent(result.output.videoPath) + '">Open video</a> · <a target="_blank" rel="noreferrer" href="/studio/render-file?path=' + encodeURIComponent(result.receiptPath) + '">Open receipt</a>';
  } catch (error) {
    setFeedback('episode-feedback', error.message, 'error');
  } finally {
    setBusy('episode-assemble', false, 'Assemble episode');
  }
});

async function loadCharacters(selectedId) {
  characters = await api('/studio/characters');
  renderCharacterOptions(selectedId);
  const quick = document.getElementById('quick-character');
  const previous = quick.value;
  quick.innerHTML = '<option value="">No directory character</option>' +
    characters.map((character) => '<option value="' + escapeText(character.id) + '">' + escapeText(character.name) + ' · revision ' + character.revision + '</option>').join('');
  quick.value = characters.some((character) => character.id === previous) ? previous : '';
}

function renderCharacterOptions(selectedId) {
  const select = document.getElementById('character-select');
  const query = value('character-search').toLowerCase();
  const visible = characters.filter((character) => [
    character.name, character.role, character.sourcePosture, character.likenessPosture,
  ].filter(Boolean).join(' ').toLowerCase().includes(query));
  select.innerHTML = '<option value="">' + (characters.length ? 'Choose a saved character' : 'No saved characters') + '</option>' +
    visible.map((character) => '<option value="' + escapeText(character.id) + '"' + (character.id === selectedId ? ' selected' : '') + '>' +
      escapeText(character.name) + ' · revision ' + character.revision + '</option>').join('');
}

document.getElementById('character-search').addEventListener('input', () => renderCharacterOptions(value('character-select')));

document.getElementById('save-character').addEventListener('click', async () => {
  setBusy('save-character', true, 'Saving…');
  try {
    const character = await api('/studio/characters', {
      method:'POST',
      body:JSON.stringify({
        name:value('character-name'),
        age:Number(value('character-age')),
        adultConfirmed:document.getElementById('character-adult').checked,
        consentPosture:document.getElementById('character-consent').checked ? 'affirmative' : 'unknown',
        fictional:true,
        sourcePosture:'original',
        likenessPosture:'fictional',
        appearance:{ description:value('character-appearance') },
        promptTokens:value('character-tokens').split(',').map((entry) => entry.trim()).filter(Boolean),
        references:[], wardrobe:[], palette:[], negativeConstraints:[],
      }),
    });
    await loadCharacters(character.id);
    setValue('character-name', '');
    setValue('character-appearance', '');
    setValue('character-tokens', '');
    setFeedback('brief-feedback', character.name + ' saved to the character directory.', 'success');
  } catch (error) {
    setFeedback('brief-feedback', error.message, 'error');
  } finally {
    setBusy('save-character', false, 'Save character');
  }
});

document.getElementById('add-character-to-cast').addEventListener('click', () => {
  if (!activeBrief) return setFeedback('brief-feedback', 'Create a brief before adding cast.', 'error');
  const character = characters.find((entry) => entry.id === value('character-select'));
  if (!character) return;
  if (activeBrief.cast?.some((entry) => entry.characterId === character.id)) return;
  activeBrief = { ...activeBrief, cast:[...(activeBrief.cast ?? []), castInstance(character)] };
  renderCast();
  markBriefDirty();
});

function castInstance(character) {
  return {
    schema:'fleet.cast-instance.v1', id:'cast_' + character.id, characterId:character.id,
    characterRevision:character.revision, name:character.name, role:character.role,
    wardrobe:character.wardrobe ?? [], expression:null, continuityNotes:character.continuityNotes,
    sourceSnapshot:structuredClone(character),
  };
}

function renderCast() {
  const box = document.getElementById('cast-list');
  const cast = activeBrief?.cast ?? [];
  box.innerHTML = cast.length ? cast.map((entry, index) => {
    const source = entry.sourceSnapshot || {};
    const matureReady = source.fictional && source.likenessPosture === 'fictional' && source.adultConfirmed && Number(source.age) >= 25 && source.consentPosture === 'affirmative';
    return '<div class="cast-card"><div class="cast-card-head"><div><strong>' + escapeText(entry.name) + '</strong><div class="cast-status">' +
      '<span>' + escapeText(source.sourcePosture || 'unknown source') + '</span><span>' + escapeText(source.likenessPosture || 'unknown likeness') + '</span>' +
      '<span class="' + (matureReady ? 'ready' : 'blocked') + '">' + (matureReady ? 'mature ready' : 'general only') + '</span></div></div>' +
      '<button class="copy" type="button" data-remove-cast="' + index + '">Remove</button></div>' +
      '<div class="cast-fields"><label>Workflow role<input data-cast-index="' + index + '" data-cast-field="role" value="' + escapeText(entry.role || '') + '"></label>' +
      '<label>Expression<input data-cast-index="' + index + '" data-cast-field="expression" value="' + escapeText(entry.expression || '') + '"></label>' +
      '<label>Wardrobe<input data-cast-index="' + index + '" data-cast-field="wardrobe" value="' + escapeText((entry.wardrobe || []).join(', ')) + '"></label>' +
      '<label>Continuity notes<input data-cast-index="' + index + '" data-cast-field="continuityNotes" value="' + escapeText(entry.continuityNotes || '') + '"></label></div></div>';
  }).join('') :
    '<span class="hint">No characters in this reel. Mature-enabled generation requires an explicitly adult fictional cast.</span>';
}

document.getElementById('cast-list').addEventListener('click', (event) => {
  const button = event.target.closest('[data-remove-cast]');
  if (!button || !activeBrief) return;
  activeBrief = { ...activeBrief, cast:activeBrief.cast.filter((_, index) => index !== Number(button.dataset.removeCast)) };
  renderCast();
  markBriefDirty();
});

document.getElementById('cast-list').addEventListener('input', (event) => {
  const input = event.target.closest('[data-cast-field]');
  if (!input || !activeBrief) return;
  const index = Number(input.dataset.castIndex);
  const field = input.dataset.castField;
  const cast = activeBrief.cast.map((entry, entryIndex) => entryIndex === index ? {
    ...entry,
    [field]:field === 'wardrobe' ? input.value.split(',').map((value) => value.trim()).filter(Boolean) : input.value || null,
  } : entry);
  activeBrief = { ...activeBrief, cast };
  markBriefDirty();
});

document.getElementById('soundtrack-lane').addEventListener('change', () => { renderSoundtrackFields(); markBriefDirty(); });

function renderSoundtrackFields() {
  const lane = value('soundtrack-lane');
  document.getElementById('soundtrack-owned-fields').hidden = lane !== 'owned-local';
  document.getElementById('soundtrack-platform-fields').hidden = lane !== 'platform-sound';
  document.getElementById('soundtrack-generated-fields').hidden = lane !== 'generated';
  const generated = activeBrief?.soundtrack?.generated;
  const variationSelect = document.getElementById('soundtrack-selected-variation');
  variationSelect.innerHTML = '<option value="">Generate or select a variation</option>' + (generated?.variations ?? []).map((variation) =>
    '<option value="' + escapeText(variation.id) + '">' + escapeText(variation.id) + (variation.seed == null ? '' : ' · seed ' + variation.seed) + '</option>').join('');
  variationSelect.value = generated?.selectedVariationId || '';
  const boundary = {
    'procedural-draft':'Procedural music is a draft fallback, not final-quality audio.',
    'owned-local':'Only approved local audio with ownership or licence evidence can be mixed.',
    'platform-sound':'Studio exports a silent master; add the referenced sound in the official platform.',
    generated:'Generated music runs only after its named local runtime and model pass preflight.',
  }[lane];
  document.getElementById('soundtrack-boundary').textContent = lane === 'generated' && activeBrief?.soundtrackState?.blocker
    ? activeBrief.soundtrackState.blocker
    : boundary;
}

function collectSoundtrack() {
  const lane = value('soundtrack-lane');
  const soundtrack = {
    lane,
    mix:{
      trimStartSeconds:Number(value('soundtrack-trim-start')), offsetSeconds:Number(value('soundtrack-offset')), loop:document.getElementById('soundtrack-loop').checked,
      fadeInSeconds:Number(value('soundtrack-fade-in')), fadeOutSeconds:Number(value('soundtrack-fade-out')),
      gainDb:Number(value('soundtrack-gain')),
      ducking:{
        enabled:document.getElementById('soundtrack-duck').checked,
        threshold:Number(value('soundtrack-duck-threshold')),
        ratio:Number(value('soundtrack-duck-ratio')),
      },
    },
  };
  if (lane === 'owned-local') soundtrack.ownedLocal = {
    path:value('soundtrack-path'), rightsPosture:value('soundtrack-rights'), rightsEvidence:value('soundtrack-rights-evidence') || null,
  };
  if (lane === 'platform-sound') soundtrack.platformSound = {
    provider:value('soundtrack-provider'), url:value('soundtrack-url'), startSeconds:Number(value('soundtrack-platform-start')),
  };
  if (lane === 'generated') soundtrack.generated = {
    runtimeId:'ace-step-native', prompt:value('soundtrack-prompt'), durationSeconds:Number(value('brief-duration')),
    instrumental:document.getElementById('soundtrack-instrumental').checked,
    bpm:Number(value('soundtrack-bpm')), key:value('soundtrack-key') || null, meter:value('soundtrack-meter') || null,
    referenceAudioPath:value('soundtrack-reference-audio') || null,
    variationCount:Number(value('soundtrack-variations')),
    selectedVariationId:value('soundtrack-selected-variation') || null,
    variations:activeBrief?.soundtrack?.generated?.variations ?? [],
  };
  return soundtrack;
}

document.getElementById('new-brief-button').addEventListener('click', () => {
  if (briefDirty && !window.confirm('Discard unsaved changes to this brief?')) return;
  activeBrief = null;
  activeEpisode = null;
  voiceSource = null;
  voiceRecording = null;
  setVoiceStatus('Talk through the idea, then edit the transcript before creating.');
  showAllWorkflows = false;
  document.getElementById('request').value = '';
  for (const id of ['quick-recipe','quick-kind','quick-duration']) setValue(id, '');
  for (const id of ['quick-theme','quick-model']) setValue(id, 'auto');
  setValue('quick-content-scope', 'general');
  setValue('quick-reference-image', '');
  setValue('quick-video-seed', '2307');
  setValue('quick-shot-duration', '3.375');
  setValue('quick-character', '');
  setValue('quick-episode-duration', '120');
  setValue('quick-episode-music', '');
  setValue('quick-episode-music-evidence', '');
  document.getElementById('episode-workspace').hidden = true;
  document.getElementById('workflow-proposal').hidden = true;
  renderQuickKindSelection();
  renderQuickModelSelection();
  document.getElementById('conversation').innerHTML = '<div class="message empty" role="listitem">Describe the next video. Nothing renders until you confirm its brief.</div>';
  setFeedback('compose-feedback', '');
  setFeedback('brief-feedback', '');
  clearBriefForm();
  renderWorkflowList();
});

const briefForm = document.getElementById('brief-form');
briefForm.addEventListener('input', () => markBriefDirty());
briefForm.addEventListener('change', () => markBriefDirty());
document.getElementById('brief-kind').addEventListener('change', (event) => {
  if (!activeBrief) return;
  activeBrief = { ...activeBrief, kind:event.target.value };
  toggleLyricFields(event.target.value);
  if (event.target.value === 'lyric-video' && !['lyric-canvas','blender'].includes(value('brief-engine'))) {
    setValue('brief-engine', 'lyric-canvas');
  }
  showAllWorkflows = false;
  renderWorkflowList();
});
briefForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await saveBrief();
});
document.getElementById('execute-button').addEventListener('click', executeActiveBrief);
document.getElementById('refresh-productions').addEventListener('click', loadProductions);
document.getElementById('production-search').addEventListener('input', (event) => {
  productionSearch = event.target.value.trim().toLowerCase();
  renderProductionList();
});
document.getElementById('distribution-brief').addEventListener('change', (event) => {
  activeBrief = briefs.find((brief) => brief.id === event.target.value) ?? null;
  if (activeBrief) populateBrief(activeBrief);
  renderDistribution();
});
document.getElementById('prepare-button').addEventListener('click', prepareDistribution);
document.getElementById('draft-button').addEventListener('click', createPostizDraft);
document.getElementById('schedule-button').addEventListener('click', schedulePostiz);
document.getElementById('schedule-time').addEventListener('input', updateScheduleButton);
const studioTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'device local time';
document.getElementById('schedule-timezone').textContent = 'Timezone: ' + studioTimeZone + '. Postiz receives UTC.';

async function loadBriefs(selectedId) {
  briefs = await api('/studio/briefs');
  activeBrief = selectedId === '__new__'
    ? null
    : briefs.find((brief) => brief.id === selectedId)
      ?? briefs.find((brief) => brief.id === activeBrief?.id)
      ?? briefs[0]
      ?? null;
  document.getElementById('brief-count').textContent = briefs.length + (briefs.length === 1 ? ' saved brief' : ' saved briefs');
  if (activeBrief) {
    populateBrief(activeBrief);
    await loadCapabilities();
  } else {
    clearBriefForm();
  }
  populateDistributionSelect();
}

async function loadCapabilities() {
  const suffix = activeBrief ? '?briefId=' + encodeURIComponent(activeBrief.id) : '';
  capabilities = await api('/studio/capabilities' + suffix);
  renderWorkflowList();
}

function populateBrief(brief) {
  activeBrief = brief;
  document.getElementById('advanced-brief').hidden = false;
  setComposerMode(true);
  setValue('quick-recipe', brief.recipeId || '');
  setValue('quick-kind', brief.kind || '');
  setValue('quick-duration', [15,30,45,60].includes(brief.durationSeconds) ? brief.durationSeconds : '');
  setValue('quick-theme', brief.themePackId || 'auto');
  setValue('quick-model', brief.modelProfileId || 'auto');
  setValue('quick-content-scope', brief.contentScope || 'general');
  setValue('quick-reference-image', brief.executionInputs?.referenceImage || '');
  setValue('quick-video-seed', brief.executionInputs?.seed || '2307');
  setValue('quick-shot-duration', brief.executionInputs?.durationSeconds || '3.375');
  renderQuickKindSelection();
  renderQuickModelSelection();
  setValue('brief-kind', brief.kind);
  setValue('brief-project', brief.projectSlug || '');
  setValue('brief-channel', brief.channel);
  setValue('brief-duration', brief.durationSeconds);
  setValue('brief-engine', brief.engine);
  document.getElementById('brief-kind').disabled = Boolean(brief.recipeId);
  document.getElementById('brief-engine').disabled = Boolean(brief.recipeId);
  document.getElementById('brief-project').disabled = Boolean(brief.recipeId);
  setValue('brief-rights', brief.sourceEvidence?.rightsStatus || 'unknown');
  setValue('brief-name', brief.title);
  setValue('brief-hook', brief.hook);
  setValue('brief-summary', brief.summary);
  setValue('brief-direction', brief.creativeDirection || '');
  setValue('brief-cta', brief.cta || '');
  setValue('brief-source-url', brief.sourceEvidence?.canonicalUrl || '');
  setValue('brief-claim', brief.sourceEvidence?.claim || '');
  setValue('brief-destination', brief.sourceEvidence?.destinationUrl || '');
  setValue('brief-public-url', brief.media?.publicUrl || '');
  setValue('lyric-audio-path', brief.lyric?.audioPath || '');
  setValue('lyric-timed-text', typeof brief.lyric?.timedLyrics === 'string' ? brief.lyric.timedLyrics : '');
  setValue('lyric-format', brief.lyric?.timedLyricsFormat || 'lrc');
  setValue('lyric-composition-rights', brief.lyric?.rights?.composition || 'unknown');
  setValue('lyric-master-rights', brief.lyric?.rights?.master || 'unknown');
  setValue('lyric-rights-evidence', brief.lyric?.rights?.evidence || '');
  setValue('lyric-rights-url', brief.lyric?.rights?.evidenceUrl || '');
  setValue('lyric-attribution', brief.lyric?.attribution || '');
  setValue('lyric-visual-style', brief.lyric?.visualStyle === 'kinetic-type' ? 'kinetic-type' : 'literal-cinematic');
  document.getElementById('lyric-reduced-motion').checked = brief.lyric?.reducedMotion === true;
  toggleLyricFields(brief.kind);
  document.getElementById('brief-creative-approved').checked = brief.approval?.creativeStatus === 'approved';
  document.getElementById('brief-quality-accepted').checked = brief.approval?.qualityAccepted === true;
  renderCast();
  setValue('soundtrack-lane', brief.soundtrack?.lane || 'procedural-draft');
  setValue('soundtrack-gain', brief.soundtrack?.mix?.gainDb ?? -8);
  setValue('soundtrack-trim-start', brief.soundtrack?.mix?.trimStartSeconds ?? 0);
  setValue('soundtrack-offset', brief.soundtrack?.mix?.offsetSeconds ?? 0);
  setValue('soundtrack-fade-in', brief.soundtrack?.mix?.fadeInSeconds ?? 0.2);
  setValue('soundtrack-fade-out', brief.soundtrack?.mix?.fadeOutSeconds ?? 0.5);
  document.getElementById('soundtrack-loop').checked = brief.soundtrack?.mix?.loop !== false;
  document.getElementById('soundtrack-duck').checked = brief.soundtrack?.mix?.ducking?.enabled === true;
  setValue('soundtrack-duck-threshold', brief.soundtrack?.mix?.ducking?.threshold ?? 0.08);
  setValue('soundtrack-duck-ratio', brief.soundtrack?.mix?.ducking?.ratio ?? 8);
  setValue('soundtrack-path', brief.soundtrack?.ownedLocal?.path || '');
  setValue('soundtrack-rights', brief.soundtrack?.ownedLocal?.rightsPosture || 'unknown');
  setValue('soundtrack-rights-evidence', brief.soundtrack?.ownedLocal?.rightsEvidence || '');
  setValue('soundtrack-provider', brief.soundtrack?.platformSound?.provider || 'instagram');
  setValue('soundtrack-url', brief.soundtrack?.platformSound?.url || '');
  setValue('soundtrack-platform-start', brief.soundtrack?.platformSound?.startSeconds ?? 0);
  setValue('soundtrack-prompt', brief.soundtrack?.generated?.prompt || '');
  setValue('soundtrack-bpm', brief.soundtrack?.generated?.controls?.bpm ?? 118);
  setValue('soundtrack-key', brief.soundtrack?.generated?.controls?.key || '');
  setValue('soundtrack-meter', brief.soundtrack?.generated?.controls?.meter || '');
  setValue('soundtrack-reference-audio', brief.soundtrack?.generated?.controls?.referenceAudioPath || '');
  setValue('soundtrack-variations', brief.soundtrack?.generated?.variationCount ?? 2);
  document.getElementById('soundtrack-instrumental').checked = brief.soundtrack?.generated?.instrumental !== false;
  renderSoundtrackFields();
  briefDirty = false;
  document.getElementById('save-brief-button').disabled = true;
  renderConversation(brief);
  renderBriefAction(brief);
  renderWorkflowList();
  renderWorkflowProgress();
  renderWorkflowProposal();
  if (plannerReady) {
    if (brief.recipeId) restorePlannerFromBrief(brief).catch((error) => setFeedback('planner-feedback', error.message, 'error'));
    else renderPlannerTerminal();
  }
}

function clearBriefForm() {
  briefDirty = false;
  document.getElementById('advanced-brief').hidden = true;
  setComposerMode(false);
  for (const id of ['brief-project','brief-name','brief-hook','brief-summary','brief-direction','brief-cta','brief-source-url','brief-claim','brief-destination','brief-public-url','lyric-audio-path','lyric-timed-text','lyric-rights-evidence','lyric-rights-url','lyric-attribution']) setValue(id, '');
  setValue('brief-kind', 'faceless');
  setValue('brief-channel', 'youtube_shorts');
  setValue('brief-duration', 60);
  setValue('brief-engine', 'mock');
  setValue('brief-rights', 'unknown');
  document.getElementById('brief-kind').disabled = false;
  document.getElementById('brief-engine').disabled = false;
  document.getElementById('brief-project').disabled = false;
  setValue('lyric-format', 'lrc');
  setValue('lyric-composition-rights', 'unknown');
  setValue('lyric-master-rights', 'unknown');
  setValue('lyric-visual-style', 'literal-cinematic');
  document.getElementById('lyric-reduced-motion').checked = false;
  toggleLyricFields('faceless');
  document.getElementById('brief-creative-approved').checked = false;
  document.getElementById('brief-quality-accepted').checked = false;
  renderCast();
  setValue('soundtrack-lane', 'procedural-draft');
  setValue('soundtrack-gain', -8);
  setValue('soundtrack-trim-start', 0);
  setValue('soundtrack-offset', 0);
  setValue('soundtrack-fade-in', 0.2);
  setValue('soundtrack-fade-out', 0.5);
  document.getElementById('soundtrack-loop').checked = true;
  document.getElementById('soundtrack-duck').checked = false;
  setValue('soundtrack-duck-threshold', 0.08);
  setValue('soundtrack-duck-ratio', 8);
  setValue('soundtrack-platform-start', 0);
  document.getElementById('soundtrack-instrumental').checked = true;
  for (const id of ['soundtrack-path','soundtrack-rights-evidence','soundtrack-url','soundtrack-prompt','soundtrack-key','soundtrack-meter','soundtrack-reference-audio']) setValue(id, '');
  renderSoundtrackFields();
  renderWorkflowProgress();
  renderWorkflowProposal();
  document.getElementById('save-brief-button').disabled = true;
  document.getElementById('execute-button').disabled = true;
  document.getElementById('brief-state').textContent = 'No brief selected';
}

function setComposerMode(refining) {
  document.querySelector('.prompt-studio').classList.toggle('has-proposal', Boolean(refining && activeBrief?.workflowProposal));
  const routeActive = Boolean(refining && activeBrief?.workflowProposal);
  document.querySelector('#view-create > .view-head h2').textContent = routeActive ? 'Your production route.' : 'Describe the video.';
  document.querySelector('#view-create > .view-head p').textContent = routeActive
    ? 'Review what Studio chose, inspect the exact machinery, then run this version or direct a revision.'
    : 'Say what happens, how it should feel, and what the viewer should understand.';
  document.querySelector('label[for="request"]').textContent = refining ? 'How should the workflow change?' : 'What should we make?';
  document.getElementById('request').placeholder = refining
    ? 'For example: make it calmer, use more animation, or shorten the ending.'
    : 'A 30-second cinematic video about a lonely astronaut finding a garden on Mars.';
  document.getElementById('compose-button').textContent = refining ? 'Update workflow' : 'Plan workflow';
  document.getElementById('new-brief-button').textContent = refining ? 'New video' : 'Clear';
}

function renderConversation(brief) {
  const box = document.getElementById('conversation');
  if (!brief.messages?.length) {
    box.innerHTML = '<div class="message empty" role="listitem">This brief has no conversation history.</div>';
    return;
  }
  box.innerHTML = brief.messages.map((message) =>
    '<div class="message ' + (message.role === 'assistant' ? 'assistant' : 'operator') + '" role="listitem" aria-label="' +
    (message.role === 'assistant' ? 'Studio response' : 'Operator message') + '">' +
    escapeText(message.content) + '</div>').join('');
}

function renderWorkflowList() {
  const box = document.getElementById('workflow-list');
  if (!capabilities.length) return;
  const visibleCapabilities = activeBrief && !showAllWorkflows
    ? capabilities.filter((capability) => capability.id === activeBrief.kind)
    : capabilities;
  box.innerHTML = visibleCapabilities.map((capability) =>
    '<button type="button" class="workflow' + (activeBrief?.kind === capability.id ? ' active' : '') + '" data-kind="' + capability.id + '">' +
      '<span><strong>' + escapeText(capability.name) + '</strong><span>' + escapeText(capability.description) + ' · ' + escapeText(capability.owner) + '</span></span>' +
      '<span class="state ' + escapeText(capability.state) + '">' + escapeText(capability.state.replaceAll('-', ' ')) + '</span>' +
    '</button>').join('') +
    (activeBrief && !showAllWorkflows ? '<button class="copy" type="button" data-change-workflow>Change video type</button>' : '');
  box.querySelector('[data-change-workflow]')?.addEventListener('click', () => {
    showAllWorkflows = true;
    renderWorkflowList();
  });
  for (const button of box.querySelectorAll('[data-kind]')) {
    button.addEventListener('click', async () => {
      if (!activeBrief) {
        setValue('brief-kind', button.dataset.kind);
        document.getElementById('request').focus();
        return;
      }
      activeBrief = { ...activeBrief, kind:button.dataset.kind };
      setValue('brief-kind', button.dataset.kind);
      toggleLyricFields(button.dataset.kind);
      if (button.dataset.kind === 'lyric-video' && !['lyric-canvas','blender'].includes(value('brief-engine'))) {
        setValue('brief-engine', 'lyric-canvas');
      }
      showAllWorkflows = false;
      markBriefDirty();
      renderWorkflowList();
    });
  }
}

function renderWorkflowProgress() {
  const root = document.getElementById('workflow-progress');
  const workflow = activeBrief?.workflow;
  root.hidden = !workflow;
  if (!workflow) return;
  const modeButton = document.getElementById('workflow-mode');
  modeButton.textContent = workflow.mode === 'manual' ? 'Use quick mode' : 'Use manual mode';
  modeButton.setAttribute('aria-pressed', String(workflow.mode === 'quick'));
  const rail = document.getElementById('stage-rail');
  rail.innerHTML = workflow.stages.map((stage) =>
    '<button class="stage-card ' + escapeText(stage.status) + '" type="button" data-workflow-stage="' + escapeText(stage.id) + '"' +
    (['ready','failed','blocked'].includes(stage.status) ? '' : ' disabled') + '><strong>' + escapeText(stage.label) + '</strong><small>' +
    escapeText(stage.status) + '</small>' + ((stage.blockers?.[0] || stage.error)
      ? '<span>' + escapeText(stage.blockers?.[0] || stage.error) + '</span>' : '') + '</button>').join('');
  for (const button of rail.querySelectorAll('[data-workflow-stage]:not([disabled])')) {
    button.addEventListener('click', () => advanceWorkflowStage(button.dataset.workflowStage));
  }
}

function renderWorkflowProposal() {
  const root = document.getElementById('workflow-proposal');
  const proposal = activeBrief?.workflowProposal;
  root.hidden = !proposal;
  if (!proposal) return;
  document.getElementById('workflow-proposal-title').textContent = proposal.name + ' · v' + proposal.version;
  document.getElementById('workflow-proposal-reason').textContent = proposal.selectionReason + ' ' + proposal.description;
  const state = document.getElementById('workflow-proposal-state');
  state.textContent = proposal.readiness.ready ? 'Ready to run' : 'Needs input';
  state.className = 'state ' + (proposal.readiness.ready ? 'ready' : 'needs-input');
  document.getElementById('workflow-proposal-summary').innerHTML = [
    ['Model', proposal.binding.modelProfileId],
    ['Lane', proposal.lane],
    ['Format', proposal.inputs.aspectRatio + ' · ' + proposal.inputs.durationSeconds + 's'],
    ['Estimate', proposal.generationEstimate?.label || 'Host-dependent'],
    ['Seed', proposal.inputs.seed],
  ].map((entry) => '<div class="proposal-metric"><span>' + escapeText(entry[0]) + '</span><strong>' + escapeText(entry[1]) + '</strong></div>').join('');
  document.getElementById('workflow-proposal-phases').innerHTML = proposal.phases.map((phase) =>
    '<div class="proposal-phase"><small>' + escapeText(phase.owner) + '</small><strong>' +
    escapeText(phase.name) + '</strong><p>' + escapeText(phase.detail) + '</p></div>').join('');
  const blocker = document.getElementById('workflow-proposal-blocker');
  blocker.hidden = proposal.readiness.ready;
  document.getElementById('workflow-proposal-blocker-copy').textContent = proposal.readiness.blocker || '';
  setValue('workflow-proposal-reference', proposal.inputs.referenceImage || '');
  document.getElementById('workflow-proposal-models').innerHTML = [
    ['Workflow recipe', proposal.binding.workflowRecipeId + ' · v' + (proposal.binding.recipeVersion || '—')],
    ['Runtime', proposal.binding.engine || 'Unavailable'],
    ['Model profile', proposal.binding.modelProfileId],
    ['Resource guard', 'Disk ≤ ' + proposal.resourceEnvelope.maxDiskPercent + '% · RAM ≤ ' + proposal.resourceEnvelope.maxRamPercent + '% · serial'],
    ['Graph scope', proposal.sharedGraphDisclosure],
  ].map((entry) => '<div class="proposal-model-row"><strong>' + escapeText(entry[0]) + '</strong><span>' + escapeText(entry[1]) + '</span></div>').join('');
  const play = document.getElementById('workflow-proposal-play');
  play.disabled = !proposal.readiness.ready || proposal.state === 'playing';
  play.textContent = proposal.state === 'playing' ? 'Rendering…' : proposal.state === 'played' ? 'Run again' : 'Run this plan';
  document.getElementById('workflow-proposal-comfy-result').hidden = true;
  document.getElementById('workflow-proposal-comfy-result').innerHTML = '';
  setFeedback('workflow-proposal-feedback', proposal.lastRevision
    ? 'Updated from v' + proposal.lastRevision.fromVersion + ': ' + proposal.lastRevision.changes.map((entry) => entry.field).join(', ') + '.'
    : '', proposal.lastRevision ? 'success' : '');
}

async function reviseWorkflowProposal(instruction) {
  if (!activeBrief?.workflowProposal) return;
  const text = String(instruction || '').trim();
  if (!text) throw new Error('Describe the workflow change.');
  setBusy('workflow-proposal-revise-button', true, 'Updating…');
  try {
    activeBrief = await api('/studio/briefs/' + encodeURIComponent(activeBrief.id) + '/workflow-proposal/revise', {
      method:'POST', body:JSON.stringify({ instruction:text }),
    });
    await loadBriefs(activeBrief.id);
    setValue('workflow-proposal-instruction', '');
  } finally {
    setBusy('workflow-proposal-revise-button', false, 'Revise plan');
  }
}

document.getElementById('workflow-proposal-revise').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await reviseWorkflowProposal(value('workflow-proposal-instruction'));
  } catch (error) {
    setFeedback('workflow-proposal-feedback', error.message, 'error');
  }
});

document.getElementById('workflow-proposal-reference-save').addEventListener('click', async () => {
  try {
    const reference = value('workflow-proposal-reference');
    if (!reference.startsWith('/')) throw new Error('Use an absolute local image path.');
    await reviseWorkflowProposal('Set reference to: ' + reference);
  } catch (error) {
    setFeedback('workflow-proposal-feedback', error.message, 'error');
  }
});

document.getElementById('workflow-proposal-new').addEventListener('click', () => {
  document.getElementById('new-brief-button').click();
});

document.getElementById('workflow-proposal-comfy').addEventListener('click', async () => {
  if (!activeBrief?.workflowProposal) return;
  const button = document.getElementById('workflow-proposal-comfy');
  setBusy(button.id, true, 'Inspecting…');
  try {
    const inspection = await api('/studio/briefs/' + encodeURIComponent(activeBrief.id) + '/workflow-proposal/graph');
    const box = document.getElementById('workflow-proposal-comfy-result');
    box.hidden = false;
    if (!inspection.comfy.available) {
      box.innerHTML = '<p class="hint">' + escapeText(inspection.comfy.reason) + '</p>';
    } else {
      box.innerHTML = '<p class="hint">' + inspection.comfy.nodes.length + ' pinned nodes · ' + inspection.comfy.edges.length + ' connections · graph ' + escapeText(inspection.recipe.graphSha256?.slice(0, 12) || 'unhashed') + '</p>' +
        '<div class="comfy-node-list">' + inspection.comfy.nodes.map((node) => '<div class="comfy-node"><strong>' + escapeText(node.id + ' · ' + node.type) + '</strong><span>' + escapeText(node.inputs.join(', ')) + '</span></div>').join('') + '</div>' +
        '<details><summary>Raw Comfy API JSON</summary><pre class="comfy-json">' + escapeText(JSON.stringify(inspection.comfy.graph, null, 2)) + '</pre></details>';
    }
  } catch (error) {
    setFeedback('workflow-proposal-feedback', error.message, 'error');
  } finally {
    setBusy(button.id, false, 'Inspect runtime graph');
  }
});

document.getElementById('workflow-proposal-play').addEventListener('click', async () => {
  const proposal = activeBrief?.workflowProposal;
  if (!proposal) return;
  setBusy('workflow-proposal-play', true, 'Rendering v' + proposal.version + '…');
  setFeedback('workflow-proposal-feedback', 'The exact v' + proposal.version + ' plan is now frozen. Rendering one job locally…');
  try {
    const result = await api('/studio/briefs/' + encodeURIComponent(activeBrief.id) + '/workflow-proposal/play', {
      method:'POST', body:JSON.stringify({ confirm:true, version:proposal.version }),
    });
    activeBrief = result.brief;
    await loadBriefs(activeBrief.id);
    if (result.executed) {
      selectedProductionId = activeBrief.id;
      activateView('productions');
    }
  } catch (error) {
    setFeedback('workflow-proposal-feedback', error.message, 'error');
  } finally {
    setBusy('workflow-proposal-play', false, 'Run this plan');
  }
});

document.getElementById('workflow-mode').addEventListener('click', async () => {
  if (!activeBrief?.workflow) return;
  const mode = activeBrief.workflow.mode === 'manual' ? 'quick' : 'manual';
  try {
    activeBrief = await api('/studio/briefs/' + encodeURIComponent(activeBrief.id) + '/workflow', {
      method:'PATCH', body:JSON.stringify({ mode, paused:false }),
    });
    await loadBriefs(activeBrief.id);
    setFeedback('workflow-feedback', mode === 'quick'
      ? 'Quick mode selected. Create may advance runnable production actions automatically.'
      : 'Manual mode selected. Confirm each ready stage explicitly.', 'success');
  } catch (error) {
    setFeedback('workflow-feedback', error.message, 'error');
  }
});

async function advanceWorkflowStage(stageId) {
  const stage = activeBrief?.workflow?.stages.find((entry) => entry.id === stageId);
  if (!stage || !['ready','failed','blocked'].includes(stage.status)) return;
  setFeedback('workflow-feedback', 'Running ' + stage.label.toLowerCase() + '…');
  try {
    if (briefDirty) await saveBrief({ silent:true });
    activeBrief = await api('/studio/briefs/' + encodeURIComponent(activeBrief.id) + '/workflow/' + encodeURIComponent(stageId), {
      method:'POST',
      body:JSON.stringify({
        actionId:stage.actionId,
        operation:stage.status === 'ready' ? 'run' : 'retry',
        confirmGeneration:stageId === 'generation',
      }),
    });
    const run = activeBrief.workflowRun;
    await loadBriefs(activeBrief.id);
    if (run?.error) setFeedback('workflow-feedback', run.error, 'error');
    else if (run?.blocker) setFeedback('workflow-feedback', run.blocker);
    else setFeedback('workflow-feedback', run?.executed?.map((id) => id.replaceAll('-', ' ')).join(', ') + ' completed.', 'success');
    if (activeBrief.media?.videoPath) {
      selectedProductionId = activeBrief.id;
      activateView('productions');
    }
  } catch (error) {
    setFeedback('workflow-feedback', error.message, 'error');
  }
}

function collectBriefPatch() {
  const kind = value('brief-kind');
  return {
    kind,
    projectSlug:value('brief-project') || null,
    channel:value('brief-channel'),
    durationSeconds:Number(value('brief-duration')),
    recipeOptions:activeBrief?.recipeId ? {
      ...(activeBrief.recipeOptions || {}),
      channel:value('brief-channel'),
      durationSeconds:Number(value('brief-duration')),
    } : undefined,
    themePackId:activeBrief?.recipeId ? value('quick-theme') || 'auto' : undefined,
    modelProfileId:activeBrief?.recipeId ? value('quick-model') || 'auto' : undefined,
    contentScope:activeBrief?.recipeId ? value('quick-content-scope') || 'general' : undefined,
    engine:value('brief-engine'),
    title:value('brief-name'),
    hook:value('brief-hook'),
    summary:value('brief-summary'),
    creativeDirection:value('brief-direction') || null,
    cast:activeBrief?.cast ?? [],
    soundtrack:collectSoundtrack(),
    cta:value('brief-cta') || null,
    sourceEvidence:{
      canonicalUrl:value('brief-source-url') || null,
      claim:value('brief-claim') || null,
      destinationUrl:value('brief-destination') || null,
      rightsStatus:value('brief-rights'),
    },
    approval:{
      creativeStatus:document.getElementById('brief-creative-approved').checked ? 'approved' : 'proposed',
      qualityAccepted:document.getElementById('brief-quality-accepted').checked,
    },
    media:activeBrief?.media ? {
      publicUrl:value('brief-public-url') || null,
    } : null,
    lyric:kind === 'lyric-video' ? {
      audioPath:value('lyric-audio-path') || null,
      timedLyrics:value('lyric-timed-text') || null,
      timedLyricsFormat:value('lyric-format'),
      attribution:value('lyric-attribution') || null,
      rights:{
        composition:value('lyric-composition-rights'),
        master:value('lyric-master-rights'),
        evidence:value('lyric-rights-evidence') || null,
        evidenceUrl:value('lyric-rights-url') || null,
      },
      visualStyle:value('lyric-visual-style'),
      useBlender:value('brief-engine') === 'blender',
      reducedMotion:document.getElementById('lyric-reduced-motion').checked,
    } : null,
  };
}

async function saveBrief(options) {
  if (!activeBrief) return null;
  setBusy('save-brief-button', true, 'Saving…');
  try {
    activeBrief = await api('/studio/briefs/' + encodeURIComponent(activeBrief.id), {
      method:'PATCH',
      body:JSON.stringify(collectBriefPatch()),
    });
    briefDirty = false;
    await loadBriefs(activeBrief.id);
    if (!options?.silent) setFeedback('brief-feedback', 'Brief saved as revision ' + activeBrief.revision + '.', 'success');
    return activeBrief;
  } catch (error) {
    setFeedback('brief-feedback', error.message, 'error');
    throw error;
  } finally {
    setBusy('save-brief-button', false, 'Save brief');
    document.getElementById('save-brief-button').disabled = !briefDirty;
  }
}

function markBriefDirty() {
  if (!activeBrief) return;
  briefDirty = true;
  document.getElementById('save-brief-button').disabled = false;
  const state = document.getElementById('brief-state');
  if (!state.textContent.includes('unsaved changes')) state.append(' · unsaved changes');
}

function renderBriefAction(brief) {
  const action = document.getElementById('execute-button');
  const continuation = brief.continuation;
  action.textContent = continuation?.label || 'Continue';
  action.disabled = !continuation || ['needs-input','blocked'].includes(continuation.state) || brief.lifecycle === 'producing';
  document.getElementById('brief-state').innerHTML =
    '<span class="state ' + escapeText(brief.lifecycle) + '">' + escapeText(brief.lifecycle.replaceAll('-', ' ')) + '</span>' +
    ' · revision ' + brief.revision + (continuation?.blocker ? ' · ' + escapeText(continuation.blocker) : '');
  document.getElementById('brief-subtitle').textContent = brief.generation?.source === 'llm'
    ? 'LLM-shaped brief. Every field remains operator-editable.'
    : 'Template-shaped brief. Every field remains operator-editable.';
}

async function executeActiveBrief() {
  if (!activeBrief) return;
  try {
    await saveBrief({ silent:true });
    if (!['faceless','lyric-video'].includes(activeBrief.kind)) {
      const destination = activeBrief.continuation?.href;
      if (!destination) throw new Error(activeBrief.continuation?.blocker || 'Continuation is not ready');
      window.location.href = destination;
      return;
    }
    setBusy('execute-button', true, activeBrief.kind === 'lyric-video' ? 'Rendering lyrics…' : 'Creating video…');
    setFeedback('brief-feedback', activeBrief.kind === 'lyric-video'
      ? 'Rendering exact timed lyrics and literal scenes. No distribution action will run.'
      : 'Rendering the confirmed brief. No distribution action will run.');
    const result = await api('/studio/briefs/' + encodeURIComponent(activeBrief.id) + '/execute', {
      method:'POST',
      body:JSON.stringify({ confirm:true }),
    });
    activeBrief = result.brief;
    await loadBriefs(activeBrief.id);
    setFeedback('brief-feedback', 'Video created. Review it in Productions before distribution.', 'success');
  } catch (error) {
    setFeedback('brief-feedback', error.message, 'error');
  } finally {
    renderBriefAction(activeBrief);
  }
}

async function loadHistory() {
  const showcase = document.getElementById('history-showcase');
  showcase.innerHTML = '<div class="loading-line"></div>';
  try {
    historyEntries = await api('/studio/history');
    const available = historyEntries.find((entry) => entry.video) || historyEntries[0] || null;
    if (!historyEntries.some((entry) => entry.id === activeHistoryId)) activeHistoryId = available?.id ?? null;
    renderHistory();
  } catch (error) {
    showcase.innerHTML = '<div class="empty-state">Could not read film history: ' + escapeText(error.message) + '</div>';
  }
}

function renderHistory() {
  const strip = document.getElementById('history-filmstrip');
  const ledger = document.getElementById('history-ledger-list');
  if (!historyEntries.length) {
    document.getElementById('history-showcase').innerHTML = '<div class="empty-state"><strong>No production history yet.</strong><p>Create a video and its prompt, workflow, and artifact will remain together here.</p><button class="button primary" type="button" data-history-create>Make your first video</button></div>';
    strip.innerHTML = '';
    ledger.innerHTML = '<div class="empty-state">No saved Studio history yet.</div>';
    return;
  }

  const entry = historyEntries.find((item) => item.id === activeHistoryId)
    || historyEntries.find((item) => item.video)
    || historyEntries[0];
  activeHistoryId = entry.id;
  const workflow = entry.workflow;
  const phases = workflow?.phases?.length ? workflow.phases : [
    { name:'Brief', detail:'Saved request and creative intent' },
    { name:'Plan', detail:'Selected recipe and production route' },
    { name:'Generate', detail:'Bound runtime and model' },
    { name:'Review', detail:'Artifact and execution evidence' },
  ];
  const picture = entry.video
    ? '<div class="history-picture"><span class="history-video-label">Reviewable video</span><video controls playsinline preload="metadata" aria-label="Video: ' + escapeText(entry.title) + '" src="/studio/render-file?path=' + encodeURIComponent(entry.video.path) + '"></video></div>'
    : '<div class="history-picture"><div class="history-picture-empty"><div><strong>No playable video</strong><p>' + escapeText(entry.videoUnavailableReason || 'This production keeps its request and workflow here while it waits for a reviewable artifact.') + '</p></div></div></div>';
  const entryIndex = historyEntries.findIndex((item) => item.id === entry.id);
  document.getElementById('history-showcase').innerHTML = picture +
    '<article class="history-story"><div class="history-story-topline"><span>Production ' + escapeText(String(entryIndex + 1)) + ' of ' + escapeText(String(historyEntries.length)) + '</span><span>·</span><span>' + escapeText(entry.quality?.verdict || entry.lifecycle || 'saved') + '</span></div>' +
    '<h3>' + escapeText(entry.title) + '</h3>' +
    '<div class="history-section"><strong>Prompt</strong><p class="history-prompt">' + escapeText(entry.prompt || 'No prompt was saved for this production.') + '</p></div>' +
    '<div class="history-section"><strong>Workflow</strong><div><div class="history-workflow-meta"><span><strong>' + escapeText(workflow?.name || 'Workflow not recorded') + '</strong></span>' +
    (workflow?.modelProfileId ? '<span>' + escapeText(workflow.modelProfileId) + '</span>' : '') +
    (workflow?.seed != null ? '<span>seed ' + escapeText(String(workflow.seed)) + '</span>' : '') +
    (workflow?.aspectRatio ? '<span>' + escapeText(workflow.aspectRatio) + '</span>' : '') + '</div>' +
    '<div class="history-route">' + phases.slice(0, 4).map((phase, index) => '<div class="history-route-step"><span>0' + (index + 1) + '</span><strong>' + escapeText(phase.name) + '</strong></div>').join('') + '</div></div></div>' +
    '<div class="history-actions">' + (entry.video ? '<a class="button primary" target="_blank" rel="noreferrer" href="/studio/render-file?path=' + encodeURIComponent(entry.video.path) + '">Open video</a>' : '') +
    (entry.receiptPath ? '<a class="button" target="_blank" rel="noreferrer" href="/studio/render-file?path=' + encodeURIComponent(entry.receiptPath) + '">Execution receipt</a>' : '') +
    '<button class="button" type="button" data-history-edit="' + escapeText(entry.id) + '">Modify in Create</button></div></article>';

  strip.innerHTML = historyEntries.slice(0, 8).map((item, index) => {
    const status = item.video ? 'Video' : (item.lifecycle || 'Saved').replaceAll('-', ' ');
    return '<button type="button" data-history-select="' + escapeText(item.id) + '" aria-current="' + String(item.id === activeHistoryId) + '"><span>' + String(index + 1).padStart(2, '0') + ' · ' + escapeText(status) + '</span><strong>' + escapeText(item.title) + '</strong></button>';
  }).join('');
  ledger.innerHTML = historyEntries.map((item) =>
    '<article class="history-ledger-row"><time datetime="' + escapeText(item.updatedAt) + '">' + escapeText(new Date(item.updatedAt).toLocaleDateString(undefined, { day:'numeric', month:'short', year:'numeric' })) + '</time><div><h4>' + escapeText(item.title) + '</h4><p>' + escapeText(item.prompt) + '</p></div><div class="button-row">' +
    (item.video ? '<button class="button" type="button" data-history-select="' + escapeText(item.id) + '">Watch</button>' : '<span class="state">' + escapeText(item.lifecycle) + '</span>') +
    '<button class="button" type="button" data-history-edit="' + escapeText(item.id) + '">Edit</button></div></article>').join('');
}

document.getElementById('view-history').addEventListener('click', (event) => {
  const select = event.target.closest('[data-history-select]');
  if (select) {
    activeHistoryId = select.dataset.historySelect;
    renderHistory();
    document.getElementById('history-showcase').scrollIntoView({ block:'start', behavior:'smooth' });
    return;
  }
  if (event.target.closest('[data-history-create]')) {
    activateView('create');
    document.getElementById('request').focus();
    return;
  }
  const edit = event.target.closest('[data-history-edit]');
  if (edit) {
    activeBrief = briefs.find((brief) => brief.id === edit.dataset.historyEdit) || null;
    if (activeBrief) populateBrief(activeBrief);
    activateView('create');
    document.getElementById('request').focus();
    return;
  }
});

document.getElementById('history-operations').addEventListener('toggle', (event) => {
  if (event.currentTarget.open) loadProductions();
});

async function loadRecipeLibrary() {
  try {
    recipeLibrary = await api('/studio/recipe-library');
    activeRecipeId = recipeLibrary.recipes.some((recipe) => recipe.id === activeRecipeId) ? activeRecipeId : recipeLibrary.recipes[0]?.id;
    renderRecipeLibrary();
  } catch (error) {
    document.getElementById('recipe-library-detail').innerHTML = '<div class="empty-state">Could not read recipes: ' + escapeText(error.message) + '</div>';
  }
}

function renderRecipeLibrary() {
  const recipes = recipeLibrary.recipes || [];
  const recipe = recipes.find((item) => item.id === activeRecipeId) || recipes[0];
  document.getElementById('recipe-library-index').innerHTML = recipes.map((item) => '<button type="button" data-recipe-select="' + escapeText(item.id) + '" aria-current="' + String(item.id === recipe?.id) + '"><strong>' + escapeText(item.name) + '</strong><span>' + escapeText(recipeReadinessLabel(item.readiness)) + '</span></button>').join('');
  if (!recipe) {
    document.getElementById('recipe-library-detail').innerHTML = '<div class="empty-state">No recipes are registered.</div>';
    return;
  }
  const controls = recipe.controls?.length ? recipe.controls.map((control) => '<span>' + escapeText(control.label) + '</span>').join('') : '<span>Prompt-directed</span>';
  const counts = recipes.reduce((result, item) => {
    const state = item.readiness?.state || 'unknown';
    result[state] = (result[state] || 0) + 1;
    return result;
  }, {});
  const readinessSummary = String(counts.ready || 0) + ' create here · ' + String(counts['external-step'] || 0) + ' handoffs · ' + String(counts['needs-input'] || 0) + ' optional inputs · ' + String(counts['needs-runtime'] || 0) + ' optional local setups';
  document.getElementById('recipe-library-detail').innerHTML = '<p class="library-kicker">' + escapeText(recipeReadinessLabel(recipe.readiness)) + ' · ' + escapeText(recipe.kind || 'video') + '</p><h3>' + escapeText(recipe.name) + '</h3><p class="library-description">' + escapeText(recipe.description) + '</p>' +
    '<div class="library-facts"><div class="library-fact"><span>Runtime</span><strong>' + escapeText(recipe.runtime || 'Auto') + '</strong></div><div class="library-fact"><span>Delivery</span><strong>' + escapeText(recipe.delivery?.label || recipe.delivery?.kind || 'Studio output') + '</strong></div><div class="library-fact"><span>Variations</span><strong>' + escapeText(String(recipe.variantCount || 1)) + '</strong></div></div>' +
    '<section class="library-controls"><h4>Creative controls</h4><div class="library-control-list">' + controls + '</div></section>' +
    '<p class="library-note">Library status: ' + escapeText(readinessSummary) + '.</p>' +
    (recipe.readiness?.blocker ? '<p class="library-note">What this option needs: ' + escapeText(recipe.readiness.blocker) + '</p>' : '') +
    '<div class="library-actions"><button class="button primary" type="button" data-use-recipe="' + escapeText(recipe.id) + '">Use this recipe</button></div>';
}

function recipeReadinessLabel(readiness) {
  if (readiness?.state === 'ready') return 'Ready here';
  if (readiness?.state === 'external-step') return 'Opens specialist tool';
  if (readiness?.state === 'needs-input') return 'Bring your own media';
  if (readiness?.state === 'needs-runtime') return 'Optional local setup';
  return 'Registered';
}

document.getElementById('view-recipes').addEventListener('click', (event) => {
  const select = event.target.closest('[data-recipe-select]');
  if (select) { activeRecipeId = select.dataset.recipeSelect; renderRecipeLibrary(); return; }
  const use = event.target.closest('[data-use-recipe]');
  if (!use) return;
  const recipe = recipeLibrary.recipes.find((item) => item.id === use.dataset.useRecipe);
  const quickRecipe = document.getElementById('quick-recipe');
  if ([...quickRecipe.options].some((option) => option.value === recipe.id)) quickRecipe.value = recipe.id;
  document.getElementById('request').value = 'Create a ' + recipe.name + '. ' + recipe.description;
  activateView('create');
  document.getElementById('request').focus();
});

async function loadWorkflowLibrary() {
  try {
    workflowLibrary = await api('/studio/workflow-library');
    activeWorkflowId = workflowLibrary.some((workflow) => workflow.id === activeWorkflowId) ? activeWorkflowId : workflowLibrary[0]?.id;
    renderWorkflowLibrary();
  } catch (error) {
    document.getElementById('workflow-library-detail').innerHTML = '<div class="empty-state">Could not read workflows: ' + escapeText(error.message) + '</div>';
  }
}

function renderWorkflowLibrary() {
  const workflow = workflowLibrary.find((item) => item.id === activeWorkflowId) || workflowLibrary[0];
  document.getElementById('workflow-library-index').innerHTML = workflowLibrary.map((item) => '<button type="button" data-workflow-select="' + escapeText(item.id) + '" aria-current="' + String(item.id === workflow?.id) + '"><strong>' + escapeText(item.name) + '</strong><span>' + escapeText(item.shotGrammar) + '</span></button>').join('');
  if (!workflow) {
    document.getElementById('workflow-library-detail').innerHTML = '<div class="empty-state">No workflows are registered.</div>';
    return;
  }
  const finalLane = workflow.lanes?.final || {};
  const previewLane = workflow.lanes?.preview || {};
  document.getElementById('workflow-library-detail').innerHTML = '<p class="library-kicker">Version ' + escapeText(String(workflow.version)) + ' · auto-routable</p><h3>' + escapeText(workflow.name) + '</h3><p class="library-description">' + escapeText(workflow.description) + '</p>' +
    '<div class="library-facts"><div class="library-fact"><span>Shot grammar</span><strong>' + escapeText(workflow.shotGrammar) + '</strong></div><div class="library-fact"><span>Final model</span><strong>' + escapeText(finalLane.modelProfileId || 'Unbound') + '</strong></div><div class="library-fact"><span>Est. final</span><strong>' + escapeText(finalLane.generationEstimate?.label || 'Host-dependent') + '</strong></div></div>' +
    '<section class="library-controls"><h4>Recognized intent</h4><div class="library-control-list">' + (workflow.intentTags || []).map((tag) => '<span>' + escapeText(tag) + '</span>').join('') + '</div></section>' +
    '<section class="library-route"><h4>Execution route</h4><div class="history-route"><div><span>01</span><strong>Direct shot</strong></div><div><span>02</span><strong>Condition subject</strong></div><div><span>03</span><strong>' + escapeText(finalLane.modelProfileId || 'Generate') + '</strong></div><div><span>04</span><strong>Review evidence</strong></div></div></section>' +
    '<p class="library-note">Final recipe: ' + escapeText(finalLane.workflowRecipeId || 'unbound') + ' · ' + escapeText(finalLane.engine || 'unbound engine') + ' · graph ' + escapeText(finalLane.graphSha256 ? finalLane.graphSha256.slice(0, 12) : 'not registered') + '. Preview model: ' + escapeText(previewLane.modelProfileId || 'unbound') + ' · ' + escapeText(previewLane.generationEstimate?.label || 'host-dependent timing') + '. Default shot: ' + escapeText(workflow.defaultAspectRatio) + ' at ' + escapeText(String(workflow.defaultDurationSeconds)) + ' seconds. Prompt guide: ' + escapeText(workflow.promptGuide) + '</p><div class="library-actions"><button class="button primary" type="button" data-use-workflow="' + escapeText(workflow.id) + '">Use this workflow</button></div>';
}

document.getElementById('view-workflows').addEventListener('click', (event) => {
  const select = event.target.closest('[data-workflow-select]');
  if (select) { activeWorkflowId = select.dataset.workflowSelect; renderWorkflowLibrary(); return; }
  const use = event.target.closest('[data-use-workflow]');
  if (!use) return;
  const workflow = workflowLibrary.find((item) => item.id === use.dataset.useWorkflow);
  document.getElementById('request').value = 'Use the ' + workflow.name + ' workflow: ' + workflow.promptGuide + '. ';
  activateView('create');
  document.getElementById('request').focus();
});

async function loadProductions() {
  const box = document.getElementById('production-list');
  resetPlatformPreviewPlayers();
  box.innerHTML = '<div class="loading-line"></div><div class="loading-line"></div>';
  try {
    const [data, status, policies] = await Promise.all([
      api('/studio/productions'),
      api('/studio/autopilot/status'),
      api('/studio/autopilot/policies'),
    ]);
    productionData = data;
    briefs = data.briefs;
    autopilotStatus = status;
    automationPolicies = policies.policies || [];
    renderLaneConsole();
    renderProductionList();
    initializePlatformPreviews();
  } catch (error) {
    box.innerHTML = '<div class="empty-state">Could not read productions: ' + escapeText(error.message) + '</div>';
    document.getElementById('lane-ledger').innerHTML = '<div><strong>Lane status unavailable</strong><p>' + escapeText(error.message) + '</p></div>';
  }
}

function renderProductionList() {
  const box = document.getElementById('production-list');
  resetPlatformPreviewPlayers();
  const filtered = productionData.briefs.filter((brief) => {
    if (activeProductionLane !== 'all' && contentLane(brief) !== activeProductionLane) return false;
    if (!productionSearch) return true;
    return [brief.title, brief.summary, brief.projectSlug, brief.recipe?.name, brief.recipeId]
      .some((candidate) => String(candidate || '').toLowerCase().includes(productionSearch));
  });
  const showLegacy = activeProductionLane === 'all' || activeProductionLane === 'operator-request';
  if (!filtered.length && (!showLegacy || (!productionData.legacyRenders.length && !productionData.episodes.length))) {
    box.innerHTML = '<div class="empty-state"><strong>No ' + escapeText(laneLabel(activeProductionLane).toLowerCase()) + ' productions yet.</strong><br>' +
      (activeProductionLane === 'project-automation'
        ? 'Run an enabled project policy from the factory CLI or local automation endpoint; progress will appear here.'
        : activeProductionLane === 'personal-automation'
          ? 'Personal automation policies can use this lane when they are configured.'
          : 'Start in Create or choose another content lane.') + '</div>';
    return;
  }
  const ready = filtered.filter(hasReviewArtifact);
  const pending = filtered.filter((brief) => !hasReviewArtifact(brief));
  const selected = ready.find((brief) => brief.id === selectedProductionId)
    || ready.find((brief) => brief.id === activeBrief?.id)
    || ready[0];
  selectedProductionId = selected?.id || null;
  const readySection = selected
    ? '<section aria-labelledby="ready-videos-title"><div class="video-section-head"><div><h3 id="ready-videos-title">Now showing</h3><p>Watch the selected render, then move through the compact library below.</p></div><span>' +
      escapeText(String(ready.length)) + (ready.length === 1 ? ' playable video' : ' playable videos') + '</span></div><div class="ready-productions">' +
      renderProduction(selected, { featured:true }) + '</div><div class="video-section-head"><div><h3>Video library</h3><p>Choose any completed artifact without loading every player at once.</p></div></div><div class="video-library-index">' +
      ready.map((brief) => renderVideoLibraryRow(brief, brief.id === selected.id)).join('') + '</div></section>'
    : '<div class="empty-state"><strong>No playable videos in this lane yet.</strong><br>Completed renders will appear here automatically.</div>';
  const pendingSection = pending.length
    ? '<details class="pending-productions"><summary>Drafts and incomplete plans<span>' + escapeText(String(pending.length)) +
      ' saved without a playable video</span></summary><div class="production-plan-list">' + pending.map(renderPendingProduction).join('') + '</div></details>'
    : '';
  const legacyItems = showLegacy ? productionData.legacyRenders.map((render) =>
      '<article class="production"><div class="production-info"><h3>' + escapeText(render.title) + '</h3><p>Legacy Studio render · ' + escapeText(render.provider || 'unknown engine') + '</p></div><div class="production-media">' +
      (render.video ? '<video controls preload="metadata" src="/studio/render-file?path=' + encodeURIComponent(render.video) + '"></video>' : '<div class="empty-state">' + escapeText(render.videoUnavailableReason || 'No playable artifact') + '</div>') + '</div>' +
      '</article>').join('') : '';
  const legacy = legacyItems
    ? '<details class="legacy-productions"><summary>Previous local renders · ' + escapeText(String(productionData.legacyRenders.length)) + '</summary>' + legacyItems + '</details>'
    : '';
  const episodes = showLegacy && productionData.episodes?.length
    ? '<section aria-labelledby="episode-productions-title"><div class="video-section-head"><div><h3 id="episode-productions-title">Episodes</h3><p>Multi-shot local work, including progress and final assemblies.</p></div><span>' + escapeText(String(productionData.episodes.length)) + '</span></div><div class="production-plan-list">' +
      productionData.episodes.map(renderEpisodeProduction).join('') + '</div></section>'
    : '';
  box.innerHTML = '<div class="production-list">' + readySection + episodes + pendingSection + legacy + '</div>';
  initializePlatformPreviews();
}

function renderEpisodeProduction(episode) {
  const run = episode.run;
  const completed = run?.shots?.filter((shot) => shot.videoPath).length || 0;
  const accepted = run?.shots?.filter((shot) => shot.reviewState === 'accepted').length || 0;
  const videoPath = episode.assembly?.output?.videoPath;
  return '<article class="production-plan"><div><h3>' + escapeText(episode.title) + '</h3><p>' +
    escapeText(episode.targetDurationSeconds + ' seconds · ' + episode.shots.length + ' shots · ' + completed + ' rendered · ' + accepted + ' accepted' + (run ? ' · ' + run.phase + ' phase' : '')) +
    '</p><div class="production-meta"><span class="state ' + (videoPath ? 'ready' : 'needs-review') + '">' + escapeText(videoPath ? 'assembled' : run?.status || 'planned') + '</span>' +
    '<span class="state">local episode</span></div></div><div class="production-plan-actions">' +
    '<button class="button" type="button" data-open-episode="' + escapeText(episode.id) + '">Open workflow</button>' +
    (videoPath ? '<a class="button primary" target="_blank" rel="noreferrer" href="/studio/render-file?path=' + encodeURIComponent(videoPath) + '">Open video</a>' : '') +
    (episode.assembly?.receiptPath ? '<a class="button" target="_blank" rel="noreferrer" href="/studio/render-file?path=' + encodeURIComponent(episode.assembly.receiptPath) + '">Receipt</a>' : '') +
    '</div></article>';
}

function hasReviewArtifact(brief) {
  return Boolean(brief.media?.videoPath || brief.media?.platformAudio || (brief.media?.previewPath && brief.media?.previewType));
}

function renderVideoLibraryRow(brief, selected) {
  const quality = brief.media?.quality;
  const runtime = brief.recipe?.runtime || brief.recipe?.name || brief.kind.replaceAll('-', ' ');
  return '<article class="video-library-row" aria-current="' + String(selected) + '"><div><h4>' + escapeText(brief.title) + '</h4><p>' +
    escapeText(runtime) + ' · ' + escapeText(String(brief.durationSeconds)) + ' seconds · ' + escapeText(brief.channel.replaceAll('_', ' ')) + '</p></div>' +
    '<div class="video-library-row-meta"><span class="state ' + (quality?.verdict === 'pass' ? 'ready' : 'needs-review') + '">' +
    escapeText(quality?.verdict === 'pass' ? 'quality passed' : brief.lifecycle.replaceAll('-', ' ')) + '</span>' +
    '<button class="button" type="button" data-watch-brief="' + escapeText(brief.id) + '"' + (selected ? ' disabled' : '') + '>' +
    (selected ? 'Now showing' : 'Watch') + '</button></div></article>';
}

function renderPendingProduction(brief) {
  const lane = contentLane(brief);
  const nextStep = brief.media?.videoUnavailableReason || brief.continuation?.blocker || 'This plan has not produced a playable artifact yet.';
  return '<article class="production-plan"><div><h3>' + escapeText(brief.title) + '</h3><p>' + escapeText(brief.summary || nextStep) + '</p>' +
    '<div class="production-meta"><span class="state ' + escapeText(brief.lifecycle) + '">' + escapeText(brief.lifecycle.replaceAll('-', ' ')) + '</span>' +
    '<span class="state">' + escapeText(laneLabel(lane)) + '</span><span class="state">' + escapeText(brief.recipe?.name || brief.kind.replaceAll('-', ' ')) + '</span></div></div>' +
    '<div class="production-plan-actions"><button class="button" type="button" data-edit-brief="' + escapeText(brief.id) + '">Edit brief</button>' +
    (brief.continuation?.href ? '<a class="button" href="' + escapeText(brief.continuation.href) + '">' + escapeText(brief.continuation.label) + '</a>' : '') +
    '</div></article>';
}

function renderLaneConsole() {
  const counts = { 'project-automation':0, 'operator-request':0, 'personal-automation':0 };
  for (const brief of productionData.briefs) counts[contentLane(brief)] += 1;
  for (const button of document.querySelectorAll('[data-production-lane]')) {
    button.dataset.count = String(button.dataset.productionLane === 'all'
      ? productionData.briefs.length
      : counts[button.dataset.productionLane] || 0);
  }
  const rows = [
    ['project-automation', 'Project Autopilot', 'Scheduled and event-driven work governed by project policies.'],
    ['operator-request', 'Ask Me', 'Productions created from an operator request or planning session.'],
    ['personal-automation', 'Personal Automations', 'Automated non-project content under a personal policy.'],
  ];
  document.getElementById('lane-ledger').innerHTML = rows.map(([id, label, description]) =>
    '<div><strong>' + escapeText(label) + '<span>' + escapeText(String(counts[id] || 0)) + '</span></strong><p>' + escapeText(description) + '</p></div>'
  ).join('');
  const exceptions = autopilotStatus?.exceptions || [];
  const policies = automationPolicies.filter((policy) => policy.enabled);
  const note = document.getElementById('automation-note');
  const policySummary = policies.map((policy) => policy.label + ' r' + policy.revision + ' · ' + policy.trigger.cadence + ' · Postiz ' + policy.distribution.mode).join(' / ');
  if (!exceptions.length) {
    note.innerHTML = '<p class="automation-note">' + escapeText(policySummary || 'No automation policies are enabled.') + '</p>';
    return;
  }
  note.innerHTML = '<details class="automation-note"><summary>' + escapeText(String(exceptions.length)) + ' automation ' + (exceptions.length === 1 ? 'item needs' : 'items need') + ' attention</summary><ul>' +
    exceptions.map((exception) => '<li><strong>' + escapeText(exception.title) + '</strong> · ' + escapeText(exception.nextAction || exception.error || 'Review the automation state.') + '</li>').join('') +
    '</ul><p>' + escapeText(policySummary) + '</p></details>';
}

function renderProduction(brief, options = {}) {
  const quality = brief.media?.quality;
  const platformAudio = brief.media?.platformAudio;
  const media = platformAudio
    ? renderPlatformAudioReview(brief, platformAudio)
    : brief.media?.videoPath
    ? '<video controls playsinline preload="metadata" aria-label="' + escapeText(brief.title) + ' video" src="/studio/render-file?path=' + encodeURIComponent(brief.media.videoPath) + '#t=0.1"></video>'
    : brief.media?.previewType === 'html' && brief.media?.previewPath
    ? '<iframe title="' + escapeText(brief.title) + ' composition preview" src="/studio/render-file?path=' + encodeURIComponent(brief.media.previewPath) + '"></iframe>'
    : brief.media?.previewType === 'image' && brief.media?.previewPath
    ? '<img alt="' + escapeText(brief.title) + ' generated preview" src="/studio/render-file?path=' + encodeURIComponent(brief.media.previewPath) + '">'
    : '<div class="empty-state">' + escapeText(brief.continuation?.blocker || 'No render artifact yet.') + '</div>';
  const lyricEvidence = brief.kind === 'lyric-video'
    ? '<dl class="production-evidence" aria-label="Lyric production evidence">' +
      '<div><dt>Composition</dt><dd>' + escapeText(brief.lyric?.rights?.composition || 'not established') + '</dd></div>' +
      '<div><dt>Recording</dt><dd>' + escapeText(brief.lyric?.rights?.master || 'not established') + '</dd></div>' +
      '<div><dt>Evidence</dt><dd>' + escapeText(brief.lyric?.rights?.evidence || brief.lyric?.rights?.evidenceUrl || 'missing') + '</dd></div>' +
      '<div><dt>Timed text</dt><dd>' + escapeText((brief.lyric?.timedLyricsFormat || 'unknown').toUpperCase()) + '</dd></div>' +
      '<div style="grid-column:1/-1"><dt>Attribution</dt><dd>' + escapeText(brief.lyric?.attribution || 'missing') + '</dd></div>' +
      '</dl>'
    : '';
  const platformSetup = brief.media?.videoPath ? renderPlatformAudioSetup(brief, { open: options.featured }) : '';
  const channelLabel = brief.channel === 'youtube_shorts'
    ? 'YouTube Shorts'
    : brief.channel === 'instagram_reels'
      ? 'Instagram Reels'
      : brief.channel.replaceAll('_', ' ');
  const summary = platformAudio
    ? escapeText(String(platformAudio.reference?.durationSeconds || brief.durationSeconds)) + 's AI animation · silent export · official sound review'
    : escapeText(brief.summary);
  const continuationLabel = platformAudio && brief.continuation?.owner === 'Forge'
    ? 'Review and approve in Forge'
    : brief.continuation?.label;
  const lane = contentLane(brief);
  const automationEvidence = lane === 'operator-request' ? '' : renderAutomationEvidence(brief);
  const workflowEvidence = renderWorkflowEvidence(brief);
  const editorialDecision = options.featured ? renderEditorialDecision(brief) : '';
  return '<article class="production' + (platformAudio ? ' platform-audio-production' : '') + (options.featured ? ' featured' : '') + '">' +
    '<div class="production-info"><h3>' + escapeText(brief.title) + '</h3>' +
    '<p>' + (platformAudio
      ? 'AI animation · ' + escapeText(channelLabel)
      : escapeText(brief.recipe?.name || brief.kind.replaceAll('-', ' ')) + ' · ' + escapeText(brief.projectSlug || 'brand not selected') + ' · ' + escapeText(brief.channel.replaceAll('_', ' '))) + '</p>' +
    '<p>' + summary + '</p>' +
    '<div class="production-meta"><span class="state ' + escapeText(brief.lifecycle) + '">' + escapeText(brief.lifecycle.replaceAll('-', ' ')) + '</span>' +
    '<span class="state">' + escapeText(laneLabel(lane)) + '</span>' +
    (brief.contentScope === 'mature-enabled' ? '<span class="state needs-review">private mature review</span>' : '') +
    (!platformAudio ? '<span class="state">' + escapeText(brief.recipe?.owner || brief.continuation?.owner || 'Studio') + ' owns next step</span>' : '') +
    (brief.recipe ? '<span class="state">' + escapeText(brief.recipe.spend.label) + '</span><span class="state">' + escapeText(brief.recipe.runtime) + '</span>' : '') +
    (quality ? '<span class="state ' + (quality.verdict === 'pass' ? 'ready' : 'needs-review') + '">quality ' + escapeText(quality.verdict) + (quality.overall ? ' · ' + quality.overall : '') + '</span>' : '') +
    (platformAudio ? '<span class="state ready">verified silent · ' + escapeText(String(platformAudio.reference?.durationSeconds || brief.durationSeconds)) + 's</span>' : '') +
    (brief.kind === 'lyric-video' ? '<span class="state">' + escapeText(String(brief.lyric?.cues?.length || 0)) + ' exact cues</span><span class="state">' + (brief.media?.blender ? 'Blender ' + escapeText(brief.media.blender.version || 'ready') : 'native lyric plates') + '</span>' : '') +
    '</div>' + automationEvidence + workflowEvidence + lyricEvidence + editorialDecision + '<div class="button-row" style="margin-top:14px"><button class="button" type="button" data-edit-brief="' + escapeText(brief.id) + '">Edit brief</button>' +
    (brief.kind === 'lyric-video' && brief.media?.videoPath ? '<button class="button primary" type="button" data-review-brief="' + escapeText(brief.id) + '">Review lyric video</button>' : '') +
    (brief.continuation?.href ? '<a class="button" href="' + escapeText(brief.continuation.href) + '">' + escapeText(continuationLabel) + '</a>' : '') +
    (brief.media?.videoPath ? '<a class="button' + (options.featured ? ' primary' : '') + '" href="/studio/render-file?path=' + encodeURIComponent(brief.media.videoPath) + '" target="_blank" rel="noreferrer">Open video</a>' : '') +
    '</div>' + platformSetup + '</div><div class="production-media">' + media + '</div></article>';
}

function renderEditorialDecision(brief) {
  const decision = brief.approval?.reviewDecision || (brief.approval?.qualityAccepted ? 'accepted' : 'pending');
  const history = brief.approval?.reviewHistory || [];
  const reviewedAt = brief.approval?.reviewedAt
    ? ' · ' + new Date(brief.approval.reviewedAt).toLocaleString()
    : '';
  const guidance = decision === 'accepted'
    ? 'Accepted for the next approved handoff. The artifact, evidence, and exact production contract remain attached.'
    : decision === 'rejected'
      ? 'Rejected. Regenerate or replace the artifact before accepting it.'
      : decision === 'revisions-requested'
        ? 'Revisions requested. The current artifact remains available as evidence.'
        : 'Watch the complete artifact, inspect its evidence, then make an explicit editorial decision.';
  return '<section class="editorial-decision" aria-label="Editorial decision"><div><strong>Editorial decision</strong><p>' + escapeText(guidance) + '</p>' +
    '<span class="editorial-history">Current decision: ' + escapeText(decision.replaceAll('-', ' ')) + escapeText(reviewedAt) + '</span>' +
    (history.length ? '<details><summary class="editorial-history">Decision history · ' + escapeText(String(history.length)) + '</summary><ol>' + history.slice().reverse().map((entry) =>
      '<li class="editorial-history">' + escapeText(entry.decision.replaceAll('-', ' ') + ' · revision ' + entry.briefRevision + ' · ' + new Date(entry.at).toLocaleString() + ' · ' + (entry.artifactSha256 || 'unhashed legacy artifact')) + '</li>').join('') + '</ol></details>' : '') + '</div>' +
    '<div class="button-row"><button class="button primary" type="button" data-review-decision="accepted" data-brief-id="' + escapeText(brief.id) + '"' + (decision === 'accepted' ? ' disabled' : '') + '>Accept</button>' +
    '<button class="button" type="button" data-review-decision="revisions-requested" data-brief-id="' + escapeText(brief.id) + '">Revise</button>' +
    '<button class="button danger" type="button" data-review-decision="rejected" data-brief-id="' + escapeText(brief.id) + '">Reject</button></div></section>';
}

function renderWorkflowEvidence(brief) {
  const stages = brief.workflow?.stages ?? [];
  const completed = stages.filter((stage) => stage.status === 'completed').length;
  const cast = brief.cast?.length
    ? brief.cast.map((entry) => entry.name + ' r' + entry.characterRevision).join(', ')
    : 'No reusable cast';
  const model = brief.modelSelection?.profile?.name || brief.modelProfileId || brief.media?.provider || 'not selected';
  const workflowRecipeId = brief.executionInputs?.workflowRecipeId || workflowRecipeForProfile(brief.modelProfileId)?.id;
  const workflowStyle = modelOptions.workflowRecipes?.find((entry) => entry.id === workflowRecipeId);
  const filmStyle = workflowStyle
    ? workflowStyle.name + '@' + workflowStyle.version
    : brief.recipe
      ? brief.recipe.name + '@' + brief.recipe.version
      : 'not resolved';
  const filmStyleReadiness = workflowStyle?.readiness?.state || brief.recipe?.readiness?.state || 'unknown readiness';
  const soundtrack = brief.soundtrack?.lane === 'procedural-draft'
    ? 'procedural draft · blocks final distribution'
    : (brief.soundtrack?.lane || 'not selected').replaceAll('-', ' ');
  const distribution = brief.contentScope === 'mature-enabled'
    ? 'private review only until normal approvals and evidence pass'
    : brief.distribution?.receipt ? 'distribution receipt present' : 'not distributed';
  return '<dl class="production-evidence" aria-label="Workflow evidence">' +
    '<div><dt>Film style</dt><dd>' + escapeText(filmStyle + ' · ' + filmStyleReadiness.replaceAll('-', ' ')) + '</dd></div>' +
    '<div><dt>Workflow</dt><dd>' + completed + ' / ' + stages.length + ' stages complete</dd></div>' +
    '<div><dt>Cast</dt><dd>' + escapeText(cast) + '</dd></div>' +
    '<div><dt>Model</dt><dd>' + escapeText(model) + '</dd></div>' +
    '<div><dt>Soundtrack</dt><dd>' + escapeText(soundtrack) + '</dd></div>' +
    '<div style="grid-column:1/-1"><dt>Distribution</dt><dd>' + escapeText(distribution) + '</dd></div>' +
    '</dl>';
}

function renderAutomationEvidence(brief) {
  const trigger = brief.origin?.trigger || {};
  const source = brief.origin?.source || {};
  const automation = brief.automation || {};
  const spend = brief.recipe?.spend?.label || automation.selectedRecipe?.spend?.label || 'not selected';
  const quality = brief.media?.quality?.verdict || 'not checked';
  const distribution = automation.distributionState || (brief.distribution?.receipt ? 'submitted' : 'not prepared');
  return '<dl class="production-evidence automation-evidence" aria-label="Automation evidence">' +
    '<div><dt>Policy</dt><dd>' + escapeText((trigger.automationPolicyId || 'unknown') + ' · r' + (trigger.automationPolicyRevision || '?')) + '</dd></div>' +
    '<div><dt>Source</dt><dd>' + escapeText((source.adapter || 'unknown') + ' · ' + (source.sourceId || 'unknown') + ' · r' + (source.revision || 1)) + '</dd></div>' +
    '<div><dt>Film style and spend</dt><dd>' + escapeText((brief.recipe?.name || automation.selectedRecipe?.name || 'not selected') + ' · ' + spend) + '</dd></div>' +
    '<div><dt>Quality</dt><dd>' + escapeText(quality) + '</dd></div>' +
    '<div><dt>Distribution</dt><dd>' + escapeText(distribution.replaceAll('-', ' ')) + '</dd></div>' +
    '<div><dt>Attempts</dt><dd>' + escapeText(String(automation.attempts?.length || 0)) + ' / policy limit</dd></div>' +
    '<div class="recovery"><dt>Next recovery action</dt><dd>' + escapeText(automation.nextAction || 'No recovery action is required.') + '</dd></div>' +
    '</dl>';
}

function contentLane(brief) {
  return brief?.origin?.lane || 'operator-request';
}

function laneLabel(lane) {
  return {
    all:'All',
    'project-automation':'Project Autopilot',
    'operator-request':'Ask Me',
    'personal-automation':'Personal Automations',
  }[lane] || 'Ask Me';
}

function renderPlatformAudioSetup(brief, options = {}) {
  const reference = brief.media?.platformAudio?.reference || {};
  const selectedPreset = PLATFORM_SOUND_PRESETS.find((preset) => preset.videoId === reference.videoId) || (!reference.videoId ? PLATFORM_SOUND_PRESETS[0] : null);
  const defaults = selectedPreset
    ? { ...selectedPreset, startSeconds:Number(reference.startSeconds ?? selectedPreset.startSeconds) }
    : {
        id:'custom',
        artist:reference.artist || '',
        title:reference.title || '',
        videoId:reference.videoId || '',
        startSeconds:Number(reference.startSeconds || 0),
      };
  const optionsHtml = PLATFORM_SOUND_PRESETS.map((preset) => '<option value="' + preset.id + '"' + (preset.id === defaults.id ? ' selected' : '') + '>' + escapeText(preset.title + ' — ' + preset.artist + ' · ' + preset.mood) + '</option>').join('') +
    '<option value="custom"' + (defaults.id === 'custom' ? ' selected' : '') + '>Use another YouTube song…</option>';
  return '<details class="platform-audio-setup"' + (options.open ? ' open' : '') + '><summary>' + (reference.videoId ? 'Change soundtrack' : 'Play music with this video') + '</summary>' +
    '<form class="platform-audio-form" data-platform-audio-form data-brief-id="' + escapeText(brief.id) + '">' +
    '<label class="wide">Soundtrack<select name="soundtrackPreset" data-soundtrack-preset>' + optionsHtml + '</select></label>' +
    '<p class="soundtrack-preset-note wide">Recognizable songs stream in the official Spotify player; YouTube remains the sound reference for final attachment.</p>' +
    '<details class="soundtrack-custom"' + (defaults.id === 'custom' ? ' open' : '') + '><summary>Use or edit a YouTube song</summary><div class="soundtrack-custom-fields">' +
    '<label>Artist<input name="artist" required value="' + escapeText(defaults.artist) + '" placeholder="Artist"></label>' +
    '<label>Track title<input name="title" required value="' + escapeText(defaults.title) + '" placeholder="Track title"></label>' +
    '<label class="wide">YouTube URL<input name="youtubeUrl" type="url" required value="' + escapeText(defaults.videoId ? 'https://www.youtube.com/watch?v=' + defaults.videoId : '') + '" placeholder="https://www.youtube.com/watch?v=..."></label>' +
    '<label>Spotify track ID <span class="optional">(optional playback)</span><input name="spotifyTrackId" minlength="22" maxlength="22" value="' + escapeText(defaults.spotifyTrackId || reference.spotifyTrackId || '') + '" placeholder="22-character track ID"></label>' +
    '</div></details>' +
    '<label>Song start (seconds)<input name="startSeconds" required type="number" min="0" max="21600" step=".1" value="' + escapeText(String(defaults.startSeconds)) + '"></label>' +
    '<label>Preview duration<input name="durationSeconds" required type="number" min="5" max="60" step="1" value="30"></label>' +
    '<label>Attach sound in<select name="targetPlatform"><option value="youtube_shorts"' + (brief.channel === 'youtube_shorts' ? ' selected' : '') + '>YouTube Shorts</option><option value="instagram_reels"' + (brief.channel === 'instagram_reels' ? ' selected' : '') + '>Instagram Reels</option><option value="tiktok">TikTok</option></select></label>' +
    '<p class="hint wide">The song and video play together here. The generated upload master stays silent so you can attach the official sound in Shorts, Reels, or TikTok.</p>' +
    '<div class="button-row wide"><button class="button primary" type="submit">Play song with video</button></div>' +
    '<div class="feedback wide" aria-live="polite"></div></form></details>';
}

function renderPlatformAudioReview(brief, preview) {
  const reference = preview.reference || {};
  const receipt = preview.receiptPath ? 'verified receipt' : 'missing receipt';
  const silentMasterPath = preview.silentMasterPath || brief.media?.videoPath;
  const reviewProvider = reference.reviewProvider || (reference.spotifyTrackId ? 'spotify' : 'youtube');
  const syncGuidance = reviewProvider === 'spotify'
    ? 'Spotify previews the selected sound. Confirm final timing in the destination platform.'
    : 'YouTube streams the selected sound for synchronized review. Export stays silent.';
  const previewId = 'platform-' + brief.id.replace(/[^A-Za-z0-9_-]/g, '-');
  return '<section class="platform-audio-review" data-platform-preview data-preview-id="' + escapeText(previewId) + '" data-review-provider="' + escapeText(reviewProvider) + '" data-video-id="' + escapeText(reference.videoId || '') + '" data-spotify-track-id="' + escapeText(reference.spotifyTrackId || '') + '" data-start-seconds="' + escapeText(String(reference.startSeconds || 0)) + '" data-duration-seconds="' + escapeText(String(reference.durationSeconds || brief.durationSeconds)) + '">' +
    '<div class="sync-stage">' +
    '<div class="soundtrack-now"><span>Playing alongside this video</span><strong>' + escapeText(reference.title || 'Selected song') + ' — ' + escapeText(reference.artist || 'Unknown artist') + '</strong></div>' +
    '<div class="sync-controls"><button class="button primary" type="button" data-platform-play aria-pressed="false">Play synchronized preview</button><button class="button" type="button" data-platform-restart>Restart</button><span class="sync-status" data-sync-status aria-live="polite">Loading the official player…</span></div>' +
    '<p class="sync-guidance">' + syncGuidance + '</p>' +
    '<div class="sync-source"><span>Official sound source</span><div class="' + (reviewProvider === 'spotify' ? 'spotify-player' : 'youtube-player') + '" ' + (reviewProvider === 'spotify' ? 'data-spotify-player' : 'data-youtube-player') + ' id="' + escapeText(previewId) + '-' + escapeText(reviewProvider) + '"></div></div>' +
    '<div class="sync-visual"><span>Silent upload master</span><video muted playsinline preload="metadata" src="/studio/render-file?path=' + encodeURIComponent(silentMasterPath) + '"></video></div>' +
    '<div class="silent-proof"><div><span>Export</span><strong>No audio stream</strong></div><div><span>Evidence</span><strong>' + (preview.receiptPath ? '<a href="/studio/render-file?path=' + encodeURIComponent(preview.receiptPath) + '" target="_blank" rel="noreferrer">' + escapeText(receipt) + ' →</a>' : escapeText(receipt)) + '</strong></div><div><span>Preview start</span><strong>' + formatSeconds(reference.startSeconds || 0) + ' · ' + escapeText(String(reference.durationSeconds || brief.durationSeconds)) + 's</strong></div></div>' +
    '<p class="platform-handoff"><strong>YouTube Shorts handoff:</strong> start near ' + formatSeconds(reference.startSeconds || 0) + ' for ' + escapeText(String(reference.durationSeconds || brief.durationSeconds)) + 's, then confirm the exact sound and timing in-platform. Spotify is review-only.</p></div></section>';
}

function formatSeconds(value) {
  const seconds = Math.max(0, Number(value) || 0);
  return Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
}

function ensureYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;
  youtubeApiPromise = new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previous === 'function') previous();
      resolve(window.YT);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      youtubeApiPromise = null;
      for (const status of document.querySelectorAll('[data-sync-status]')) status.textContent = 'Official player could not load. The silent master remains available.';
    };
    document.head.append(script);
  });
  return youtubeApiPromise;
}

function ensureSpotifyApi() {
  if (window.SpotifyIframeApi) return Promise.resolve(window.SpotifyIframeApi);
  if (spotifyApiPromise) return spotifyApiPromise;
  spotifyApiPromise = new Promise((resolve) => {
    const previous = window.onSpotifyIframeApiReady;
    window.onSpotifyIframeApiReady = (api) => {
      window.SpotifyIframeApi = api;
      if (typeof previous === 'function') previous(api);
      resolve(api);
    };
    const script = document.createElement('script');
    script.src = 'https://open.spotify.com/embed/iframe-api/v1';
    script.async = true;
    script.onerror = () => {
      spotifyApiPromise = null;
      for (const status of document.querySelectorAll('[data-sync-status]')) status.textContent = 'The official Spotify player could not load. The silent master remains available.';
    };
    document.head.append(script);
  });
  return spotifyApiPromise;
}

function initializePlatformPreviews() {
  const roots = Array.from(document.querySelectorAll('[data-platform-preview]'));
  if (!roots.length) return;
  const spotifyRoots = roots.filter((root) => root.dataset.reviewProvider === 'spotify');
  const youtubeRoots = roots.filter((root) => root.dataset.reviewProvider !== 'spotify');
  if (spotifyRoots.length) ensureSpotifyApi().then((api) => {
    for (const root of spotifyRoots) initializeSpotifyPreview(root, api);
  });
  if (youtubeRoots.length) ensureYouTubeApi().then(() => {
    for (const root of youtubeRoots) initializeYouTubePreview(root);
  });
}

function initializeYouTubePreview(root) {
  const id = root.dataset.previewId;
  if (platformPreviewPlayers.has(id)) return;
  const visual = root.querySelector('video');
  const status = root.querySelector('[data-sync-status]');
  const startSeconds = Number(root.dataset.startSeconds || 0);
  const durationSeconds = Number(root.dataset.durationSeconds || 30);
  const state = { root, visual, status, startSeconds, durationSeconds, interval:null, ready:false, isPlaying:false, player:null, provider:'youtube' };
  state.player = new YT.Player(root.querySelector('[data-youtube-player]'), {
    host:'https://www.youtube-nocookie.com',
    videoId:root.dataset.videoId,
    playerVars:{ controls:1, playsinline:1, rel:0, start:Math.floor(startSeconds), origin:window.location.origin, widget_referrer:window.location.href },
    events:{
      onReady:() => {
        state.ready = true;
        status.textContent = 'Ready · sound streams from YouTube; export stays silent.';
      },
      onStateChange:(event) => synchronizePlatformState(state, event.data),
      onError:(event) => {
        const blocked = [101, 150].includes(Number(event.data));
        status.textContent = blocked
          ? 'This official upload blocks embedding. Choose another official upload or attach the sound in-platform.'
          : 'The official player could not start here. The silent master remains ready for in-platform sound.';
      },
    },
  });
  platformPreviewPlayers.set(id, state);
}

function initializeSpotifyPreview(root, api) {
  const id = root.dataset.previewId;
  if (platformPreviewPlayers.has(id)) return;
  const visual = root.querySelector('video');
  const status = root.querySelector('[data-sync-status]');
  const startSeconds = Number(root.dataset.startSeconds || 0);
  const durationSeconds = Number(root.dataset.durationSeconds || 30);
  const state = { root, visual, status, startSeconds, durationSeconds, ready:false, isPlaying:false, player:null, provider:'spotify' };
  api.createController(root.querySelector('[data-spotify-player]'), {
    uri:'spotify:track:' + root.dataset.spotifyTrackId,
    width:'100%',
    height:152,
  }, (controller) => {
    state.player = controller;
    controller.addListener('ready', () => {
      state.ready = true;
      controller.loadEntity('spotify:track:' + root.dataset.spotifyTrackId, false, startSeconds);
      status.textContent = 'Ready · sound streams from Spotify; export stays silent.';
    });
    controller.addListener('playback_started', () => {
      setPlatformPlaying(state, true);
      visual.play().catch(() => {});
      status.textContent = 'Synchronized preview playing · upload master has no audio.';
    });
    controller.addListener('playback_update', (event) => synchronizeSpotifyState(state, event.data));
  });
  platformPreviewPlayers.set(id, state);
}

function synchronizeSpotifyState(state, playback = {}) {
  const positionSeconds = Number(playback.position || 0) / 1000;
  const expected = Math.max(0, positionSeconds - state.startSeconds);
  setPlatformPlaying(state, !playback.isPaused && !playback.isBuffering);
  if (playback.isPaused || playback.isBuffering) state.visual.pause();
  else state.visual.play().catch(() => {});
  if (playback.isBuffering) state.status.textContent = 'Official stream buffering · silent visual paused.';
  if (expected >= state.durationSeconds) {
    state.player.pause();
    setPlatformPlaying(state, false);
    state.visual.pause();
    state.status.textContent = 'Excerpt complete · ready to review again.';
    return;
  }
  if (Math.abs(state.visual.currentTime - expected) > .35) state.visual.currentTime = expected;
}

function synchronizePlatformState(state, playerState) {
  if (playerState === YT.PlayerState.PLAYING) {
    setPlatformPlaying(state, true);
    const expected = Math.max(0, state.player.getCurrentTime() - state.startSeconds);
    state.visual.currentTime = Math.min(expected, state.durationSeconds);
    state.visual.play().catch(() => {});
    state.status.textContent = 'Synchronized preview playing · upload master has no audio.';
    clearInterval(state.interval);
    state.interval = setInterval(() => correctPlatformDrift(state), 400);
    return;
  }
  if ([YT.PlayerState.PAUSED, YT.PlayerState.BUFFERING, YT.PlayerState.ENDED].includes(playerState)) {
    setPlatformPlaying(state, false);
    state.visual.pause();
    clearInterval(state.interval);
    state.interval = null;
    if (playerState === YT.PlayerState.BUFFERING) state.status.textContent = 'Official stream buffering · silent visual paused.';
  }
}

function correctPlatformDrift(state) {
  const expected = state.player.getCurrentTime() - state.startSeconds;
  if (expected < 0) return;
  if (expected >= state.durationSeconds) {
    state.player.pauseVideo();
    setPlatformPlaying(state, false);
    state.visual.pause();
    state.status.textContent = 'Excerpt complete · ready to review again.';
    return;
  }
  if (Math.abs(state.visual.currentTime - expected) > .35) state.visual.currentTime = expected;
}

function playPlatformPreview(root, restart) {
  const state = platformPreviewPlayers.get(root.dataset.previewId);
  if (!state?.ready) {
    root.querySelector('[data-sync-status]').textContent = 'Official player is still loading.';
    return;
  }
  if (state.provider === 'spotify') {
    if (state.isPlaying && !restart) {
      state.player.pause();
      state.visual.pause();
      setPlatformPlaying(state, false);
      state.status.textContent = 'Preview paused.';
      return;
    }
    if (restart) {
      state.player.seek(state.startSeconds);
      state.visual.currentTime = 0;
    }
    state.player.play();
    return;
  }
  if (state.isPlaying && !restart) {
    state.player.pauseVideo();
    state.visual.pause();
    setPlatformPlaying(state, false);
    state.status.textContent = 'Preview paused.';
    return;
  }
  if (restart || state.player.getCurrentTime() < state.startSeconds || state.player.getCurrentTime() > state.startSeconds + state.durationSeconds) {
    state.player.seekTo(state.startSeconds, true);
    state.visual.currentTime = 0;
  }
  state.player.playVideo();
}

function setPlatformPlaying(state, isPlaying) {
  state.isPlaying = Boolean(isPlaying);
  const button = state.root.querySelector('[data-platform-play]');
  if (!button) return;
  button.textContent = state.isPlaying ? 'Pause preview' : 'Play synchronized preview';
  button.setAttribute('aria-pressed', String(state.isPlaying));
}

function resetPlatformPreviewPlayers() {
  for (const state of platformPreviewPlayers.values()) {
    clearInterval(state.interval);
    state.player?.destroy?.();
  }
  platformPreviewPlayers.clear();
}

document.getElementById('production-list').addEventListener('click', async (event) => {
  const decisionButton = event.target.closest('[data-review-decision]');
  if (decisionButton) {
    const decision = decisionButton.dataset.reviewDecision;
    const briefId = decisionButton.dataset.briefId;
    for (const button of decisionButton.closest('.editorial-decision').querySelectorAll('button')) button.disabled = true;
    try {
      activeBrief = await api('/studio/briefs/' + encodeURIComponent(briefId) + '/review', {
        method:'POST',
        body:JSON.stringify({ decision }),
      });
      selectedProductionId = briefId;
      await loadProductions();
      if (decision === 'revisions-requested') {
        populateBrief(activeBrief);
        activateView('create');
        document.getElementById('request').focus();
        setFeedback('compose-feedback', 'Revision requested. Describe the change; the reviewed artifact remains in Videos.', 'success');
      }
    } catch (error) {
      await loadProductions();
      const selectedReview = document.querySelector('.editorial-decision p');
      if (selectedReview) selectedReview.textContent = 'Could not save the editorial decision: ' + error.message;
    }
    return;
  }
  const previewRoot = event.target.closest('[data-platform-preview]');
  if (previewRoot && event.target.closest('[data-platform-play],[data-platform-restart]')) {
    playPlatformPreview(previewRoot, Boolean(event.target.closest('[data-platform-restart]')));
    return;
  }
  const watchButton = event.target.closest('[data-watch-brief]');
  if (watchButton) {
    selectedProductionId = watchButton.dataset.watchBrief;
    renderProductionList();
    document.querySelector('.ready-productions')?.scrollIntoView({ block:'start' });
    return;
  }
  const episodeButton = event.target.closest('[data-open-episode]');
  if (episodeButton) {
    try {
      activeEpisode = await api('/studio/episodes/' + encodeURIComponent(episodeButton.dataset.openEpisode));
      showAllEpisodeShots = false;
      renderEpisodeWorkspace();
      activateView('create');
      document.getElementById('episode-workspace').scrollIntoView({ block:'start' });
    } catch (error) {
      document.getElementById('production-list').innerHTML = '<div class="empty-state">Could not open episode: ' + escapeText(error.message) + '</div>';
    }
    return;
  }
  const button = event.target.closest('[data-edit-brief],[data-review-brief]');
  if (!button) return;
  const briefId = button.dataset.editBrief || button.dataset.reviewBrief;
  activeBrief = briefs.find((brief) => brief.id === briefId) ?? null;
  if (activeBrief) {
    populateBrief(activeBrief);
    activateView('create');
    if (button.dataset.reviewBrief) {
      const acceptance = document.getElementById('brief-quality-accepted');
      acceptance.closest('details')?.setAttribute('open', '');
      acceptance.focus();
      acceptance.scrollIntoView({ block:'center' });
      setFeedback('brief-feedback', 'Review the playable artifact and retained rights evidence, then explicitly accept quality or revise the brief.');
    }
  }
});

document.getElementById('production-list').addEventListener('change', (event) => {
  const select = event.target.closest('[data-soundtrack-preset]');
  if (!select) return;
  const form = select.closest('[data-platform-audio-form]');
  const customFields = form.querySelector('.soundtrack-custom');
  const preset = PLATFORM_SOUND_PRESETS.find((entry) => entry.id === select.value);
  if (!preset) {
    customFields.open = true;
    form.querySelector('[name="youtubeUrl"]').focus();
    return;
  }
  form.querySelector('[name="artist"]').value = preset.artist;
  form.querySelector('[name="title"]').value = preset.title;
  form.querySelector('[name="youtubeUrl"]').value = 'https://www.youtube.com/watch?v=' + preset.videoId;
  form.querySelector('[name="spotifyTrackId"]').value = preset.spotifyTrackId;
  form.querySelector('[name="startSeconds"]').value = String(preset.startSeconds);
  customFields.open = false;
});

document.getElementById('production-list').addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-platform-audio-form]');
  if (!form) return;
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  const feedback = form.querySelector('.feedback');
  const fields = new FormData(form);
  button.disabled = true;
  button.textContent = 'Building silent master…';
  feedback.textContent = 'Removing every audio stream and preparing the official-player review.';
  try {
    const result = await api('/studio/platform-audio-preview', {
      method:'POST',
      body:JSON.stringify({
        briefId:form.dataset.briefId,
        confirm:true,
        reference:{
          provider:'youtube',
          youtubeUrl:String(fields.get('youtubeUrl') || '').trim(),
          spotifyTrackId:String(fields.get('spotifyTrackId') || '').trim() || null,
          artist:String(fields.get('artist') || '').trim(),
          title:String(fields.get('title') || '').trim(),
          startSeconds:Number(fields.get('startSeconds')),
          durationSeconds:Number(fields.get('durationSeconds')),
          targetPlatform:String(fields.get('targetPlatform') || 'youtube_shorts'),
        },
      }),
    });
    feedback.textContent = result.boundary;
    await loadProductions();
  } catch (error) {
    feedback.textContent = error.message;
    feedback.className = 'feedback error wide';
  } finally {
    button.disabled = false;
    button.textContent = 'Play song with video';
  }
});

function populateDistributionSelect() {
  const select = document.getElementById('distribution-brief');
  const selected = activeBrief?.id || select.value;
  select.innerHTML = '<option value="">Choose a production</option>' + briefs.map((brief) =>
    '<option value="' + escapeText(brief.id) + '"' + (brief.id === selected ? ' selected' : '') + '>' +
    escapeText(brief.title) + ' · ' + escapeText(brief.lifecycle) + '</option>').join('');
}

async function renderDistribution() {
  if (!postizReadiness) {
    try { postizReadiness = await api('/studio/postiz-readiness'); } catch {}
  }
  const state = document.getElementById('postiz-state');
  const postizReady = postizReadiness?.state === 'ready-for-submission';
  state.textContent = postizReady ? 'Postiz ready' : 'Postiz unavailable';
  state.className = 'state ' + (postizReady ? 'ready' : 'blocked');
  document.getElementById('postiz-boundary').textContent = postizReadiness?.boundary || 'Postiz configuration is unavailable.';
  const open = document.getElementById('open-postiz');
  if (postizReadiness?.appUrl) {
    open.href = postizReadiness.appUrl;
    open.removeAttribute('aria-disabled');
  } else {
    open.href = '#';
    open.setAttribute('aria-disabled','true');
  }
  populateDistributionSelect();
  const brief = activeBrief;
  const scheduleInput = document.getElementById('schedule-time');
  if (scheduleInput.dataset.briefId !== (brief?.id ?? '')) {
    scheduleInput.dataset.briefId = brief?.id ?? '';
    scheduleInput.value = brief?.distribution?.request?.scheduledFor
      ? localDateTimeValue(brief.distribution.request.scheduledFor)
      : '';
  }
  scheduleInput.min = localDateTimeValue(new Date(Date.now() + 60_000));
  const storedSchedule = brief?.distribution?.request?.scheduledFor;
  const receiptStatus = brief?.distribution?.receipt?.status;
  document.getElementById('schedule-status').textContent = storedSchedule
    ? (receiptStatus === 'scheduled' ? 'Scheduled' : 'Prepared') + ' for ' + formatScheduledTime(storedSchedule) + '.'
    : receiptStatus === 'draft' ? 'Postiz draft created; no publish time is set.' : '';
  const checks = distributionChecks(brief);
  const passing = checks.filter((check) => check.pass).length;
  document.getElementById('evidence-progress').textContent = brief
    ? passing + ' of ' + checks.length + ' requirements ready'
    : 'Choose a production to inspect its handoff evidence.';
  const groups = ['Source','Approval','Delivery'];
  const evidenceList = document.getElementById('evidence-list');
  evidenceList.innerHTML = groups.map((group) =>
    '<li class="evidence-group"><h4>' + group + '</h4><ul class="evidence-list">' +
    checks.filter((check) => check.group === group).map((check) =>
      '<li class="' + (check.pass ? 'pass' : '') + '"><span class="mark">' + (check.pass ? '✓' : '×') + '</span><span><strong>' + escapeText(check.label) + '</strong><br><span class="hint">' + escapeText(check.detail) + '</span></span>' +
      (!check.pass ? '<button class="copy evidence-fix" type="button" data-fix-view="' + escapeText(check.fixView) + '"' + (check.fieldId ? ' data-fix-field="' + escapeText(check.fieldId) + '"' : '') + '>' + escapeText(check.fixLabel) + '</button>' : '') +
      '</li>').join('') + '</ul></li>').join('');
  for (const button of evidenceList.querySelectorAll('[data-fix-view]')) {
    button.addEventListener('click', () => {
      activateView(button.dataset.fixView);
      const field = button.dataset.fixField && document.getElementById(button.dataset.fixField);
      if (field) {
        field.closest('details')?.setAttribute('open', '');
        field.focus();
        field.scrollIntoView({ block:'center' });
      }
    });
  }
  const complete = Boolean(brief) && checks.every((check) => check.pass);
  const alreadySubmitted = Boolean(brief?.distribution?.receipt?.externalId);
  document.getElementById('prepare-button').disabled = !complete;
  document.getElementById('draft-button').disabled =
    !complete || alreadySubmitted || postizReadiness?.state !== 'ready-for-submission';
  updateScheduleButton();
}

function distributionChecks(brief) {
  const qualityPass = brief?.media?.quality?.verdict === 'pass' || brief?.approval?.qualityAccepted === true;
  const publicMedia = isStableHttps(brief?.media?.publicUrl);
  const checks = [
    { group:'Source', label:'Fleet brand and channel', pass:Boolean(brief?.projectSlug && brief?.channel), detail:brief?.projectSlug ? brief.projectSlug + ' → ' + brief.channel.replaceAll('_',' ') : 'Choose a configured Fleet brand.', fixView:'create', fieldId:brief?.projectSlug ? 'brief-channel' : 'brief-project', fixLabel:'Fix in brief' },
    { group:'Source', label:'Canonical source and claim', pass:Boolean(brief?.sourceEvidence?.canonicalUrl && brief?.sourceEvidence?.claim), detail:'Attach the allowed claim to its source URL.', fixView:'create', fieldId:brief?.sourceEvidence?.canonicalUrl ? 'brief-claim' : 'brief-source-url', fixLabel:'Fix in brief' },
    { group:'Source', label:'Source rights', pass:brief?.sourceEvidence?.rightsStatus === 'approved', detail:'Owned or licensed source must be explicitly approved.', fixView:'create', fieldId:'brief-rights', fixLabel:'Fix in brief' },
    { group:'Approval', label:'Destination and CTA', pass:Boolean(brief?.sourceEvidence?.destinationUrl && brief?.cta), detail:'Give the post one truthful next action.', fixView:'create', fieldId:brief?.sourceEvidence?.destinationUrl ? 'brief-cta' : 'brief-destination', fixLabel:'Fix in brief' },
    { group:'Approval', label:'Creative approval', pass:brief?.approval?.creativeStatus === 'approved', detail:'Conversation and rendering never imply approval.', fixView:'create', fieldId:'brief-creative-approved', fixLabel:'Fix in brief' },
    { group:'Approval', label:'Quality evidence', pass:qualityPass, detail:'Requires a passing verdict or explicit owner acceptance.', fixView:'create', fieldId:'brief-quality-accepted', fixLabel:'Fix in brief' },
    { group:'Delivery', label:'Rendered artifact', pass:Boolean(brief?.media?.videoPath), detail:'A real render must exist before handoff.', fixView:'productions', fieldId:null, fixLabel:'Review production' },
    { group:'Delivery', label:'Stable public media', pass:publicMedia, detail:'Postiz needs a public HTTPS URL; local paths are rejected.', fixView:'create', fieldId:'brief-public-url', fixLabel:'Fix in brief' },
  ];
  if (brief?.kind === 'lyric-video') {
    checks.splice(3, 0,
      { group:'Source', label:'Composition and lyric rights', pass:['owned','licensed','public-domain'].includes(brief?.lyric?.rights?.composition), detail:'Record the asserted basis for the words and composition.', fixView:'create', fieldId:'lyric-composition-rights', fixLabel:'Fix music rights' },
      { group:'Source', label:'Master-recording rights', pass:['owned','licensed','original-recording'].includes(brief?.lyric?.rights?.master), detail:'A cleared composition does not clear a recording.', fixView:'create', fieldId:'lyric-master-rights', fixLabel:'Fix recording rights' },
      { group:'Source', label:'Music evidence and attribution', pass:Boolean(brief?.lyric?.attribution && (brief?.lyric?.rights?.evidence || brief?.lyric?.rights?.evidenceUrl)), detail:'Attribution is recorded, but it never substitutes for permission.', fixView:'create', fieldId:brief?.lyric?.attribution ? 'lyric-rights-evidence' : 'lyric-attribution', fixLabel:'Fix evidence' },
      { group:'Approval', label:'Exact cue and literal-scene evidence', pass:Boolean(brief?.media?.rightsPath && brief?.media?.scenePlanPath), detail:'The production must retain the rights manifest and one literal scene per exact cue.', fixView:'productions', fieldId:null, fixLabel:'Review production' },
    );
  }
  return checks;
}

function toggleLyricFields(kind) {
  const fields = document.getElementById('lyric-fields');
  fields.hidden = kind !== 'lyric-video';
  if (kind === 'lyric-video' && blenderReadiness) renderBlenderReadiness();
}

async function loadBlenderReadiness() {
  try {
    blenderReadiness = await api('/studio/blender-readiness');
  } catch (error) {
    blenderReadiness = { ready:false, blocker:error.message };
  }
  renderBlenderReadiness();
}

function renderBlenderReadiness() {
  const box = document.getElementById('blender-readiness');
  if (!box || !blenderReadiness) return;
  box.textContent = blenderReadiness.ready
    ? 'Blender ' + blenderReadiness.version + ' is ready for literal scene generation.'
    : (blenderReadiness.blocker || 'Blender 5.2 is unavailable.');
}

async function prepareDistribution() {
  if (!activeBrief) return;
  setBusy('prepare-button', true, 'Preparing…');
  try {
    await saveBrief({ silent:true });
    const result = await api('/studio/briefs/' + encodeURIComponent(activeBrief.id) + '/prepare-distribution', { method:'POST', body:'{}' });
    activeBrief = result.brief;
    await loadBriefs(activeBrief.id);
    setFeedback('distribution-feedback', result.boundary, 'success');
  } catch (error) {
    setFeedback('distribution-feedback', error.message, 'error');
  } finally {
    setBusy('prepare-button', false, 'Prepare handoff');
    await renderDistribution();
  }
}

async function createPostizDraft() {
  if (!activeBrief) return;
  setBusy('draft-button', true, 'Creating draft…');
  try {
    await saveBrief({ silent:true });
    const result = await api('/studio/briefs/' + encodeURIComponent(activeBrief.id) + '/create-postiz-draft', {
      method:'POST',
      body:JSON.stringify({ approvedBy:'owner' }),
    });
    activeBrief = result.brief;
    await loadBriefs(activeBrief.id);
    setFeedback('distribution-feedback', result.boundary, 'success');
  } catch (error) {
    setFeedback('distribution-feedback', error.message, 'error');
  } finally {
    setBusy('draft-button', false, 'Create Postiz draft');
    await renderDistribution();
  }
}

async function schedulePostiz() {
  if (!activeBrief) return;
  let scheduledFor;
  try {
    scheduledFor = scheduledForFromInput();
  } catch (error) {
    setFeedback('distribution-feedback', error.message, 'error');
    return;
  }
  setBusy('schedule-button', true, 'Scheduling…');
  try {
    await saveBrief({ silent:true });
    const result = await api('/studio/briefs/' + encodeURIComponent(activeBrief.id) + '/schedule-postiz', {
      method:'POST',
      body:JSON.stringify({ approvedBy:'owner', scheduledFor }),
    });
    activeBrief = result.brief;
    await loadBriefs(activeBrief.id);
    setFeedback('distribution-feedback', result.boundary, 'success');
  } catch (error) {
    setFeedback('distribution-feedback', error.message, 'error');
  } finally {
    setBusy('schedule-button', false, 'Schedule in Postiz');
    await renderDistribution();
  }
}

function updateScheduleButton() {
  const input = document.getElementById('schedule-time');
  const selected = input.value ? new Date(input.value) : null;
  const future = Boolean(selected && Number.isFinite(selected.getTime()) && selected.getTime() > Date.now());
  const evidenceReady = Boolean(activeBrief) && distributionChecks(activeBrief).every((check) => check.pass);
  const alreadySubmitted = Boolean(activeBrief?.distribution?.receipt?.externalId);
  const button = document.getElementById('schedule-button');
  button.textContent = activeBrief?.distribution?.receipt?.status === 'scheduled'
    ? 'Scheduled in Postiz'
    : 'Schedule in Postiz';
  button.disabled =
    alreadySubmitted || !future || !evidenceReady || postizReadiness?.state !== 'ready-for-submission';
}

function scheduledForFromInput() {
  const raw = document.getElementById('schedule-time').value;
  if (!raw) throw new Error('Choose a future publish date and time.');
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) throw new Error('Choose a valid publish date and time.');
  if (date.getTime() <= Date.now()) throw new Error('Publish date and time must be in the future.');
  return date.toISOString();
}

function localDateTimeValue(value) {
  const date = value instanceof Date ? value : new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatScheduledTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    day:'numeric',
    month:'long',
    year:'numeric',
    hour:'numeric',
    minute:'2-digit',
    timeZoneName:'short',
  }).format(new Date(value));
}

const toolNav = document.getElementById('tool-nav');
const toolPanels = document.getElementById('tool-panels');
for (const tool of TOOLS) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = tool.label;
  button.dataset.tool = tool.id;
  button.addEventListener('click', () => activateTool(tool.id));
  toolNav.appendChild(button);
  const panel = document.createElement('section');
  panel.className = 'tool-panel';
  panel.id = 'tool-panel-' + tool.id;
  panel.innerHTML = '<h3>' + escapeText(tool.label) + '</h3><p class="hint">' + escapeText(tool.hint) + '</p>';
  panel.appendChild(buildToolForm(tool));
  const result = document.createElement('div');
  result.className = 'result';
  result.id = 'result-' + tool.id;
  panel.appendChild(result);
  toolPanels.appendChild(panel);
}
addToolPanel('manager','Ideas manager','Saved ideas and their pipeline status.','ideas-table',loadIdeas);
addToolPanel('renders','Renders','Legacy Studio renders with quality verdicts and playback.','legacy-renders',loadRenders);

function addToolPanel(id,label,hint,containerId,loader) {
  const button = document.createElement('button');
  button.type = 'button'; button.textContent = label; button.dataset.tool = id;
  button.addEventListener('click', () => { activateTool(id); loader(); });
  toolNav.appendChild(button);
  const panel = document.createElement('section');
  panel.className = 'tool-panel'; panel.id = 'tool-panel-' + id;
  panel.innerHTML = '<h3>' + label + '</h3><p class="hint">' + hint + '</p><div id="' + containerId + '"></div>';
  toolPanels.appendChild(panel);
}

function buildToolForm(tool) {
  const form = document.createElement('form');
  for (const field of tool.fields) {
    const label = document.createElement('label');
    label.textContent = field.label;
    let input;
    if (field.type === 'textarea') input = document.createElement('textarea');
    else if (field.type === 'select') {
      input = document.createElement('select');
      for (const option of field.options) {
        const el = document.createElement('option');
        el.value = option; el.textContent = option;
        input.appendChild(el);
      }
    } else {
      input = document.createElement('input');
      input.type = field.type || 'text';
    }
    input.name = field.name;
    if (field.placeholder) input.placeholder = field.placeholder;
    if (field.value) input.value = field.value;
    if (field.required) input.required = true;
    label.appendChild(input);
    form.appendChild(label);
  }
  const run = document.createElement('button');
  run.className = 'button primary';
  run.type = 'submit';
  run.textContent = 'Run';
  form.appendChild(run);
  form.onsubmit = async (event) => {
    event.preventDefault();
    const body = {};
    for (const field of tool.fields) {
      const raw = form.elements[field.name].value.trim();
      if (!raw) continue;
      body[field.name] = field.type === 'number' ? Number(raw) : raw;
    }
    run.disabled = true;
    const box = document.getElementById('result-' + tool.id);
    box.innerHTML = '<p class="hint">Running…</p>';
    try {
      const res = await fetch('/studio/' + tool.id, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || res.status);
      renderResult(box, payload.data);
      if (tool.id === 'save' || tool.id === 'faceless') { loadIdeas(); loadBriefs(activeBrief?.id); }
    } catch (error) {
      box.innerHTML = '<p class="error">' + escapeText(error.message) + '</p>';
    } finally {
      run.disabled = false;
    }
  };
  return form;
}

function renderResult(box, data) {
  const text = JSON.stringify(data, null, 2);
  box.innerHTML = '';
  const meta = document.createElement('div');
  meta.className = 'meta';
  if (data && data.source) meta.append('source: ' + data.source + ' ');
  const copy = document.createElement('button');
  copy.className = 'copy';
  copy.textContent = 'copy JSON';
  copy.onclick = () => navigator.clipboard.writeText(text);
  meta.appendChild(copy);
  const pre = document.createElement('pre');
  pre.textContent = text;
  box.appendChild(meta);
  box.appendChild(pre);
}

async function loadIdeas() {
  const table = document.getElementById('ideas-table');
  const res = await fetch('/studio/ideas-list');
  const payload = await res.json();
  const ideas = payload.data || [];
  if (!ideas.length) { table.innerHTML = '<div class="empty-state">No saved ideas yet. Use Video ideas or Save idea to begin.</div>'; return; }
  const rows = ideas.map((idea) =>
    '<tr><td>' + escapeText(idea.title) + '</td><td>' + escapeText(idea.niche || '') + '</td><td>' +
    statusSelect(idea) + '</td><td>' + escapeText(idea.updatedAt || '') + '</td></tr>').join('');
  table.innerHTML = '<table><tr><th>Title</th><th>Niche</th><th>Status</th><th>Updated</th></tr>' + rows + '</table>';
  for (const select of table.querySelectorAll('select[data-id]')) {
    select.onchange = async () => {
      await fetch('/studio/status', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: select.dataset.id, to: select.value }),
      });
      loadIdeas();
    };
  }
}

async function loadRenders() {
  const table = document.getElementById('legacy-renders');
  const res = await fetch('/studio/renders-list');
  const payload = await res.json();
  const renders = payload.data || [];
  if (!renders.length) { table.innerHTML = '<div class="empty-state">No legacy renders yet. Run Factory: produce or use the Create view.</div>'; return; }
  const rows = renders.map((render, index) =>
    '<tr><td>' + escapeText(render.title) + '</td>' +
    '<td>' + (render.quality ? render.quality.verdict + ' (' + render.quality.overall + ')' : '—') + '</td>' +
    '<td>' + escapeText(render.provider || '') + '</td>' +
    '<td>' + escapeText(render.status) + '</td>' +
    '<td>' +
      (render.video ? '<button class="copy" data-play="' + index + '">play</button> ' : '') +
      '<button class="copy" data-approve="' + escapeText(render.ideaId) + '">approve</button> ' +
      '<button class="copy" data-reject="' + escapeText(render.ideaId) + '">reject</button>' +
    '</td></tr>').join('');
  table.innerHTML = '<table><tr><th>Title</th><th>Quality</th><th>Engine</th><th>Status</th><th></th></tr>' + rows + '</table>';
  const player = document.createElement('div');
  table.appendChild(player);
  for (const btn of table.querySelectorAll('button[data-play]')) {
    btn.onclick = () => {
      const render = renders[Number(btn.dataset.play)];
      player.innerHTML = '<h3>' + escapeText(render.title) + '</h3>' +
        '<video controls style="max-width:320px;max-height:568px" src="/studio/render-file?path=' + encodeURIComponent(render.video) + '"></video>';
    };
  }
  const setStatus = async (id, to) => {
    await fetch('/studio/status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, to }),
    });
    loadRenders();
  };
  for (const btn of table.querySelectorAll('button[data-approve]')) btn.onclick = () => setStatus(btn.dataset.approve, 'posted');
  for (const btn of table.querySelectorAll('button[data-reject]')) btn.onclick = () => setStatus(btn.dataset.reject, 'new');
}

function statusSelect(idea) {
  const statuses = ['new', 'scripted', 'rendered', 'posted'];
  return '<select data-id="' + escapeText(idea.id) + '">' + statuses.map((status) =>
    '<option value="' + status + '"' + (idea.status === status ? ' selected' : '') + '>' + status + '</option>').join('') + '</select>';
}

function escapeText(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function activateTool(id) {
  for (const button of toolNav.querySelectorAll('button')) button.classList.toggle('active', button.dataset.tool === id);
  const toolsVisible = !document.getElementById('view-tools').hidden;
  for (const button of toolShortcutButtons) button.classList.toggle('active', toolsVisible && button.dataset.toolShortcut === id);
  for (const panel of toolPanels.querySelectorAll('.tool-panel')) panel.classList.toggle('active', panel.id === 'tool-panel-' + id);
}

async function api(path, init) {
  pendingStudioRequests += 1;
  updateOperationStatus();
  try {
    const response = await fetch(path, {
      headers:{ 'content-type':'application/json', ...(init?.headers || {}) },
      ...init,
    });
    const payload = await response.json();
    if (!response.ok) {
      const error = new Error(typeof payload.error === 'string' ? payload.error : payload.error?.message || 'Request failed');
      error.payload = payload;
      throw error;
    }
    return payload.data;
  } finally {
    pendingStudioRequests = Math.max(0, pendingStudioRequests - 1);
    updateOperationStatus();
  }
}

function updateOperationStatus() {
  const busy = pendingStudioRequests > 0;
  const status = document.getElementById('operation-status');
  document.getElementById('workspace').setAttribute('aria-busy', String(busy));
  status.setAttribute('aria-busy', String(busy));
  status.classList.toggle('busy', busy);
  status.textContent = busy
    ? pendingStudioRequests + (pendingStudioRequests === 1 ? ' Studio operation in progress' : ' Studio operations in progress')
    : 'Studio ready · updated ' + new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
}

function value(id) { return document.getElementById(id).value.trim(); }
function setValue(id, next) { document.getElementById(id).value = next ?? ''; }
function setFeedback(id, message, state) {
  const element = document.getElementById(id);
  element.textContent = message || '';
  element.className = 'feedback' + (state ? ' ' + state : '');
}
function setBusy(id, busy, label) {
  const button = document.getElementById(id);
  button.dataset.busy = busy ? 'true' : 'false';
  button.disabled = busy;
  button.textContent = label;
}
function isStableHttps(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !['localhost','127.0.0.1','::1'].includes(url.hostname);
  } catch { return false; }
}

document.addEventListener('keydown', (event) => {
  const tag = event.target?.tagName?.toLowerCase();
  const editing = ['input', 'textarea', 'select'].includes(tag) || event.target?.isContentEditable;
  if (event.key === '/' && !editing && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault();
    activateView('create');
    document.getElementById('request').focus();
    return;
  }
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !document.getElementById('view-create').hidden) {
    event.preventDefault();
    document.getElementById('composer').requestSubmit();
  }
});

activateTool(TOOLS[0].id);
const initialParams = new URLSearchParams(window.location.search);
const initialBriefId = initialParams.get('briefId') || '__new__';
const initialView = initialParams.get('view');
if (['history','recipes','workflows'].includes(initialView)) activateView(initialView);
Promise.all([loadModelOptions(), loadCharacters(), loadBriefs(initialBriefId)]).catch((error) => {
  setFeedback('compose-feedback', 'Video Maker could not load: ' + error.message, 'error');
});
</script>
</body>
</html>`;
}
