import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAdmin } from '../src/auth.js';
import { ConfigError, loadConfig, parseMembers, parseNotionId } from '../src/config.js';
import { evaluateRound } from '../src/lottery.js';
import { NotionClient } from '../src/notion.js';
import { FakeNotion, SUBMISSIONS_DB } from './fake-notion.js';
import { MEMBERS, MOVIES, makeLottery } from './helpers.js';

const round = { id: 'R2-2026-10-26', startedAt: Date.parse('2026-10-26T18:00:30Z') };
const row = (id, name, title, extra = {}) => ({ id, name, title, createdTime: '2026-10-26T19:00:00.000Z', round: '', status: '', ...extra });

test('evaluateRound: one row per member counts', () => {
  const rows = MEMBERS.map((m, i) => row(`p${i}`, m, MOVIES[i]));
  const ev = evaluateRound(round, rows, MEMBERS);
  assert.equal(ev.ready, true);
  assert.equal(ev.entries.length, 9);
  assert.ok(ev.updates.every((u) => u.status === 'Counted' && u.round === round.id));
});

test('evaluateRound: names match case-insensitively; unknown names and blank titles need review', () => {
  const ev = evaluateRound(round, [row('a', 'maria ', 'Up'), row('b', 'Stranger', 'Cars'), row('c', 'John', '')], MEMBERS);
  assert.deepEqual(ev.submitted, ['Maria']);
  assert.equal(ev.updates.find((u) => u.id === 'b').status, 'Needs review');
  assert.equal(ev.updates.find((u) => u.id === 'c').status, 'Needs review');
});

test('evaluateRound: rows before the round start (same minute counts) are late', () => {
  const ev = evaluateRound(
    round,
    [row('old', 'Maria', 'Up', { createdTime: '2026-10-26T17:59:00.000Z' }), row('same', 'John', 'Coco', { createdTime: '2026-10-26T18:00:00.000Z' })],
    MEMBERS,
  );
  assert.deepEqual(ev.submitted, ['John']);
  assert.deepEqual(ev.updates.find((u) => u.id === 'old'), { id: 'old', round: 'late', status: 'Late' });
});

test('evaluateRound: rejected rows never count and rows of other rounds are ignored', () => {
  const ev = evaluateRound(
    round,
    [row('a', 'Maria', 'Up', { status: 'Rejected' }), row('b', 'Maria', 'Coco'), row('c', 'John', 'Up', { round: 'R1-2026-10-01', status: 'Counted' })],
    MEMBERS,
  );
  assert.deepEqual(ev.submitted, ['Maria']);
  assert.equal(ev.entries[0].title, 'Coco');
  assert.ok(!ev.updates.some((u) => u.id === 'c'));
});

test('evaluateRound: only changed rows are written back', () => {
  const ev = evaluateRound(round, [row('a', 'Maria', 'Up', { round: round.id, status: 'Counted' })], MEMBERS);
  assert.deepEqual(ev.updates, []);
});

test('config: exactly nine unique members are required', () => {
  assert.equal(parseMembers(MEMBERS.join(', ')).length, 9);
  assert.throws(() => parseMembers('A,B,C'), ConfigError);
  assert.throws(() => parseMembers([...MEMBERS.slice(0, 8), 'maria'].join(',')), /twice/);
  assert.throws(() => loadConfig({ FAMILY_MEMBERS: MEMBERS.join(',') }), /NOTION_TOKEN/);
});

test('config: Notion IDs are accepted as IDs or URLs', () => {
  const id = '1429989fe8ac4effbc8f57f56486db54';
  const want = '1429989f-e8ac-4eff-bc8f-57f56486db54';
  assert.equal(parseNotionId(id), want);
  assert.equal(parseNotionId(want), want);
  assert.equal(parseNotionId(`https://www.notion.so/family/Movie-Submissions-${id}?v=abc`), want);
  assert.throws(() => parseNotionId('nope'), ConfigError);
});

test('notion client: honours Retry-After on 429 and does not retry 4xx', async () => {
  const sleeps = [];
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    if (calls === 1) return new Response('{}', { status: 429, headers: { 'Retry-After': '2' } });
    if (calls === 2) return new Response('{"message":"bad"}', { status: 400 });
    return new Response('{}');
  };
  const client = new NotionClient({ token: 't', fetchImpl, sleep: async (ms) => sleeps.push(ms) });
  await assert.rejects(client.request('GET', '/x'), (e) => e.status === 400);
  assert.deepEqual(sleeps, [2000]);
  assert.equal(calls, 2);
});

test('notion client: resolves a database ID to its data source', async () => {
  const api = new FakeNotion();
  const client = new NotionClient({ token: 't', fetchImpl: api.fetch });
  api.submit('Maria', 'Up');
  const rows = await client.querySubmissions(SUBMISSIONS_DB, 'R1');
  assert.equal(rows[0].title, 'Up');
  assert.ok(api.requests.some((r) => r.path.startsWith('/data_sources/22222222')));
});

test('public status never reveals movie titles before the winner is shown', async () => {
  const { lottery, api } = makeLottery();
  api.submit('Maria', 'Secret Movie');
  await lottery.check();
  assert.ok(!JSON.stringify(lottery.publicStatus()).includes('Secret Movie'));
});

test('admin auth: requires a strong token and an exact match', async () => {
  const req = (h) => new Request('https://x/api/admin/status', { headers: h ? { Authorization: h } : {} });
  const env = { ADMIN_TOKEN: 'correct-horse-battery-staple' };
  assert.equal(await isAdmin(req('Bearer correct-horse-battery-staple'), env), true);
  assert.equal(await isAdmin(req('Bearer correct-horse-battery-stapl'), env), false);
  assert.equal(await isAdmin(req(), env), false);
  assert.equal(await isAdmin(req('Bearer short'), { ADMIN_TOKEN: 'short' }), false, 'weak tokens disable admin');
});

test('notion writes per check are capped for the free plan subrequest limit', async () => {
  const { lottery, api, clock } = makeLottery();
  lottery.ensureRound();
  for (let i = 0; i < 60; i++) api.submit('Stranger', `Movie ${i}`);
  const patches = () => api.requests.filter((r) => r.method === 'PATCH').length;
  await lottery.check();
  assert.equal(patches(), 25);
  clock.advance(60_000);
  await lottery.check();
  await lottery.check();
  assert.equal(patches(), 60, 'the backlog is finished over later checks');
});
