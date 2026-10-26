// The two HTML pages, served by the Worker. No build step, no framework.
// All data is rendered client-side from /api/status and is always escaped.

const ICONS = {
  clapper: `<svg class="clapper" viewBox="0 0 96 80" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M10 6l6 7M4 22l9 1M24 2l1 8M86 8l-6 7M92 24l-9 1"/><rect x="22" y="34" width="56" height="40" rx="6"/><path d="M22 34l-3-14 54-9 3 14z"/><path d="M31 18.5l9 12M45 16l9 12M59 13.6l9 12"/><path d="M33 48h28M33 59h20"/></g></svg>`,
  people: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm7.5 0a3.5 3.5 0 1 0-1.2-6.8A5.9 5.9 0 0 1 16.4 7c0 1.4-.4 2.6-1.2 3.6.4.2.8.4 1.3.4zM9 13c-3.9 0-7 2-7 4.5V20h14v-2.5C16 15 12.9 13 9 13zm8.6.2c1.4.9 2.4 2.3 2.4 4.3V20h3v-2.2c0-2.3-2.4-4.1-5.4-4.6z"/></svg>`,
  film: `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4M3 12h4M3 16h4M17 8h4M17 12h4M17 16h4"/></g></svg>`,
  popcorn: `<svg class="bucket" viewBox="0 0 120 120" aria-hidden="true"><g fill="#f6dd9c" stroke="#d9a94b" stroke-width="2"><circle cx="34" cy="38" r="12"/><circle cx="52" cy="28" r="13"/><circle cx="70" cy="30" r="12"/><circle cx="86" cy="40" r="11"/><circle cx="44" cy="44" r="11"/><circle cx="62" cy="42" r="12"/><circle cx="78" cy="48" r="10"/></g><path d="M24 48h72l-9 64H33z" fill="#fff8ec"/><path d="M33 48h11l3 64H37zM55 48h10v64H55zM76 48h11l-4 64h-10z" fill="#b5172b"/><path d="M24 48h72l-9 64H33z" fill="none" stroke="#7a1422" stroke-width="3" stroke-linejoin="round"/></svg>`,
};

