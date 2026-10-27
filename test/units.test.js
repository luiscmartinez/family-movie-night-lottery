import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AdminAuth, cookieValue, LOCKOUT_MS, passwordMatches, SESSION_TTL_MS } from '../src/auth.js';
import { adminPassword, ConfigError, loadConfig, parseMembers } from '../src/config.js';
import { evaluateRound, Lottery } from '../src/lottery.js';
import { LotteryStore } from '../src/store.js';
import { Clock, MEMBERS, MOVIES, makeLottery, nodeDb, submitAll } from './helpers.js';

const sub = (id, member, title, extra = {}) => ({ id, member, title, removedAt: null, ...extra });

test('evaluateRound: one active submission per member counts; removed ones are ignored', () => {
  const subs = MEMBERS.map((m, i) => sub(i + 1, m, MOVIES[i]));
  subs.push(sub(99, 'Maria', 'Frozen', { removedAt: 5 }));
  const ev = evaluateRound(subs, MEMBERS);
  assert.equal(ev.ready, true);
  assert.equal(ev.entries.find((e) => e.member === 'Maria').title, 'The Princess Bride');
});

test('evaluateRound: duplicates and unknown names never count', () => {
  const ev = evaluateRound([sub(1, 'Maria', 'Up'), sub(2, 'Maria', 'Coco'), sub(3, 'Stranger', 'Cars'), sub(4, 'John', 'Up')], MEMBERS);
  assert.deepEqual(ev.submitted, ['John']);
  assert.deepEqual(ev.duplicates, ['Maria']);
  assert.equal(ev.missing.length, 7);
});

test('admin can edit, remove, restore and add on behalf of someone', () => {
  const { lottery } = makeLottery();
  const [maria] = submitAll(lottery, 1);
  lottery.editSubmission(maria.id, { title: 'The Princess Bride (1987)' });
  assert.equal(lottery.adminState().members[0].submissions[0].title, 'The Princess Bride (1987)');
  lottery.editSubmission(maria.id, { name: 'John' });
  assert.equal(lottery.adminState().members[1].submissions.length, 1, 'moved to John');

  lottery.removeSubmission(maria.id);
  assert.equal(lottery.adminState().readyCount, 0);
  lottery.restoreSubmission(maria.id);
  assert.equal(lottery.adminState().readyCount, 1);

  const added = lottery.submit({ name: 'Grandma Rose', title: 'Casablanca' }, 'admin');
  assert.equal(added.source, 'admin');
  assert.equal(lottery.adminState().readyCount, 2);
});

test('admin state lists entries under names removed from the family list', () => {
  const db = nodeDb();
  const first = makeLottery({ db });
  first.lottery.submit({ name: 'Elena', title: 'Up' });
  const store = new LotteryStore(db);
  const renamed = MEMBERS.slice(0, 8).concat('Eli'); // Elena renamed
  const lottery = new Lottery({ store, config: { members: renamed } });
  assert.equal(lottery.adminState().unknown.length, 1);
  assert.equal(lottery.adminState().readyCount, 0);
});

test('public status never reveals movie titles before the draw', () => {
  const { lottery } = makeLottery();
  lottery.submit({ name: 'Maria', title: 'Secret Movie' });
  submitAll(lottery, 8, 1);
  assert.equal(lottery.publicStatus().state, 'ready');
  assert.ok(!JSON.stringify(lottery.publicStatus()).includes('Secret Movie'));
  lottery.draw();
  assert.ok(JSON.stringify(lottery.publicStatus()).includes('Secret Movie'));
});

test('export contains every round and submission', () => {
  const { lottery } = makeLottery();
  submitAll(lottery, 9);
  lottery.draw();
  lottery.startNewRound();
  const out = lottery.export();
  assert.equal(out.rounds.length, 2);
  assert.equal(out.submissions.length, 9);
});

test('config: exactly nine unique members and a strong admin password are required', () => {
  assert.equal(parseMembers(MEMBERS.join(', ')).length, 9);
  assert.throws(() => parseMembers('A,B,C'), ConfigError);
  assert.throws(() => parseMembers([...MEMBERS.slice(0, 8), 'maria'].join(',')), /twice/);
  assert.throws(() => loadConfig({}), /FAMILY_MEMBERS/);
  assert.throws(() => adminPassword({ ADMIN_PASSWORD: 'short' }), /at least 12/);
  assert.equal(adminPassword({ ADMIN_PASSWORD: 'correct horse battery' }), 'correct horse battery');
});

test('auth: password comparison', async () => {
  assert.equal(await passwordMatches('correct horse battery', 'correct horse battery'), true);
  assert.equal(await passwordMatches('correct horse batter', 'correct horse battery'), false);
  assert.equal(await passwordMatches(undefined, 'correct horse battery'), false);
});

test('auth: sessions are signed, expire, and are invalidated by a password change', async () => {
  const clock = new Clock();
  const store = new LotteryStore(nodeDb());
  const auth = new AdminAuth({ store, password: 'correct horse battery', now: clock.now });
  const { token } = await auth.createSession();
  assert.equal(await auth.verifySession(token), true);

  const [exp, nonce, sig] = token.split('.');
  assert.equal(await auth.verifySession(`${Number(exp) + 1000}.${nonce}.${sig}`), false, 'tampered expiry');
  assert.equal(await auth.verifySession(`${exp}.${nonce}.${sig.slice(0, -1)}A`), false, 'tampered signature');
  assert.equal(await auth.verifySession(''), false);

  const other = new AdminAuth({ store, password: 'a different password', now: clock.now });
  assert.equal(await other.verifySession(token), false, 'password change logs sessions out');

  clock.advance(SESSION_TTL_MS + 1);
  assert.equal(await auth.verifySession(token), false, 'expired');
});

test('auth: five wrong passwords lock that visitor out for 15 minutes', async () => {
  const clock = new Clock();
  const auth = new AdminAuth({ store: new LotteryStore(nodeDb()), password: 'correct horse battery', now: clock.now });
  for (let i = 0; i < 5; i++) assert.equal((await auth.login('guess', 'ip-a')).ok, false);
  const locked = await auth.login('correct horse battery', 'ip-a');
  assert.equal(locked.ok, false, 'even the right password is refused while locked');
  assert.ok(locked.retryAfter);
  assert.equal((await auth.login('correct horse battery', 'ip-b')).ok, true, 'other visitors unaffected');

  clock.advance(LOCKOUT_MS + 1);
  const ok = await auth.login('correct horse battery', 'ip-a');
  assert.equal(ok.ok, true);
  assert.ok(await auth.verifySession(ok.token));
});

test('auth: cookie parsing', () => {
  assert.equal(cookieValue('a=1; __Host-fmnl_admin=abc.def.g=h; b=2'), 'abc.def.g=h');
  assert.equal(cookieValue(null), '');
});

test('rate-limit counters reset after their window', () => {
  const store = new LotteryStore(nodeDb());
  assert.equal(store.hit('k', 1000, 100), 1);
  assert.equal(store.hit('k', 1050, 100), 2);
  assert.equal(store.count('k', 1050, 100), 2);
  assert.equal(store.hit('k', 1200, 100), 1);
});
