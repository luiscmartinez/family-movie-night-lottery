// The required scenarios, for the admin-controlled draw.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LotteryError } from '../src/lottery.js';
import { secureRandomInt } from '../src/random.js';
import { LotteryStore } from '../src/store.js';
import { Clock, MEMBERS, MOVIES, makeLottery, nodeDb, submitAll, tempDbPath } from './helpers.js';

const refused = (fn, pattern) => assert.throws(fn, (e) => e instanceof LotteryError && pattern.test(e.message));

test('1: eight unique submissions: the draw button stays disabled and the draw is refused', () => {
  const { lottery, store } = makeLottery();
  submitAll(lottery, 8);
  const admin = lottery.adminState();
  assert.equal(admin.canDraw, false);
  assert.equal(admin.readyCount, 8);
  refused(() => lottery.draw(), /waiting for Elena/);
  assert.equal(store.currentRound().status, 'Open');
  const s = lottery.publicStatus();
  assert.equal(s.state, 'open');
  assert.equal(s.submittedCount, 8);
  assert.deepEqual(s.waitingFor, ['Elena']);
});

test('2: the ninth unique submission enables the draw; one click picks and saves a winner', () => {
  const { lottery, store, clock } = makeLottery();
  submitAll(lottery, 9);
  assert.equal(lottery.adminState().canDraw, true);

  // Nothing is drawn automatically.
  const ready = lottery.publicStatus();
  assert.equal(ready.state, 'ready');
  assert.equal(ready.winner, undefined);
  assert.equal(store.currentRound().status, 'Open');

  clock.advance(5_000);
  const round = lottery.draw();
  assert.equal(round.status, 'Completed');
  assert.equal(round.entries.length, 9);
  assert.ok(MOVIES.includes(round.winnerTitle));
  assert.equal(MEMBERS[MOVIES.indexOf(round.winnerTitle)], round.winnerMember);
  assert.equal(round.drawnAt, clock.now());

  const done = lottery.publicStatus();
  assert.equal(done.state, 'completed');
  assert.deepEqual(done.winner, { title: round.winnerTitle, member: round.winnerMember, drawnAt: round.drawnAt });
  assert.equal(done.entries.length, 9);

  // No second draw.
  refused(() => lottery.draw(), /already been drawn/);
  assert.equal(lottery.adminState().canDraw, false);
});

test('3: a duplicate submission keeps the draw disabled until the admin removes the extra', () => {
  const { lottery, store } = makeLottery();
  submitAll(lottery, 7);
  const extra = lottery.submit({ name: 'Maria', title: 'Frozen' });
  lottery.submit({ name: 'Diego', title: 'Paddington 2' });
  // 9 submissions, 8 distinct names, Elena missing.
  let admin = lottery.adminState();
  assert.equal(admin.canDraw, false);
  assert.equal(admin.members.find((m) => m.name === 'Maria').status, 'duplicate');
  assert.equal(admin.members.find((m) => m.name === 'Maria').submissions.length, 2);
  assert.deepEqual(lottery.publicStatus().needsAttention, ['Maria']);

  // Even with Elena in, Maria's duplicate blocks the draw.
  lottery.submit({ name: 'Elena', title: 'The Goonies' });
  assert.equal(lottery.adminState().canDraw, false);
  refused(() => lottery.draw(), /duplicates for Maria/);

  lottery.removeSubmission(extra.id);
  admin = lottery.adminState();
  assert.equal(admin.canDraw, true);
  assert.equal(admin.removed.length, 1);
  const round = lottery.draw();
  assert.ok(!round.entries.some((e) => e.title === 'Frozen'));
  assert.equal(round.entries.find((e) => e.member === 'Maria').title, 'The Princess Bride');
  assert.equal(store.getRound(round.id).winnerTitle, round.winnerTitle);
});

test('4: two simultaneous draws record exactly one winner', () => {
  const path = tempDbPath();
  const clock = new Clock();
  const a = makeLottery({ clock, db: nodeDb(path), randomInt: () => 0 });
  const b = makeLottery({ clock, db: nodeDb(path), randomInt: () => 8 });
  submitAll(a.lottery, 9);
  assert.equal(b.lottery.adminState().canDraw, true, 'both connections see the same data');

  const results = [a, b].map(({ lottery }) => {
    try {
      return lottery.draw();
    } catch (e) {
      return e;
    }
  });
  assert.equal(results.filter((r) => r instanceof LotteryError).length, 1);
  const winner = results.find((r) => !(r instanceof Error));
  assert.equal(b.store.currentRound().winnerTitle, winner.winnerTitle);
  assert.equal(a.store.currentRound().winnerTitle, winner.winnerTitle);
});

