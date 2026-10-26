// The eight required scenarios from the project brief.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { secureRandomInt } from '../src/random.js';
import { LotteryStore } from '../src/store.js';
import { FakeNotion } from './fake-notion.js';
import { Clock, MEMBERS, MOVIES, makeLottery, nodeDb, submitAll, tempDbPath } from './helpers.js';

const REVEAL = 20_000;

test('1: eight unique submissions do not select a winner', async () => {
  const { lottery, api, store } = makeLottery();
  submitAll(api, 8);
  const r = await lottery.check();
  assert.equal(r.drew, false);
  assert.equal(store.currentRound().status, 'Open');
  const s = lottery.publicStatus();
  assert.equal(s.state, 'open');
  assert.equal(s.submittedCount, 8);
  assert.deepEqual(s.waitingFor, ['Elena']);
  assert.equal(s.winner, undefined);
});

test('2: the ninth unique submission triggers the draw automatically', async () => {
  const { lottery, api, store, clock } = makeLottery();
  submitAll(api, 8);
  await lottery.check();
  api.submit('Elena', 'The Goonies');
  const r = await lottery.check();
  assert.equal(r.drew, true);

  const round = store.currentRound();
  assert.equal(round.status, 'Drawing');
  assert.equal(round.entries.length, 9);
  assert.ok(MOVIES.includes(round.winnerTitle));
  assert.equal(MEMBERS[MOVIES.indexOf(round.winnerTitle)], round.winnerMember);

  // While drawing, nothing about the winner is exposed or written to Notion.
  const drawing = lottery.publicStatus();
  assert.equal(drawing.state, 'drawing');
  assert.equal(drawing.winner, undefined);
  assert.equal(drawing.entries, undefined);
  assert.equal(api.roundRows().length, 0);

  clock.advance(REVEAL);
  await lottery.check();
  const done = lottery.publicStatus();
  assert.equal(done.state, 'completed');
  assert.deepEqual(done.winner, { title: round.winnerTitle, member: round.winnerMember, drawnAt: round.drawnAt });
  assert.equal(done.entries.length, 9);

  // Result mirrored to Notion: winner flagged and a Lottery Rounds row created.
  assert.equal(api.submission(round.winnerPageId).status, 'Winner');
  assert.deepEqual(api.roundRows(), [{ round: 'Movie Night #1', movie: round.winnerTitle, member: round.winnerMember }]);
  assert.equal(store.currentRound().notionSynced, true);
});

test('3: a duplicate submission does not start the lottery', async () => {
  const { lottery, api, store, clock } = makeLottery();
  submitAll(api, 7); // everyone but Diego and Elena
  const first = api.submit('Maria', 'Frozen'); // Maria again
  api.submit('Diego', 'Paddington 2');
  // 9 rows, 8 distinct names, Elena missing.
  const r = await lottery.check();
  assert.equal(r.drew, false);
  let s = lottery.publicStatus();
  assert.equal(s.submittedCount, 7, 'Maria is not counted while she has two entries');
  assert.deepEqual(s.needsAttention, ['Maria']);
  assert.deepEqual(s.waitingFor, ['Elena']);
  assert.equal(api.submission(first).status, 'Duplicate');

  // Even once Elena submits, Maria's conflict blocks the draw.
  api.submit('Elena', 'The Goonies');
  clock.advance(60_000);
  assert.equal((await lottery.check()).drew, false);
  assert.equal(store.currentRound().status, 'Open');
  assert.equal(lottery.publicStatus().submittedCount, 8);

  // Admin rejects the extra entry -> Maria counts -> draw on the next check.
  api.setStatus(first, 'Rejected');
  assert.equal((await lottery.check()).drew, true);
  const round = store.currentRound();
  assert.ok(!round.entries.some((e) => e.title === 'Frozen'));
  assert.equal(round.entries.find((e) => e.member === 'Maria').title, 'The Princess Bride');
  assert.equal(api.submission(first).status, 'Rejected');
});

