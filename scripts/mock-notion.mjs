// Local stand-in for the Notion API so you can try the whole app without a
// Notion account:  node scripts/mock-notion.mjs   then   npm run dev:mock
//
// Simulate form submissions:
//   curl -X POST "http://127.0.0.1:8788/__submit?name=Maria&title=The%20Princess%20Bride"
//   curl -X POST "http://127.0.0.1:8788/__fill?count=8"     (first N family members)
//   curl "http://127.0.0.1:8788/__rows"                      (see the database)

import { createServer } from 'node:http';
import { FakeNotion, SUBMISSIONS_DS } from '../test/fake-notion.js';
import { MEMBERS, MOVIES } from '../test/helpers.js';

const port = Number(process.env.PORT ?? 8788);
const api = new FakeNotion();

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const send = (status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data, null, 2));
  };
  if (url.pathname === '/__submit') {
    return send(200, { id: api.submit(url.searchParams.get('name'), url.searchParams.get('title')) });
  }
  if (url.pathname === '/__fill') {
    const n = Number(url.searchParams.get('count') ?? 9);
    return send(200, { ids: MEMBERS.slice(0, n).map((m, i) => api.submit(m, MOVIES[i])) });
  }
  if (url.pathname === '/__rows') {
    const rows = [...api.pages.values()].filter((p) => p.parentDs === SUBMISSIONS_DS);
    return send(200, { submissions: rows.map((p) => ({ id: p.id, ...api.submission(p.id) })), rounds: api.roundRows() });
  }
  let body = '';
  for await (const chunk of req) body += chunk;
  const response = await api.fetch(`http://notion${url.pathname}`, {
    method: req.method,
    headers: { Authorization: req.headers.authorization, 'Notion-Version': req.headers['notion-version'] },
    body: body || undefined,
  });
  res.writeHead(response.status, { 'Content-Type': 'application/json' });
  res.end(await response.text());
}).listen(port, () => console.log(`Mock Notion API on http://127.0.0.1:${port}/v1`));