test('4b: the compare-and-set refuses a second draw even if the open check is bypassed', () => {
  const store = new LotteryStore(nodeDb());
  const round = store.startRound(Date.now());
  const entries = MEMBERS.map((m, i) => ({ member: m, title: MOVIES[i], submissionId: i + 1 }));
  assert.ok(store.recordDraw(round.id, { entries, winnerIndex: 2, drawnAt: 1 }));
  assert.equal(store.recordDraw(round.id, { entries, winnerIndex: 5, drawnAt: 2 }), null);
  assert.equal(store.getRound(round.id).winnerTitle, MOVIES[2]);
  assert.ok(store.startRound(3), 'a new round can start after the draw');
  assert.equal(store.startRound(4), null, 'but not while one is open');
});

test('5: the winner survives a restart and can no longer be changed', () => {
  const path = tempDbPath();
  const clock = new Clock();
  const first = makeLottery({ clock, db: nodeDb(path) });
  const subs = submitAll(first.lottery, 9);
  const before = first.lottery.draw();
  first.db.close(); // "restart"

  const second = makeLottery({ clock, db: nodeDb(path) });
  const after = second.store.currentRound();
  assert.equal(after.id, before.id);
  assert.equal(after.winnerTitle, before.winnerTitle);
  assert.deepEqual(after.entries, before.entries);
  refused(() => second.lottery.draw(), /already been drawn/);
  refused(() => second.lottery.submit({ name: 'Maria', title: 'Sneaky' }), /already been drawn/);
  refused(() => second.lottery.editSubmission(subs[0].id, { title: 'Changed' }), /can no longer be changed/);
  refused(() => second.lottery.removeSubmission(subs[0].id), /can no longer be changed/);
  assert.equal(second.lottery.publicStatus().winner.title, before.winnerTitle);
});

test('6: a new round resets progress and excludes old submissions', () => {
  const { lottery, store, clock } = makeLottery();
  refused(() => lottery.startNewRound(), /hasn't been drawn/);
  submitAll(lottery, 9);
  const old = lottery.draw();

  clock.advance(7 * 24 * 3600_000);
  const round = lottery.startNewRound();
  assert.equal(round.number, 2);
  let s = lottery.publicStatus();
  assert.equal(s.state, 'open');
  assert.equal(s.submittedCount, 0);
  assert.equal(s.round.label, 'Movie Night #2');
  assert.equal(s.history[0].title, old.winnerTitle);
  assert.ok(lottery.adminState().members.every((m) => m.status === 'missing' && m.submissions.length === 0));

  submitAll(lottery, 3);
  assert.equal(lottery.publicStatus().submittedCount, 3);
  assert.equal(store.getRound(old.id).winnerTitle, old.winnerTitle, 'previous winner unchanged');
  refused(() => lottery.startNewRound(), /hasn't been drawn/);
});

test('7: invalid input is rejected and never counts', () => {
  const { lottery } = makeLottery();
  refused(() => lottery.submit({ name: 'Stranger', title: 'Cars' }), /choose your name/);
  refused(() => lottery.submit({ name: '', title: 'Cars' }), /choose your name/);
  refused(() => lottery.submit({ name: 'Maria', title: '   ' }), /enter a movie title/);
  refused(() => lottery.submit({ name: 'Maria', title: 'x'.repeat(121) }), /at most 120/);
  const s = lottery.submit({ name: '  maria ', title: '  The   Princess Bride ' });
  assert.equal(s.member, 'Maria', 'names are matched case-insensitively');
  assert.equal(s.title, 'The Princess Bride', 'whitespace is tidied');
  assert.equal(lottery.publicStatus().submittedCount, 1);
});

test('8: fairness: every movie has an equal 1-in-9 chance', async (t) => {
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

  await t.test('end-to-end rounds spread wins across all nine submissions', () => {
    const wins = new Map(MOVIES.map((m) => [m, 0]));
    const rounds = 1800;
    for (let i = 0; i < rounds; i++) {
      const { lottery } = makeLottery();
      submitAll(lottery, 9);
      const r = lottery.draw();
      wins.set(r.winnerTitle, wins.get(r.winnerTitle) + 1);
    }
    const expected = rounds / 9;
    const chi2 = [...wins.values()].reduce((s, c) => s + (c - expected) ** 2 / expected, 0);
    assert.ok(chi2 < 26.12, `chi-square ${chi2.toFixed(2)} ${JSON.stringify(Object.fromEntries(wins))}`);
  });
});