test('4: concurrent processing selects and records exactly one winner', async () => {
  const path = tempDbPath();
  const clock = new Clock();
  const api = new FakeNotion({ now: clock.now });
  const ids = submitAll(api, 9);
  // Two independent "executions": separate DB connections, Notion clients,
  // and random sources that would pick different winners.
  const a = makeLottery({ api, clock, db: nodeDb(path), randomInt: () => 0 });
  const b = makeLottery({ api, clock, db: nodeDb(path), randomInt: () => 8 });
  a.lottery.ensureRound();

  const [ra1, rb1, ra2, rb2] = await Promise.all([a.lottery.check(), b.lottery.check(), a.lottery.check(), b.lottery.check()]);
  assert.equal(ra1, ra2, 'overlapping checks in one process share a single run');
  assert.equal(rb1, rb2);
  assert.equal([ra1, rb1].filter((r) => r.drew).length, 1, 'exactly one execution drew');

  const ra = a.store.currentRound();
  const rb = b.store.currentRound();
  assert.equal(ra.winnerTitle, rb.winnerTitle);
  assert.equal(a.db.all('SELECT COUNT(*) AS n FROM rounds')[0].n, 1);

  clock.advance(REVEAL);
  await Promise.all([a.lottery.check(), b.lottery.check()]);
  assert.equal(api.roundRows().length, 1, 'result written to Notion once');
  assert.equal(ids.filter((id) => api.submission(id).status === 'Winner').length, 1);
});

test('4b: the compare-and-set refuses a second draw for the same round', () => {
  const store = new LotteryStore(nodeDb());
  const round = store.startRound(0, Date.now());
  const entries = MEMBERS.map((m, i) => ({ member: m, title: MOVIES[i], pageId: `p${i}` }));
  assert.ok(store.recordDraw(round.id, { entries, winnerIndex: 2, drawnAt: 1, revealAt: 1 }));
  assert.equal(store.recordDraw(round.id, { entries, winnerIndex: 5, drawnAt: 2, revealAt: 2 }), null);
  assert.equal(store.getRound(round.id).winnerTitle, MOVIES[2]);
  assert.equal(store.startRound(3), null, 'cannot start a round while one is unfinished');
});

test('5: the winner survives a restart, even if Notion data changes afterwards', async () => {
  const path = tempDbPath();
  const clock = new Clock();
  const api = new FakeNotion({ now: clock.now });
  const ids = submitAll(api, 9);
  const first = makeLottery({ api, clock, db: nodeDb(path) });
  await first.lottery.check();
  const before = first.store.currentRound();
  first.db.close(); // "restart"

  // After restart: someone edits titles and submits again.
  for (const id of ids) api.setTitle(id, 'Changed After Draw');
  api.submit('Maria', 'Sneaky Second Pick');
  clock.advance(REVEAL);

  const second = makeLottery({ api, clock, db: nodeDb(path) });
  await second.lottery.check();
  await second.lottery.check();
  const after = second.store.currentRound();
  assert.equal(after.id, before.id);
  assert.equal(after.status, 'Completed');
  assert.equal(after.winnerTitle, before.winnerTitle);
  assert.equal(after.winnerMember, before.winnerMember);
  assert.deepEqual(after.entries, before.entries);
  assert.equal(second.lottery.publicStatus().winner.title, before.winnerTitle);
});

test('6: a new round resets progress and excludes old submissions', async () => {
  const { lottery, api, store, clock } = makeLottery();
  const oldIds = submitAll(api, 9);
  await lottery.check();
  clock.advance(REVEAL);
  await lottery.check();
  const old = store.currentRound();
  assert.equal(old.status, 'Completed');

  // A late submission arrives after the draw but before the new round.
  clock.advance(5 * 60_000);
  const late = api.submit('John', 'Too Late Movie');
  clock.advance(5 * 60_000);

  const started = lottery.startNewRound();
  assert.equal(started.ok, true);
  assert.equal(started.round.number, 2);
  let s = lottery.publicStatus();
  assert.equal(s.state, 'open');
  assert.equal(s.submittedCount, 0);
  assert.equal(s.round.label, 'Movie Night #2');
  assert.equal(s.history[0].title, old.winnerTitle);

  await lottery.check();
  s = lottery.publicStatus();
  assert.equal(s.submittedCount, 0, 'old and late submissions are excluded');
  assert.equal(api.submission(late).status, 'Late');
  for (const id of oldIds) assert.equal(api.submission(id).round, old.id);

  clock.advance(60_000);
  submitAll(api, 3);
  await lottery.check();
  assert.equal(lottery.publicStatus().submittedCount, 3);
  assert.equal(store.getRound(old.id).winnerTitle, old.winnerTitle, 'previous winner unchanged');

  // Starting yet another round while this one is open is refused.
  assert.equal(lottery.startNewRound().ok, false);
});

