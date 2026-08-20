export function anonymousVideoPageHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="Turn a public brand website into a presenter-led vertical reel.">
  <title>Make a brand reel</title>
  <style>
    :root{color-scheme:dark;--ink:#f8f7f2;--muted:#aaa9a2;--panel:#171714;--line:#34332d;--accent:#d7ff64;--danger:#ff8e86}
    *{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 18% 8%,#31361d 0,transparent 32rem),#0d0d0b;color:var(--ink);font:16px/1.5 Inter,ui-sans-serif,system-ui,sans-serif}
    main{width:min(920px,calc(100% - 32px));margin:0 auto;padding:clamp(56px,10vw,120px) 0}p{color:var(--muted)}h1{max-width:780px;margin:.15em 0;font-size:clamp(44px,8vw,88px);line-height:.94;letter-spacing:-.055em}h1 em{color:var(--accent);font-style:normal}
    form{display:flex;gap:10px;margin:42px 0 18px;padding:10px;border:1px solid var(--line);border-radius:18px;background:#11110f;box-shadow:0 24px 80px #0008}input{min-width:0;flex:1;padding:16px 18px;border:0;background:transparent;color:var(--ink);font:inherit;outline:none}button,a.button{border:0;border-radius:11px;background:var(--accent);color:#151710;padding:16px 22px;font-weight:800;cursor:pointer;text-decoration:none}button:disabled{cursor:wait;opacity:.55}
    #result{display:none;margin-top:28px;padding:22px;border:1px solid var(--line);border-radius:18px;background:var(--panel)}#result[data-visible=true]{display:block}.eyebrow{color:var(--accent);font-size:12px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.error{color:var(--danger)}video{display:none;width:min(100%,360px);margin:18px 0;border-radius:14px;background:#000;aspect-ratio:9/16}video[data-visible=true]{display:block}.actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.fine{font-size:13px}@media(max-width:620px){form{display:block}button{width:100%}input{width:100%;padding-inline:8px}h1{font-size:48px}}
  </style>
</head>
<body><main>
  <div class="eyebrow">Reel · one link in, one video out</div>
  <h1>Turn your website into a <em>beautiful reel.</em></h1>
  <p>We read your public brand site, find the strongest story and visuals, then compose a vertical reel with a fictional synthetic human presenter. No account or setup.</p>
  <form id="create-form">
    <input id="brand-url" name="url" type="url" inputmode="url" autocomplete="url" placeholder="https://yourbrand.com" aria-label="Public brand website" required pattern="https://.*">
    <button id="submit" type="submit">Make my reel</button>
  </form>
  <p class="fine">Public HTTPS websites only. We never sign in, post, or connect your accounts.</p>
  <section id="result" aria-live="polite">
    <div id="state" class="eyebrow">Starting</div>
    <h2 id="message">Understanding your brand…</h2>
    <p id="detail">This can take a few minutes. Keep this page open.</p>
    <video id="preview" controls playsinline preload="metadata"></video>
    <div id="actions" class="actions"></div>
  </section>
</main>
<script>
const form=document.querySelector('#create-form'),input=document.querySelector('#brand-url'),button=document.querySelector('#submit'),result=document.querySelector('#result'),state=document.querySelector('#state'),message=document.querySelector('#message'),detail=document.querySelector('#detail'),preview=document.querySelector('#preview'),actions=document.querySelector('#actions');
const incomingUrl=new URLSearchParams(window.location.search).get('url');
if(incomingUrl){try{const parsed=new URL(incomingUrl);if(parsed.protocol==='https:')input.value=parsed.toString()}catch{}}
const terminal=new Set(['completed','failed','needs_review']);let timer;
function show(job){const status=job.status||job.state||'processing';result.dataset.visible='true';state.textContent=status.replaceAll('_',' ');message.className=status==='failed'?'error':'';message.textContent=status==='completed'?'Your reel is ready.':status==='failed'?'We could not make this reel.':status==='needs_review'?'This reel needs a final review.':'Making your reel…';detail.textContent=job.error?.message||job.message||job.stage||'We are gathering brand details, composing, and checking the video.';if(status==='completed'){preview.src='/api/videos/'+encodeURIComponent(job.id)+'/preview';preview.dataset.visible='true';actions.replaceChildren();const link=document.createElement('a');link.className='button';link.href='/api/videos/'+encodeURIComponent(job.id)+'/download';link.textContent='Download MP4';actions.append(link)}if(terminal.has(status)){clearTimeout(timer);button.disabled=false;button.textContent='Make another reel'}}
async function poll(id){try{const response=await fetch('/api/videos/'+encodeURIComponent(id));const payload=await response.json();if(!response.ok)throw new Error(payload.error?.message||payload.error||'Could not load reel status');const job=payload.data||payload;show(job);if(!terminal.has(job.status||job.state))timer=setTimeout(()=>poll(id),1800)}catch(error){show({status:'failed',error:{message:error.message}})}}
form.addEventListener('submit',async(event)=>{event.preventDefault();clearTimeout(timer);button.disabled=true;button.textContent='Starting…';preview.removeAttribute('src');preview.dataset.visible='false';actions.replaceChildren();show({status:'processing',stage:'Checking the website and collecting brand evidence…'});try{const response=await fetch('/api/videos',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:input.value})});const payload=await response.json();if(!response.ok)throw new Error(payload.error?.message||payload.error||'Could not start reel');const job=payload.data||payload;show(job);if(!terminal.has(job.status||job.state))poll(job.id)}catch(error){show({status:'failed',error:{message:error.message}});button.disabled=false;button.textContent='Try again'}});
</script></body></html>`;
}