const STYLE = `
:root{--bg:#140c09;--cream:#fdf6ea;--cream-2:#f4e9d6;--ink:#2b1a12;--muted:#6e5a4c;--burgundy:#7b1421;--burgundy-2:#962033;--track:#e6d9c5;--gold:#f2bf68;--glow:#ffb35c;--ok:#2f7d4f;--warn:#a5600c}
*{box-sizing:border-box}
[hidden]{display:none!important}
html,body{margin:0}
body{min-height:100vh;color:var(--cream);font:16px/1.5 "Nunito Sans",system-ui,-apple-system,"Segoe UI",sans-serif;background-color:var(--bg);
background-image:radial-gradient(38vmax 30vmax at 8% 30%,rgba(255,170,80,.28),transparent 70%),radial-gradient(30vmax 26vmax at 92% 22%,rgba(255,150,70,.22),transparent 70%),radial-gradient(60vmax 40vmax at 50% 115%,rgba(170,60,30,.35),transparent 70%),linear-gradient(180deg,#1d120d 0%,#120a08 60%,#0d0706 100%);background-attachment:fixed}
body::after{content:"";position:fixed;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,transparent 55%,rgba(0,0,0,.55));z-index:0}
main{position:relative;z-index:1;max-width:620px;margin:0 auto;padding:40px 16px 56px}
header{text-align:center;margin-bottom:28px}
.clapper{width:84px;height:70px;color:#f7e6c4;filter:drop-shadow(0 0 18px rgba(255,190,110,.35))}
h1{font-family:"Roboto Slab",Georgia,serif;font-weight:800;font-size:clamp(2.1rem,7.5vw,3.3rem);line-height:1.05;margin:6px 0 14px;letter-spacing:-.01em;text-shadow:0 2px 24px rgba(0,0,0,.5)}
.tagline{font-size:clamp(1rem,3.6vw,1.2rem);color:#f3e6d2;margin:0 auto;max-width:30ch}
.card{background:var(--cream);color:var(--ink);border-radius:26px;padding:28px 24px;box-shadow:0 24px 60px rgba(0,0,0,.45);text-align:center;position:relative;overflow:hidden;isolation:isolate}
.card>*{position:relative;z-index:1}
.card h2{font-family:"Roboto Slab",Georgia,serif;font-weight:700;font-size:1.45rem;margin:0 0 16px;display:flex;align-items:center;justify-content:center;gap:10px}
.card h2 svg{width:30px;height:30px;color:var(--ink)}
.progress-row{display:flex;align-items:center;gap:12px;margin:0 4px}
.progress{flex:1;height:16px;border-radius:99px;background:var(--track);overflow:hidden}
.bar{height:100%;border-radius:99px;background:linear-gradient(90deg,#6a101b,var(--burgundy-2));transition:width .8s cubic-bezier(.2,.8,.2,1)}
.count{color:var(--muted);font-variant-numeric:tabular-nums;min-width:3.2em;text-align:right}
.lead{margin:16px 0 22px;font-size:1.08rem}
.btn{font-family:inherit;display:inline-flex;align-items:center;justify-content:center;gap:12px;background:var(--burgundy);color:#fff;text-decoration:none;font-weight:700;font-size:1.2rem;padding:16px 34px;border-radius:99px;border:0;cursor:pointer;box-shadow:0 8px 20px rgba(123,20,33,.35);transition:transform .15s,background .15s;min-height:56px;width:100%;max-width:360px}
.btn:hover{background:var(--burgundy-2);transform:translateY(-1px)}
.btn:focus-visible{outline:3px solid var(--gold);outline-offset:3px}
.btn svg{width:24px;height:24px}
.btn[aria-disabled=true]{background:#a99a8c;box-shadow:none;cursor:not-allowed}
.note{color:var(--muted);font-size:.92rem;margin:12px 0 0}
.chips{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:22px;padding-top:20px;border-top:1px dashed #dccdb6;list-style:none;padding-left:0}
.chip{font-size:.9rem;padding:5px 12px;border-radius:99px;border:1.5px solid #d6c6ae;color:var(--muted)}
.chip.in{background:#f3dfe0;border-color:#e4bcc0;color:var(--burgundy);font-weight:700}
.chip.in::before{content:"\\2713  "}
.chip.attn{background:#fdecc8;border-color:#efc775;color:var(--warn);font-weight:700}
.chip.attn::before{content:"! "}
.attention{margin:14px 0 0;color:var(--warn);font-size:.92rem}
.drawing h2{flex-direction:column;gap:2px}
.drawing .sub{font:600 1rem/1.4 "Nunito Sans",system-ui,sans-serif;margin:0}
.bucket{width:120px;height:120px;margin:12px auto 4px;display:block;animation:bob 1.1s ease-in-out infinite}
.sparkles{position:relative;display:inline-block}
.sparkles::before,.sparkles::after{content:"\\2726";position:absolute;color:var(--gold);font-size:22px;top:30px;animation:twinkle 1.4s infinite}
.sparkles::before{left:-34px}.sparkles::after{right:-34px;animation-delay:.7s}
.dots{display:flex;gap:7px;justify-content:center;margin-top:10px}
.dots i{width:9px;height:9px;border-radius:50%;background:var(--burgundy);animation:dot 1.2s infinite}
.dots i:nth-child(2){animation-delay:.15s}.dots i:nth-child(3){animation-delay:.3s}.dots i:nth-child(4){animation-delay:.45s}.dots i:nth-child(5){animation-delay:.6s}
.winner-kicker{font-family:"Roboto Slab",Georgia,serif;color:var(--burgundy);font-weight:700;font-size:1.3rem;margin:0 0 14px}
.winner-title{font-family:"Roboto Slab",Georgia,serif;font-weight:800;font-size:clamp(1.9rem,7vw,2.6rem);line-height:1.1;margin:0 0 10px;overflow-wrap:anywhere}
.winner-by{font-size:1.15rem;margin:0}
.winner-date{color:var(--muted);margin:4px 0 18px}
.popcorn-line{font-weight:800;color:var(--burgundy);font-size:1.15rem;margin:0}
.reveal{animation:pop .7s cubic-bezier(.2,1.4,.4,1)}
.card>.confetti{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:0;opacity:.75}
.confetti i{position:absolute;top:-12px;width:8px;height:14px;border-radius:2px;opacity:.9;animation:fall linear forwards}
details.picks{margin-top:22px;padding-top:16px;border-top:1px dashed #dccdb6;text-align:left}
details.picks summary{cursor:pointer;font-weight:700;color:var(--muted);text-align:center;list-style-position:inside}
.picks ol{margin:12px 0 0;padding:0;list-style:none}
.picks li{display:flex;justify-content:space-between;gap:12px;padding:8px 4px;border-bottom:1px solid #eee2cf}
.picks li span:last-child{color:var(--muted);white-space:nowrap}
.picks li.win{font-weight:800;color:var(--burgundy)}
.status-line{text-align:center;color:#cdb9a3;font-size:.85rem;margin:14px 0 0}
.history{margin-top:34px;background:rgba(253,246,234,.08);border:1px solid rgba(253,246,234,.16);border-radius:20px;padding:18px 20px}
.history h3{font-family:"Roboto Slab",Georgia,serif;margin:0 0 8px;font-size:1.05rem;color:#f7e6c4}
.history ul{margin:0;padding:0;list-style:none}
.history li{display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-top:1px solid rgba(253,246,234,.1);font-size:.95rem}
.history li:first-child{border-top:0}
.history .meta{color:#cdb9a3;white-space:nowrap}
.skeleton{min-height:280px;display:grid;place-items:center;color:var(--muted)}
footer{text-align:center;color:#a8927e;font-size:.8rem;margin-top:28px}
footer a{color:inherit}
@keyframes bob{50%{transform:translateY(-8px) rotate(-3deg)}}
@keyframes twinkle{50%{opacity:.2;transform:scale(.7)}}
@keyframes dot{0%,100%{opacity:.25}40%{opacity:1}}
@keyframes pop{from{transform:scale(.85);opacity:0}}
@keyframes fall{to{transform:translateY(560px) rotate(540deg)}}
@media (max-width:420px){main{padding-top:28px}.card{padding:24px 18px;border-radius:22px}.card h2{font-size:1.25rem}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
`;

