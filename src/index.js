// Cloudflare Worker entry point: serves the pages and the JSON API.
// There are no scheduled jobs; nothing happens unless someone clicks.

import { cookieValue, SESSION_COOKIE } from './auth.js';
import { adminPage, mainPage } from './ui.js';

export { LotteryDO } from './lottery-do.js';

const lottery = (env) => env.LOTTERY.get(env.LOTTERY.idFromName('family-movie-night'));

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000',
};

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...headers },
  });
}

function html(body) {
  return new Response(body, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', ...SECURITY_HEADERS },
  });
}

const reply = ({ status, body }, headers) => json(body, status, headers);

// Anonymous per-visitor key for rate limiting; the raw IP is never stored.
async function clientKey(request) {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`fmnl:${ip}`));
  return [...new Uint8Array(digest).slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// State-changing requests must be same-origin JSON. Browsers can't send a
// cross-site JSON POST without a CORS preflight, which this Worker never
// grants; together with the SameSite=Strict cookie this blocks CSRF.
function sameOriginJson(request) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return false;
  return (request.headers.get('Content-Type') ?? '').startsWith('application/json');
}

async function readJson(request) {
  const text = await request.text();
  if (text.length > 4096) return null;
  try {
    return JSON.parse(text || '{}');
  } catch {
    return null;
  }
}

function sessionCookie(token, maxAge) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

const ADMIN_ACTIONS = new Set(['add', 'edit', 'remove', 'restore', 'draw', 'new-round']);

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const method = request.method;

    try {
      if (method === 'GET' && pathname === '/') return html(mainPage());
      if (method === 'GET' && pathname === '/admin') return html(adminPage());
      if (method === 'GET' && pathname === '/api/status') return reply(await lottery(env).publicStatus());

      if (method === 'POST' && pathname.startsWith('/api/')) {
        if (!sameOriginJson(request)) return json({ error: 'Bad request.' }, 400);
        const body = await readJson(request);
        if (!body) return json({ error: 'Bad request.' }, 400);

        if (pathname === '/api/submit') {
          // Honeypot: a hidden field real people never fill in.
          if (body.website) return json({ ok: true });
          return reply(await lottery(env).submit(body, await clientKey(request)));
        }
        if (pathname === '/api/admin/login') {
          const result = await lottery(env).login(body.password, await clientKey(request));
          if (result.status !== 200) return reply(result);
          return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(result.body.token, result.body.maxAge) });
        }
        if (pathname === '/api/admin/logout') {
          return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
        }
        const action = pathname.slice('/api/admin/'.length);
        if (pathname.startsWith('/api/admin/') && ADMIN_ACTIONS.has(action)) {
          const token = cookieValue(request.headers.get('Cookie'));
          return reply(await lottery(env).admin(token, action, body));
        }
      }

      if (method === 'GET' && (pathname === '/api/admin/state' || pathname === '/api/admin/export')) {
        const token = cookieValue(request.headers.get('Cookie'));
        const result = await lottery(env).admin(token, pathname.slice('/api/admin/'.length));
        const headers =
          pathname.endsWith('/export') && result.status === 200
            ? { 'Content-Disposition': `attachment; filename="movie-night-backup-${new Date().toISOString().slice(0, 10)}.json"` }
            : {};
        return reply(result, headers);
      }

      return json({ error: 'Not found' }, 404);
    } catch (e) {
      console.error(e);
      return json({ error: 'Something went wrong. Please try again.' }, 500);
    }
  },
};
