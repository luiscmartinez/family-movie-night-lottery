// Cloudflare Worker entry point: serves the pages, the JSON API and the cron check.

import { ConfigError, loadConfig } from './config.js';
import { isAdmin } from './auth.js';
import { adminPage, mainPage } from './ui.js';

export { LotteryDO } from './lottery-do.js';

const lottery = (env) => env.LOTTERY.get(env.LOTTERY.idFromName('family-movie-night'));

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS },
  });
}

function html(body) {
  return new Response(body, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', ...SECURITY_HEADERS },
  });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const method = request.method;

    try {
      if (method === 'GET' && pathname === '/') return html(mainPage());
      if (method === 'GET' && pathname === '/admin') return html(adminPage());

      if (pathname.startsWith('/api/')) {
        loadConfig(env); // fail fast with a readable message if misconfigured

        if (method === 'GET' && pathname === '/api/status') return json(await lottery(env).publicStatus());

        if (pathname.startsWith('/api/admin/')) {
          if (!(await isAdmin(request, env))) return json({ error: 'Unauthorized' }, 401);
          if (method === 'GET' && pathname === '/api/admin/status') return json(await lottery(env).adminStatus());
          if (method === 'POST' && pathname === '/api/admin/check') {
            await lottery(env).check();
            return json(await lottery(env).adminStatus());
          }
          if (method === 'POST' && pathname === '/api/admin/new-round') {
            const result = await lottery(env).startNewRound();
            return json(result, result.ok ? 200 : 409);
          }
        }
      }
      return json({ error: 'Not found' }, 404);
    } catch (e) {
      if (e instanceof ConfigError) return json({ error: `Setup needed: ${e.message}` }, 503);
      console.error(e);
      return json({ error: 'Something went wrong. Please try again in a minute.' }, 500);
    }
  },

  // Cron trigger (every minute): the automatic check that draws the winner.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      lottery(env)
        .check()
        .then((r) => r.drew && console.log(`Winner drawn for ${r.round}`)),
    );
  },
};
