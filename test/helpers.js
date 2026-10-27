import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.js';
import { Lottery } from '../src/lottery.js';
import { LotteryStore } from '../src/store.js';

export const MEMBERS = ['Maria', 'John', 'Grandma Rose', 'Grandpa Joe', 'Ana', 'Luis', 'Sofia', 'Diego', 'Elena'];
export const MOVIES = ['The Princess Bride', 'Jurassic Park', 'Interstellar', 'Coco', 'Up', 'Back to the Future', 'Toy Story', 'Paddington 2', 'The Goonies'];

// node:sqlite with the same tiny interface as the Durable Object adapter.
export function nodeDb(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA busy_timeout = 5000');
  return {
    all: (sql, ...params) => db.prepare(sql).all(...params),
    transaction(fn) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = fn();
        db.exec('COMMIT');
        return result;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    close: () => db.close(),
  };
}

export function tempDbPath() {
  return join(mkdtempSync(join(tmpdir(), 'lottery-')), 'state.sqlite');
}

export class Clock {
  constructor(start = Date.parse('2026-10-24T18:00:00Z')) {
    this.t = start;
  }
  now = () => this.t;
  advance(ms) {
    this.t += ms;
  }
}

export function makeLottery({ db = nodeDb(), clock = new Clock(), randomInt } = {}) {
  const config = loadConfig({ FAMILY_MEMBERS: MEMBERS.join(',') });
  const store = new LotteryStore(db);
  const lottery = new Lottery({ store, config, now: clock.now, ...(randomInt ? { randomInt } : {}) });
  return { lottery, store, db, clock, config };
}

export function submitAll(lottery, count = 9, offset = 0) {
  const subs = [];
  for (let i = offset; i < offset + count; i++) subs.push(lottery.submit({ name: MEMBERS[i], title: MOVIES[i] }));
  return subs;
}