test('7: temporary Notion failures are retried safely', async (t) => {
  await t.test('transient errors within the retry budget: the draw still happens', async () => {
    const { lottery, api } = makeLottery();
    submitAll(api, 9);
    api.failNext(2, 503);
    api.failNext(1, 'network');
    assert.equal((await lottery.check()).drew, true);
  });

  await t.test('a sustained outage: no draw, error recorded, recovers later', async () => {
    const { lottery, api, store } = makeLottery({ retries: 2 });
    submitAll(api, 9);
    api.failNext(3, 503); // 1 try + 2 retries
    const r = await lottery.check();
    assert.equal(r.drew, false);
    assert.match(r.error, /503/);
    assert.equal(store.currentRound().status, 'Open');
    assert.equal(store.currentRound().winnerTitle, null);
    assert.equal(lottery.publicStatus().notionError, true);

    assert.equal((await lottery.check()).drew, true);
    assert.equal(lottery.publicStatus().state, 'drawing');
  });

  await t.test('failure on a later results page never draws from partial data', async () => {
    const clock = new Clock();
    const api = new FakeNotion({ now: clock.now, pageSize: 4 });
    const { lottery, store } = makeLottery({ api, clock, retries: 1 });
    submitAll(api, 9);
    // Page 1 of the query succeeds; page 2 fails (twice, exhausting the retry).
    const queries = () => api.requests.filter((r) => r.path.endsWith('/query')).length;
    api.failNext(2, 500, (method, path) => path.endsWith('/query') && queries() >= 2);
    assert.equal((await lottery.check()).drew, false);
    assert.equal(store.currentRound().status, 'Open');
    assert.equal((await lottery.check()).drew, true);
    assert.equal(store.currentRound().entries.length, 9);
  });

  await t.test('failures while writing results are retried without changing the winner', async () => {
    const { lottery, api, store, clock } = makeLottery();
    submitAll(api, 9);
    await lottery.check();
    const winner = store.currentRound().winnerTitle;
    clock.advance(REVEAL);
    api.failNext(4, 503, (method) => method !== 'GET'); // one write exhausts its retries
    await lottery.check();
    assert.equal(store.currentRound().notionSynced, false);
    await lottery.check();
    assert.equal(store.currentRound().notionSynced, true);
    assert.equal(store.currentRound().winnerTitle, winner);
    assert.equal(api.roundRows().length, 1);
  });
});

test('8: fairness — every movie has an equal 1-in-9 chance', async (t) => {
  await t.test('rejection sampling gives each outcome exactly the same number of inputs', () => {
    const n = 9;
    const limit = 2 ** 32 - (2 ** 32 % n);
    assert.equal(limit % n, 0);
    // Values at or above the limit are rejected and redrawn.
    const values = [limit, 2 ** 32 - 1, limit - 1];
    const got = secureRandomInt(n, (buf) => { buf[0] = values.shift(); });
    assert.equal(got, (limit - 1) % n);
    assert.equal(values.length, 0, 'the two biased values were rejected');
  });

  await t.test('simulated draws pass a chi-square test (180,000 draws)', () => {
    const counts = Array(9).fill(0);
    const N = 180_000;
    for (let i = 0; i < N; i++) counts[secureRandomInt(9)]++;
    const expected = N / 9;
    const chi2 = counts.reduce((s, c) => s + (c - expected) ** 2 / expected, 0);
    // df = 8; p = 0.001 critical value is 26.12.
    assert.ok(chi2 < 26.12, `chi-square ${chi2.toFixed(2)} counts ${counts}`);
    for (const c of counts) assert.ok(Math.abs(c / N - 1 / 9) < 0.005, `share ${(c / N).toFixed(4)}`);
  });

  await t.test('end-to-end rounds spread wins across all nine submissions', async () => {
    const wins = new Map(MOVIES.map((m) => [m, 0]));
    const rounds = 1800;
    for (let i = 0; i < rounds; i++) {
      const { lottery, api, store } = makeLottery();
      submitAll(api, 9);
      await lottery.check();
      wins.set(store.currentRound().winnerTitle, wins.get(store.currentRound().winnerTitle) + 1);
    }
    const expected = rounds / 9;
    const chi2 = [...wins.values()].reduce((s, c) => s + (c - expected) ** 2 / expected, 0);
    assert.ok(chi2 < 26.12, `chi-square ${chi2.toFixed(2)} ${JSON.stringify(Object.fromEntries(wins))}`);
  });
});
