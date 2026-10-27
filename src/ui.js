// The two HTML pages, served by the Worker. No build step, no framework.
// All data is rendered client-side from the JSON API and is always escaped.

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
.movie-form{text-align:left;max-width:400px;margin:4px auto 0;display:grid;gap:14px}
.movie-form label{display:grid;gap:6px;font-weight:700}
.field{width:100%;font:inherit;font-size:1.05rem;color:var(--ink);background:#fff;border:1.5px solid #d6c6ae;border-radius:14px;padding:13px 14px;min-height:52px}
.field:focus{outline:3px solid rgba(242,191,104,.6);border-color:var(--gold)}
.movie-form .btn{justify-self:center;margin-top:4px}
.movie-form .note{text-align:center;margin:0}
.hp{position:absolute!important;left:-9999px;width:1px;height:1px;opacity:0}
.hint{margin:0;color:var(--warn);font-size:.92rem}
.msg{margin:0;text-align:center;font-weight:700}
.msg.err{color:var(--burgundy)}
.thanks{font-size:1.1rem;margin:6px 0 0}
.linkish{background:none;border:0;color:var(--burgundy);font:inherit;font-weight:700;text-decoration:underline;cursor:pointer;padding:6px}
.admin-card{text-align:left;margin-bottom:18px}
.admin-card h2{justify-content:flex-start}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.btn.small{width:auto;min-height:0;font-size:.95rem;padding:10px 18px;box-shadow:none}
.btn.dark{background:#3d2a20}
.btn:disabled{background:#b9ab9e;box-shadow:none;cursor:not-allowed;transform:none}
.member{padding:12px 0;border-top:1px solid #eadfcd}
.member:first-of-type{border-top:0}
.member-head{display:flex;justify-content:space-between;align-items:center;gap:10px}
.member-name{font-weight:800}
.badge{font-size:.8rem;font-weight:800;padding:3px 10px;border-radius:99px;white-space:nowrap}
.badge.ready{background:#dcefe2;color:var(--ok)}
.badge.duplicate{background:#fdecc8;color:var(--warn)}
.badge.missing{background:#efe6d8;color:var(--muted)}
.sub-list{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:6px}
.sub-item{display:flex;justify-content:space-between;align-items:center;gap:8px;background:#fff;border:1px solid #eadfcd;border-radius:12px;padding:8px 10px}
.sub-item .t{font-weight:700;overflow-wrap:anywhere}
.sub-item .when{display:block;color:var(--muted);font-size:.8rem;font-weight:400}
.sub-item .actions{display:flex;gap:2px;flex-shrink:0}
.sub-item .actions button{font-size:.85rem;padding:4px 6px}
.draw-hint{color:var(--muted);margin:10px 0 0}
.winner-box{background:#fff;border:1.5px solid #e4bcc0;border-radius:16px;padding:14px 16px;margin:6px 0 16px}
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
  <section class="card">
    <div id="status" aria-live="polite"><p class="skeleton">Rolling the film…</p></div>
    <div id="form-wrap" hidden>
      <form id="movie-form" class="movie-form" novalidate>
        <label>Your Name
          <select class="field" name="name" id="name" required><option value="">Choose your name…</option></select>
        </label>
        <label>Movie Title
          <input class="field" name="title" id="title" required maxlength="120" autocomplete="off" placeholder="e.g. The Princess Bride">
        </label>
        <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
        <p class="hint" id="dup-hint" hidden></p>
        <button class="btn" id="submit-btn">${ICONS.film}Submit Your Movie</button>
        <p class="note">No account needed. Your pick stays secret until the draw.</p>
        <p class="msg err" id="form-msg" role="alert"></p>
      </form>
      <div id="thanks" hidden>
        <p class="thanks" id="thanks-text"></p>
        <button class="linkish" id="again" type="button">Submit for someone else</button>
      </div>
    </div>
    <div id="chips"></div>
  </section>
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
let status = null, lastState = null;

function renderOpen(s) {
  const n = s.submittedCount, total = s.total, left = total - n;
  const msg = n === 0 ? 'Waiting for everyone to submit their movie!'
    : 'Waiting for ' + left + ' more family ' + plural(left, 'member', 'members') + ' to submit their movie!';
  return '<h2>' + ICONS.people + '<span>' + n + ' of ' + total + ' Movies Submitted</span></h2>'
    + '<div class="progress-row"><div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="' + total + '" aria-valuenow="' + n + '" aria-label="Movies submitted"><div class="bar" style="width:' + (n / total * 100) + '%"></div></div><span class="count">' + n + ' / ' + total + '</span></div>'
    + '<p class="lead">' + msg + '</p>';
}

function renderChips(s) {
  if (s.state !== 'open') return '';
  const chips = [
    ...s.submitted.map((m) => '<li class="chip in">' + esc(m) + '</li>'),
    ...s.needsAttention.map((m) => '<li class="chip attn">' + esc(m) + '</li>'),
    ...s.waitingFor.map((m) => '<li class="chip">' + esc(m) + '</li>'),
  ].join('');
  const attn = s.needsAttention.length
    ? '<p class="attention">' + esc(s.needsAttention.join(', ')) + ' sent more than one movie. The organizer will pick the right one.</p>' : '';
  return attn + '<ul class="chips" aria-label="Who has submitted">' + chips + '</ul>';
}

function renderReady() {
  return '<div class="drawing"><h2>All movies are in!<span class="sub">Waiting for the organizer to draw our winner…</span></h2>'
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

function fillNames(s) {
  const sel = $('name');
  if (sel.options.length > 1) return;
  for (const m of s.members) sel.add(new Option(m, m));
}

function updateDupHint() {
  const name = $('name').value, hint = $('dup-hint');
  const already = status && name && (status.submitted.includes(name) || status.needsAttention.includes(name));
  hint.hidden = !already;
  if (already) hint.textContent = name + ' already has a movie in. Submitting again flags a duplicate for the organizer to sort out.';
}

function render(s) {
  status = s;
  const html = s.state === 'completed' ? renderCompleted(s) : s.state === 'ready' ? renderReady() : renderOpen(s);
  const box = $('status');
  if (box.dataset.html !== html) {
    box.innerHTML = html;
    box.dataset.html = html;
    if (s.state === 'completed' && lastState !== 'completed') confetti();
  }
  $('chips').innerHTML = renderChips(s);
  $('form-wrap').hidden = s.state !== 'open';
  if (s.state === 'open') { fillNames(s); updateDupHint(); }
  lastState = s.state;
  $('status-line').textContent = s.round.label;
  const hist = $('history');
  if (s.history && s.history.length) {
    hist.hidden = false;
    hist.innerHTML = '<h3>Past winners</h3><ul>' + s.history.map((h) => '<li><span>' + esc(h.title) + '</span><span class="meta">' + esc(h.member) + ' · ' + esc(shortDate(h.drawnAt)) + '</span></li>').join('') + '</ul>';
  } else hist.hidden = true;
}

async function refresh() {
  try {
    const res = await fetch('/api/status', { cache: 'no-store' });
    const s = await res.json();
    if (!res.ok) throw new Error(s.error || res.statusText);
    render(s);
  } catch (e) {
    if (!lastState) $('status').innerHTML = '<p>' + esc(e.message || 'Can\\'t reach the lottery right now.') + '</p><p class="note">Try reloading the page.</p>';
    else $('status-line').textContent = 'Connection hiccup. Reload to try again.';
  }
}

$('name').addEventListener('change', updateDupHint);
$('movie-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target, msg = $('form-msg'), btn = $('submit-btn');
  const data = Object.fromEntries(new FormData(form));
  if (!data.name) { msg.textContent = 'Please choose your name.'; $('name').focus(); return; }
  if (!data.title.trim()) { msg.textContent = 'Please enter a movie title.'; $('title').focus(); return; }
  msg.textContent = '';
  btn.disabled = true;
  try {
    const res = await fetch('/api/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error || 'Something went wrong.');
    form.reset();
    form.hidden = true;
    $('thanks').hidden = false;
    $('thanks-text').textContent = '🍿 Thanks, ' + (out.member || data.name) + '! Your movie is in. It stays secret until the draw.';
    await refresh();
  } catch (err) {
    msg.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});
$('again').addEventListener('click', () => { $('thanks').hidden = true; $('movie-form').hidden = false; $('name').focus(); });
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
  <section class="card admin-card" id="login-card" hidden>
    <form id="login" class="movie-form" style="max-width:none">
      <label>Admin password
        <input class="field" id="password" type="password" autocomplete="current-password" required>
      </label>
      <button class="btn">Sign in</button>
      <p class="msg err" id="login-msg" role="alert"></p>
    </form>
  </section>
  <div id="dash" hidden>
    <section class="card admin-card" id="round-card"></section>
    <section class="card admin-card" id="members-card"></section>
    <section class="card admin-card" id="extra-card" hidden></section>
    <div class="row" style="justify-content:center">
      <a class="btn small dark" href="/api/admin/export" download>Download backup</a>
      <button class="btn small dark" id="logout">Sign out</button>
    </div>
  </div>
  <p class="msg" id="msg" role="status" style="color:var(--cream);margin-top:14px"></p>
  <footer><a href="/">← Back to the lottery</a></footer>
</main>
<script>
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const when = (ms) => new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
let state = null;

async function call(path, body) {
  const res = await fetch(path, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/api/admin/login') { showLogin(); throw new Error(data.error || 'Please sign in.'); }
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function showLogin() { $('dash').hidden = true; $('login-card').hidden = false; $('password').focus(); }

function subItem(s, open) {
  const meta = when(s.createdAt) + (s.source === 'admin' ? ' · added by you' : '') + (s.updatedAt && !s.removedAt ? ' · edited' : '');
  const actions = !open ? '' : s.removedAt
    ? '<button class="linkish" data-act="restore" data-id="' + s.id + '">Restore</button>'
    : '<button class="linkish" data-act="edit" data-id="' + s.id + '">Edit</button><button class="linkish" data-act="remove" data-id="' + s.id + '">Remove</button>';
  return '<li class="sub-item"><span><span class="t">' + esc(s.title) + '</span><span class="when">' + (s.removedAt ? esc(s.member) + ' · ' : '') + esc(meta) + '</span></span><span class="actions">' + actions + '</span></li>';
}

function render(st) {
  state = st;
  const r = st.round, open = r.status === 'Open';
  let html = '<h2>' + esc(r.label) + ' · ' + (open ? 'Open' : 'Drawn') + '</h2>';
  if (open) {
    html += '<div class="progress-row"><div class="progress"><div class="bar" style="width:' + (st.readyCount / st.total * 100) + '%"></div></div><span class="count">' + st.readyCount + ' / ' + st.total + '</span></div>';
    const dups = st.members.filter((m) => m.status === 'duplicate').map((m) => m.name);
    const missing = st.members.filter((m) => m.status === 'missing').map((m) => m.name);
    const hint = st.canDraw ? 'Everyone has exactly one movie. Ready when you are!'
      : [missing.length ? 'Waiting for: ' + missing.join(', ') + '.' : '', dups.length ? 'Remove extra entries for: ' + dups.join(', ') + '.' : ''].join(' ');
    html += '<p class="draw-hint">' + esc(hint) + '</p><div class="row" style="margin-top:14px"><button class="btn" id="draw"' + (st.canDraw ? '' : ' disabled') + '>🎲 Draw Winning Movie</button></div>';
  } else {
    html += '<div class="winner-box"><p class="winner-kicker" style="margin:0 0 4px">🎉 ' + esc(r.winnerTitle) + '</p><p style="margin:0">Submitted by <b>' + esc(r.winnerMember) + '</b> · drawn ' + esc(when(r.drawnAt)) + '</p></div>'
      + '<p class="draw-hint" style="margin:0 0 14px">The winner is saved permanently and can\\'t be redrawn. When it\\'s time for the next movie night:</p>'
      + '<button class="btn dark" id="new-round">Start New Round</button>';
  }
  $('round-card').innerHTML = html;

  const label = { ready: '✓ Ready', duplicate: '! Duplicate', missing: 'Not yet' };
  $('members-card').innerHTML = '<h2>' + (open ? 'Family submissions' : 'This round\\'s picks') + '</h2>' + st.members.map((m) =>
    '<div class="member"><div class="member-head"><span class="member-name">' + esc(m.name) + '</span><span class="badge ' + m.status + '">' + label[m.status] + '</span></div>'
    + (m.submissions.length ? '<ul class="sub-list">' + m.submissions.map((s) => subItem(s, open)).join('') + '</ul>' : '')
    + (open && m.status === 'missing' ? '<button class="linkish" data-act="add" data-name="' + esc(m.name) + '">+ Add a movie for ' + esc(m.name) + '</button>' : '')
    + '</div>').join('');

  const extra = [];
  if (st.unknown.length) extra.push('<h2>Other names</h2><p class="draw-hint">Entries under a name that is no longer in the family list. They never count.</p><ul class="sub-list">' + st.unknown.map((s) => subItem({ ...s, title: s.title + ' (' + s.member + ')' }, open)).join('') + '</ul>');
  if (st.removed.length) extra.push('<h2>Removed</h2><ul class="sub-list">' + st.removed.map((s) => subItem(s, open)).join('') + '</ul>');
  $('extra-card').hidden = !extra.length;
  $('extra-card').innerHTML = extra.join('');

  $('login-card').hidden = true;
  $('dash').hidden = false;
}

async function act(action, payload, confirmText) {
  if (confirmText && !confirm(confirmText)) return;
  $('msg').textContent = '';
  try { render(await call('/api/admin/' + action, payload || {})); }
  catch (e) { $('msg').textContent = e.message; }
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.id === 'draw') return act('draw', {}, 'Draw the winning movie now? This can only happen once per round.');
  if (b.id === 'new-round') return act('new-round', {}, 'Start a new movie night? Progress resets to 0 of ' + state.total + '. Past winners are kept.');
  if (b.id === 'logout') return call('/api/admin/logout', {}).finally(showLogin);
  const id = Number(b.dataset.id);
  if (b.dataset.act === 'remove') return act('remove', { id }, 'Remove this submission? You can restore it later.');
  if (b.dataset.act === 'restore') return act('restore', { id });
  if (b.dataset.act === 'edit') {
    const sub = [...state.members.flatMap((m) => m.submissions), ...state.unknown].find((s) => s.id === id);
    const title = prompt('Movie title', sub ? sub.title : '');
    if (title !== null) act('edit', { id, title });
  }
  if (b.dataset.act === 'add') {
    const title = prompt('Movie title for ' + b.dataset.name);
    if (title) act('add', { name: b.dataset.name, title });
  }
});

$('login').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('login-msg').textContent = '';
  try {
    await call('/api/admin/login', { password: $('password').value });
    $('password').value = '';
    render(await call('/api/admin/state'));
  } catch (err) { $('login-msg').textContent = err.message; }
});

call('/api/admin/state').then(render).catch(showLogin);
</script>
</body></html>`;
}
