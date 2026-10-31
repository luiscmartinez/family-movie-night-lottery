// The two HTML pages, served by the Worker. No build step, no framework.
// All data is rendered client-side from the JSON API and is always escaped.

const ICONS = {
  clapper: `<svg class="clapper" viewBox="0 0 96 80" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M10 6l6 7M4 22l9 1M24 2l1 8M86 8l-6 7M92 24l-9 1"/><rect x="22" y="34" width="56" height="40" rx="6"/><path d="M22 34l-3-14 54-9 3 14z"/><path d="M31 18.5l9 12M45 16l9 12M59 13.6l9 12"/><path d="M33 48h28M33 59h20"/></g></svg>`,
  people: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm7.5 0a3.5 3.5 0 1 0-1.2-6.8A5.9 5.9 0 0 1 16.4 7c0 1.4-.4 2.6-1.2 3.6.4.2.8.4 1.3.4zM9 13c-3.9 0-7 2-7 4.5V20h14v-2.5C16 15 12.9 13 9 13zm8.6.2c1.4.9 2.4 2.3 2.4 4.3V20h3v-2.2c0-2.3-2.4-4.1-5.4-4.6z"/></svg>`,
  film: `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4M3 12h4M3 16h4M17 8h4M17 12h4M17 16h4"/></g></svg>`,
  popcorn: `<svg class="bucket" viewBox="0 0 120 120" aria-hidden="true"><g fill="#f6dd9c" stroke="#d9a94b" stroke-width="2"><circle cx="34" cy="38" r="12"/><circle cx="52" cy="28" r="13"/><circle cx="70" cy="30" r="12"/><circle cx="86" cy="40" r="11"/><circle cx="44" cy="44" r="11"/><circle cx="62" cy="42" r="12"/><circle cx="78" cy="48" r="10"/></g><path d="M24 48h72l-9 64H33z" fill="#fff8ec"/><path d="M33 48h11l3 64H37zM55 48h10v64H55zM76 48h11l-4 64h-10z" fill="#b5172b"/><path d="M24 48h72l-9 64H33z" fill="none" stroke="#7a1422" stroke-width="3" stroke-linejoin="round"/></svg>`,
};