const HEAD = (title) => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<meta name="description" content="Everyone picks a movie. One movie wins. Let fate decide what we're watching!">
<meta name="theme-color" content="#140c09">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎬</text></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;600;700;800&family=Roboto+Slab:wght@700;800&display=swap" rel="stylesheet">
<style>${STYLE}</style>
</head>`;

const HEADER = `<header>
  ${ICONS.clapper}
  <h1>Family Movie<br>Night Lottery</h1>
  <p class="tagline">Everyone picks a movie. One movie wins. Let fate decide what we're watching!</p>
</header>`;

export function mainPage() {
  return `${HEAD('🎬 Family Movie Night Lottery')}
<body>
<main>
  ${HEADER}
  <section id="card" class="card skeleton" aria-live="polite"><p>Rolling the film…</p></section>
  <p id="status-line" class="status-line"></p>
  <section id="history" class="history" hidden></section>
  <footer>🍿 Good movies, better company.</footer>
</main>
<script>
const ICONS = ${JSON.stringify(ICONS)};
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate = (ms) => new Date(ms).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const shortDate = (ms) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const plural = (n, one, many) => n === 1 ? one : many;
let lastState = null, timer = null, failures = 0;

function renderOpen(s) {
  const n = s.submittedCount, total = s.total, left = total - n;
  const msg = n === 0 ? 'Waiting for everyone to submit their movie!'
    : 'Waiting for ' + left + ' more family ' + plural(left, 'member', 'members') + ' to submit their movie!';
  const hasForm = /^https:\\/\\//.test(s.formUrl || '');
  const chips = [
    ...s.submitted.map((m) => '<li class="chip in">' + esc(m) + '</li>'),
    ...s.needsAttention.map((m) => '<li class="chip attn">' + esc(m) + '</li>'),
    ...s.waitingFor.map((m) => '<li class="chip">' + esc(m) + '</li>'),
  ].join('');
  const attn = s.needsAttention.length
    ? '<p class="attention">' + esc(s.needsAttention.join(', ')) + ' sent more than one movie. The organizer will pick the right one.</p>' : '';
  return '<h2>' + ICONS.people + '<span>' + n + ' of ' + total + ' Movies Submitted</span></h2>'
    + '<div class="progress-row"><div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="' + total + '" aria-valuenow="' + n + '" aria-label="Movies submitted"><div class="bar" style="width:' + (n / total * 100) + '%"></div></div><span class="count">' + n + ' / ' + total + '</span></div>'
    + '<p class="lead">' + msg + '</p>'
    + (hasForm
      ? '<a class="btn" href="' + esc(s.formUrl) + '" target="_blank" rel="noopener">' + ICONS.film + 'Submit Your Movie</a><p class="note">Opens a Notion form (no account needed)</p>'
      : '<span class="btn" aria-disabled="true">' + ICONS.film + 'Submit Your Movie</span><p class="note">The organizer hasn\\'t added the form link yet.</p>')
    + attn + '<ul class="chips" aria-label="Who has submitted">' + chips + '</ul>';
}

function renderDrawing() {
  return '<div class="drawing"><h2>All movies are in!<span class="sub">Drawing our winner…</span></h2>'
    + '<span class="sparkles">' + ICONS.popcorn + '</span><div class="dots"><i></i><i></i><i></i><i></i><i></i></div></div>';
}

function renderCompleted(s) {
  const w = s.winner;
  const picks = s.entries.map((e) => '<li class="' + (e.title === w.title && e.member === w.member ? 'win' : '') + '"><span>' + esc(e.title) + '</span><span>' + esc(e.member) + '</span></li>').join('');
  return '<div class="confetti" id="confetti"></div>'
    + '<p class="winner-kicker">🎉 Tonight\\'s Winning Movie!</p>'
    + '<p class="winner-title reveal">' + esc(w.title) + '</p>'
    + '<p class="winner-by">Submitted by <strong>' + esc(w.member) + '</strong></p>'
    + '<p class="winner-date">Drawn ' + esc(fmtDate(w.drawnAt)) + '</p>'
    + '<p class="popcorn-line">🍿 Get the popcorn ready!</p>'
    + '<details class="picks"><summary>See all ' + s.entries.length + ' picks</summary><ol>' + picks + '</ol></details>';
}

function confetti() {
  const box = $('confetti');
  if (!box || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#b5172b', '#f2bf68', '#e58a3a', '#2f7d4f', '#3b6fb6', '#d24d7a'];
  for (let i = 0; i < 60; i++) {
    const p = document.createElement('i');
    p.style.left = Math.random() * 100 + '%';
    p.style.background = colors[i % colors.length];
    p.style.animationDuration = 2.5 + Math.random() * 2.5 + 's';
    p.style.animationDelay = Math.random() * 1.2 + 's';
    box.appendChild(p);
  }
}

function render(s) {
  const card = $('card');
  card.classList.remove('skeleton');
  const html = s.state === 'open' ? renderOpen(s) : s.state === 'drawing' ? renderDrawing() : renderCompleted(s);
  if (card.dataset.html !== html) {
    card.innerHTML = html;
    card.dataset.html = html;
    if (s.state === 'completed' && lastState !== 'completed') confetti();
  }
  lastState = s.state;
  $('status-line').textContent = s.state === 'open'
    ? (s.notionError ? 'Having trouble reaching Notion. Retrying automatically…' : 'Updates automatically. ' + s.round.label)
    : s.round.label;
  const hist = $('history');
  if (s.history && s.history.length) {
    hist.hidden = false;
    hist.innerHTML = '<h3>Past winners</h3><ul>' + s.history.map((h) => '<li><span>' + esc(h.title) + '</span><span class="meta">' + esc(h.member) + ' · ' + esc(shortDate(h.drawnAt)) + '</span></li>').join('') + '</ul>';
  } else hist.hidden = true;
}

async function refresh() {
  clearTimeout(timer);
  let delay = 10000;
  try {
    const res = await fetch('/api/status', { cache: 'no-store' });
    const s = await res.json();
    if (!res.ok) throw new Error(s.error || res.statusText);
    failures = 0;
    render(s);
    if (s.state === 'drawing') delay = Math.min(Math.max(s.revealAt - Date.now() + 500, 1500), 5000);
    if (s.state === 'completed') delay = 60000;
  } catch (e) {
    failures++;
    delay = Math.min(10000 * failures, 60000);
    if (!lastState) { $('card').innerHTML = '<p>' + esc(e.message || 'Can\\'t reach the lottery right now.') + '</p><p class="note">Retrying automatically…</p>'; }
    else $('status-line').textContent = 'Connection hiccup. Retrying…';
  }
  timer = setTimeout(refresh, delay);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
refresh();
</script>
</body></html>`;
}

export function adminPage() {
  return `${HEAD('Admin · Family Movie Night Lottery')}
<body>
<main>
  <header><h1 style="font-size:2rem">Lottery Admin</h1><p class="tagline">Only the organizer needs this page.</p></header>
  <section class="card" style="text-align:left">
    <form id="login" style="display:flex;gap:8px;flex-wrap:wrap">
      <label for="token" style="width:100%;font-weight:700">Admin token</label>
      <input id="token" type="password" autocomplete="current-password" required style="flex:1;min-width:0;padding:12px 14px;border-radius:12px;border:1.5px solid #d6c6ae;font:inherit">
      <button class="btn" style="width:auto;min-height:0;padding:12px 22px;font-size:1rem">Unlock</button>
    </form>
    <div id="panel" hidden>
      <div id="info"></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px">
        <button class="btn" id="check" style="width:auto;font-size:1rem">Check Notion now</button>
        <button class="btn" id="new" style="width:auto;font-size:1rem;background:#3d2a20">Start new round</button>
      </div>
      <details class="picks" open><summary>How to fix a duplicate</summary>
        <p>When someone submits more than once, every one of their rows is marked <b>Duplicate</b> in the Movie Submissions database and they don't count yet. Open the database in Notion and set <b>Status</b> to <b>Rejected</b> on the rows you don't want (or delete them). On the next check (within a minute) the remaining row becomes <b>Counted</b>.</p>
        <p>To replace a movie before the draw, just edit its <b>Movie Title</b> in Notion.</p>
      </details>
    </div>
    <p id="msg" class="note" role="status"></p>
  </section>
  <footer><a href="/">← Back to the lottery</a></footer>
</main>
<script>
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const when = (ms) => ms ? new Date(ms).toLocaleString() : '—';
let token = '';
try { token = sessionStorage.getItem('adminToken') || ''; } catch {}

async function api(path, method = 'GET') {
  const res = await fetch(path, { method, headers: { Authorization: 'Bearer ' + token } });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { token = ''; try { sessionStorage.removeItem('adminToken'); } catch {} show(false); throw new Error('Wrong token.'); }
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
function show(on) { $('panel').hidden = !on; $('login').hidden = on; }
function render(r) {
  const p = r.progress || { submitted: [], missing: r.members, conflicts: [] };
  const list = (a) => a.length ? a.map(esc).join(', ') : '—';
  let html = '<h2 style="justify-content:flex-start">' + esc(r.label) + ' · ' + esc(r.status) + '</h2>'
    + '<p>Round ID: <code>' + esc(r.id) + '</code><br>Started: ' + esc(r.startedAt ? when(r.startedAt) : 'beginning') + '<br>Last Notion check: ' + esc(when(r.checkedAt)) + '</p>';
  if (r.lastError) html += '<p class="attention">Last Notion error: ' + esc(r.lastError) + '</p>';
  if (r.status === 'Open') {
    html += '<p><b>Counted (' + p.submitted.length + '/' + r.members.length + '):</b> ' + list(p.submitted) + '</p>'
      + '<p><b>Duplicates to resolve:</b> ' + list(p.conflicts) + '</p>'
      + '<p><b>Not yet submitted:</b> ' + list(p.missing) + '</p>';
  } else if (r.status === 'Completed') {
    html += '<p><b>Winner:</b> ' + esc(r.winnerTitle) + ' (' + esc(r.winnerMember) + '), drawn ' + esc(when(r.drawnAt)) + '</p>'
      + '<p><b>Synced to Notion:</b> ' + (r.notionSynced ? 'yes' : 'pending, retrying every minute') + '</p>';
  } else {
    html += '<p>Winner drawn ' + esc(when(r.drawnAt)) + '. Revealing shortly…</p>';
  }
  $('info').innerHTML = html;
  $('new').disabled = r.status !== 'Completed';
  $('new').style.opacity = r.status === 'Completed' ? 1 : .5;
}
async function load(path = '/api/admin/status', method = 'GET') {
  $('msg').textContent = 'Working…';
  try { render(await api(path, method)); show(true); $('msg').textContent = ''; }
  catch (e) { $('msg').textContent = e.message; }
}
$('login').addEventListener('submit', (e) => {
  e.preventDefault(); token = $('token').value.trim();
  try { sessionStorage.setItem('adminToken', token); } catch {}
  load();
});
$('check').addEventListener('click', () => load('/api/admin/check', 'POST'));
$('new').addEventListener('click', async () => {
  if (!confirm('Start a new movie night? Progress resets to 0 of 9. The previous winner is kept.')) return;
  try { await api('/api/admin/new-round', 'POST'); await load(); $('msg').textContent = 'New round started. Share the form link again!'; }
  catch (e) { $('msg').textContent = e.message; }
});
if (token) load();
</script>
</body></html>`;
}