// Prize-wheel animation shared by both pages. The winner is already decided
// and saved by the server; the wheel only animates to land on winnerIndex.
// Kept as a plain string so it reaches the browser exactly as written.
export const WHEEL_SCRIPT = `
function wheelRotation(n, winnerIndex, jitter, turns) {
  // Rotating the wheel clockwise by this many degrees puts the winning
  // slice (offset by jitter, a fraction of a slice) under the top pointer.
  var seg = 360 / n;
  return 360 * turns - (winnerIndex + 0.5 + jitter) * seg;
}

function wheelSvg(labels) {
  var n = labels.length, seg = 360 / n, r = 148, c = 160;
  var dark = ['#7b1421', '#4e0d16'], light = ['#fdf6ea', '#f2bf68'];
  // Labels must fit between the center hub and the rim (about 95px).
  var size = n <= 8 ? 13 : n <= 14 ? 11 : 10;
  var max = n <= 14 ? 13 : 11;
  var out = '<svg viewBox="0 0 320 320" role="img" aria-label="Prize wheel with ' + n + ' movies"><circle cx="160" cy="160" r="157" fill="#3a1f14"/>';
  for (var i = 0; i < n; i++) {
    var a0 = i * seg * Math.PI / 180, a1 = (i + 1) * seg * Math.PI / 180;
    var x0 = c + r * Math.sin(a0), y0 = c - r * Math.cos(a0);
    var x1 = c + r * Math.sin(a1), y1 = c - r * Math.cos(a1);
    var odd = n % 2 === 1 && i === n - 1; // keeps the last slice from matching the first
    var isDark = i % 2 === 0 && !odd;
    var fill = odd ? '#e58a3a' : isDark ? dark[(i / 2) % 2] : light[((i - 1) / 2) % 2];
    var label = String(labels[i]);
    if (label.length > max) label = label.slice(0, max - 1) + '…';
    label = label.replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; });
    out += '<path class="seg" data-i="' + i + '" fill="' + fill + '" d="M' + c + ' ' + c + 'L' + x0.toFixed(2) + ' ' + y0.toFixed(2)
      + 'A' + r + ' ' + r + ' 0 ' + (seg > 180 ? 1 : 0) + ' 1 ' + x1.toFixed(2) + ' ' + y1.toFixed(2) + 'Z"/>';
    out += '<text transform="rotate(' + ((i + 0.5) * seg - 90).toFixed(2) + ' ' + c + ' ' + c + ')" x="' + (c + r - 14) + '" y="' + c
      + '" fill="' + (isDark ? '#fdf6ea' : '#2b1a12') + '" font-size="' + size + '" text-anchor="end" dominant-baseline="middle">' + label + '</text>';
  }
  for (var k = 0; k < n; k++) {
    var a = k * seg * Math.PI / 180;
    out += '<circle cx="' + (c + 151 * Math.sin(a)).toFixed(2) + '" cy="' + (c - 151 * Math.cos(a)).toFixed(2) + '" r="4" fill="#f2bf68"/>';
  }
  return out + '</svg>';
}

function spinWheel(el, labels, winnerIndex, onLand, onDone) {
  el.innerHTML = '<div class="wheel-wrap"><div class="wheel-pointer"></div><div class="wheel">' + wheelSvg(labels)
    + '</div><div class="wheel-hub" aria-hidden="true">🍿</div></div>';
  var wheel = el.querySelector('.wheel'), pointer = el.querySelector('.wheel-pointer');
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ms = reduce ? 0 : 6500, seg = 360 / labels.length, lastSlice = -1, landed = false;
  var target = wheelRotation(labels.length, winnerIndex, Math.random() * 0.6 - 0.3, reduce ? 1 : 6);
  function tick() {
    if (landed) return;
    var m = getComputedStyle(wheel).transform;
    if (m && m !== 'none') {
      var v = m.split('(')[1].split(',');
      var slice = Math.floor(((Math.atan2(+v[1], +v[0]) * 180 / Math.PI) + 360) % 360 / seg);
      if (slice !== lastSlice) {
        lastSlice = slice;
        pointer.classList.remove('tick');
        void pointer.offsetWidth;
        pointer.classList.add('tick');
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      wheel.style.transition = 'transform ' + ms + 'ms cubic-bezier(.12,.7,.1,1)';
      wheel.style.transform = 'rotate(' + target + 'deg)';
      tick();
    });
  });
  setTimeout(function () {
    landed = true;
    var win = el.querySelector('.seg[data-i="' + winnerIndex + '"]');
    if (win) win.classList.add('seg-win');
    if (onLand) onLand();
    setTimeout(onDone, reduce ? 600 : 1800);
  }, ms + 100);
}
`;

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
.wheel-wrap{position:relative;width:min(320px,78vw);aspect-ratio:1;margin:18px auto 6px}
.wheel{width:100%;height:100%;border-radius:50%;box-shadow:0 14px 34px rgba(0,0,0,.35),0 0 0 5px var(--gold);will-change:transform}
.wheel svg{width:100%;height:100%;display:block;font-family:"Nunito Sans",system-ui,sans-serif;font-weight:800}
.wheel .seg{stroke:#3a1f14;stroke-width:1.5}
.wheel .seg-win{stroke:#fff;stroke-width:4;filter:brightness(1.18);animation:winpulse .6s ease-in-out 3}
.wheel-pointer{position:absolute;top:-16px;left:50%;margin-left:-15px;width:0;height:0;border-left:15px solid transparent;border-right:15px solid transparent;border-top:32px solid var(--gold);filter:drop-shadow(0 3px 3px rgba(0,0,0,.45));z-index:2;transform-origin:50% 0}
.wheel-pointer.tick{animation:tick .14s ease-out}
.wheel-hub{position:absolute;left:50%;top:50%;width:22%;aspect-ratio:1;transform:translate(-50%,-50%);border-radius:50%;background:var(--cream);border:4px solid var(--gold);display:grid;place-items:center;font-size:clamp(1.2rem,6vw,1.8rem);box-shadow:0 4px 12px rgba(0,0,0,.35);z-index:2}
.wheel-caption{font-family:"Roboto Slab",Georgia,serif;font-weight:800;font-size:1.3rem;color:var(--burgundy);min-height:1.6em;margin:12px 0 0;overflow-wrap:anywhere}
.peek{background:none;border:0;cursor:pointer;color:var(--muted);padding:6px;border-radius:8px;display:inline-grid;place-items:center}
.peek:hover,.peek[aria-pressed=true]{color:var(--burgundy)}
.peek:focus-visible{outline:3px solid var(--gold)}
.peek svg{width:20px;height:20px}
.t.masked{letter-spacing:.18em;color:var(--muted)}
.sr-only{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.members-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:16px}
.members-head h2{margin:0}
@keyframes bob{50%{transform:translateY(-8px) rotate(-3deg)}}
@keyframes twinkle{50%{opacity:.2;transform:scale(.7)}}
@keyframes dot{0%,100%{opacity:.25}40%{opacity:1}}
@keyframes tick{40%{transform:rotate(-14deg)}}
@keyframes winpulse{50%{filter:brightness(1.4)}}
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
${WHEEL_SCRIPT}
const ICONS = ${JSON.stringify(ICONS)};
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate = (ms) => new Date(ms).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const shortDate = (ms) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const plural = (n, one, many) => n === 1 ? one : many;
let status = null, lastState = null, spinning = false, pending = null;
const spunHere = new Set();

// Each viewer sees the wheel spin once per round; "Replay the spin" shows it again.
function spinKey(s) { return 'fmnl-spun-' + s.round.number + '-' + s.winner.drawnAt; }
function hasSpun(s) {
  if (spunHere.has(spinKey(s))) return true;
  try { return localStorage.getItem(spinKey(s)) === '1'; } catch { return false; }
}
function markSpun(s) {
  spunHere.add(spinKey(s));
  try { localStorage.setItem(spinKey(s), '1'); } catch {}
}

function playSpin(s) {
  spinning = true;
  status = s;
  $('form-wrap').hidden = true;
  $('chips').innerHTML = '';
  const box = $('status');
  box.dataset.html = '';
  box.innerHTML = '<p class="winner-kicker">🎡 Spinning the wheel…</p><div id="wheel"></div><p class="wheel-caption" id="wheel-caption" aria-live="polite"></p>';
  spinWheel($('wheel'), s.entries.map((e) => e.title), s.winnerIndex,
    () => { $('wheel-caption').textContent = '🎉 ' + s.winner.title; },
    () => {
      markSpun(s);
      spinning = false;
      lastState = null; // so the reveal gets confetti
      const next = pending || s;
      pending = null;
      render(next);
    });
}

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
  return '<div class="drawing"><h2>All movies are in!<span class="sub">Waiting for the organizer to spin the wheel…</span></h2>'
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
    + '<p style="margin:14px 0 0"><button class="linkish" id="replay" type="button">🎡 Replay the spin</button></p>'
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
  if (spinning) { pending = s; return; }
  if (s.state === 'completed' && s.entries.length > 1 && !hasSpun(s)) return playSpin(s);
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
document.addEventListener('click', (e) => {
  if (e.target.closest('#replay') && status && !spinning) playSpin(status);
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
${WHEEL_SCRIPT}
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const when = (ms) => new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></g></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.7 3.6M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18"/></g></svg>';
let state = null, spinning = false;
// Movie titles are hidden until the organizer peeks; nothing here is remembered across visits.
const revealed = new Set();

function allSubs(st) {
  return [...st.members.flatMap((m) => m.submissions), ...st.unknown, ...st.removed];
}

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
  const shown = revealed.has(s.id);
  const peek = '<button class="peek" data-act="peek" data-id="' + s.id + '" aria-pressed="' + shown + '" aria-label="' + (shown ? 'Hide' : 'Show') + ' movie title" title="' + (shown ? 'Hide' : 'Show') + ' title">' + (shown ? EYE_OFF : EYE) + '</button>';
  const title = shown ? esc(s.title) : '<span class="sr-only">Hidden title</span><span aria-hidden="true">••••••••</span>';
  return '<li class="sub-item"><span><span class="t' + (shown ? '' : ' masked') + '">' + title + '</span><span class="when">' + (s.removedAt ? esc(s.member) + ' · ' : '') + esc(meta) + '</span></span><span class="actions">' + peek + actions + '</span></li>';
}

function render(st) {
  state = st;
  if (spinning) return;
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
      + '<div class="row"><button class="btn dark" id="new-round">Start New Round</button><button class="linkish" id="replay" type="button">🎡 Replay the spin</button></div>';
  }
  $('round-card').innerHTML = html;

  const label = { ready: '✓ Ready', duplicate: '! Duplicate', missing: 'Not yet' };
  const ids = allSubs(st).map((x) => x.id);
  const everyShown = ids.length > 0 && ids.every((id) => revealed.has(id));
  $('members-card').innerHTML = '<div class="members-head"><h2>' + (open ? 'Family submissions' : 'This round\\'s picks') + '</h2>'
    + (ids.length ? '<button class="linkish" id="peek-all" type="button">' + (everyShown ? 'Hide all titles' : 'Show all titles') + '</button>' : '') + '</div>'
    + st.members.map((m) =>
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

// The server picks and saves the winner first; the wheel then spins to it.
async function drawWithWheel() {
  if (!confirm('Spin the wheel and draw the winning movie? This can only happen once per round.')) return;
  $('msg').textContent = '';
  $('draw').disabled = true;
  try { spinAdmin(await call('/api/admin/draw', {})); }
  catch (e) { $('msg').textContent = e.message; $('draw').disabled = false; }
}

function spinAdmin(st) {
  if (spinning) return;
  spinning = true;
  state = st;
  const r = st.round, w = r.entries[r.winnerIndex];
  $('round-card').innerHTML = '<h2>🎡 Spinning the wheel…</h2><div id="admin-wheel"></div><p class="wheel-caption" id="admin-caption" aria-live="polite" style="text-align:center"></p>';
  spinWheel($('admin-wheel'), r.entries.map((e) => e.member), r.winnerIndex,
    () => { $('admin-caption').textContent = '🎉 ' + w.member + '\\'s pick: ' + w.title; },
    () => { spinning = false; render(st); });
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
  if (b.id === 'draw') return drawWithWheel();
  if (b.id === 'replay') return spinAdmin(state);
  if (b.id === 'peek-all') {
    const ids = allSubs(state).map((x) => x.id);
    const everyShown = ids.every((id) => revealed.has(id));
    ids.forEach((id) => (everyShown ? revealed.delete(id) : revealed.add(id)));
    return render(state);
  }
  if (b.id === 'new-round') return act('new-round', {}, 'Start a new movie night? Progress resets to 0 of ' + state.total + '. Past winners are kept.');
  if (b.id === 'logout') return call('/api/admin/logout', {}).finally(showLogin);
  const id = Number(b.dataset.id);
  if (b.dataset.act === 'peek') {
    revealed.has(id) ? revealed.delete(id) : revealed.add(id);
    render(state);
    return document.querySelector('[data-act="peek"][data-id="' + id + '"]')?.focus();
  }
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
