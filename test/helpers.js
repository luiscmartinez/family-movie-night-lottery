import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.js';
import { Lottery } from '../src/lottery.js';
import { NotionClient } from '../src/notion.js';
import { LotteryStore } from '../src/store.js';
import { FakeNotion, ROUNDS_DB, SUBMISSIONS_DB } from './fake-notion.js';

export const MEMBERS = ['Maria', 'John', 'Grandma Rose', 'Grandpa Joe', 'Ana', 'Luis', 'Sofia', 'Diego', 'Elena'];
export const MOVIES = ['The Princess Bride', 'Jurassic Park', 'Interstellar', 'Coco', 'Up', 'Back to the Future', 'Toy Story', 'Paddington 2', 'The Goonies'];

// node:sqlite with the same tiny interface as the Durable Object adapter.
export function nodeDb(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA busy_timeout = 5000');
  return {
    raw: db,
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

export const quietLog = { info() {}, warn() {} };

export function makeLottery({ api, db = nodeDb(), clock, randomInt, env = {}, retries = 3 } = {}) {
  clock ??= new Clock();
  api ??= new FakeNotion({ now: clock.now });
  const config = loadConfig({
    FAMILY_MEMBERS: MEMBERS.join(','),
    NOTION_TOKEN: 'secret_test',
    NOTION_SUBMISSIONS_DB: SUBMISSIONS_DB,
    NOTION_ROUNDS_DB: ROUNDS_DB,
    NOTION_FORM_URL: 'https://example.notion.site/form',
    REVEAL_DELAY_SECONDS: '20',
    ...env,
  });
  const notion = new NotionClient({ token: config.notionToken, fetchImpl: api.fetch, retries, sleep: async () => {} });
  const store = new LotteryStore(db);
  const lottery = new Lottery({ store, notion, config, now: clock.now, log: quietLog, ...(randomInt ? { randomInt } : {}) });
  return { lottery, store, api, db, clock, config };
}

export function submitAll(api, count = 9, offset = 0) {
  const ids = [];
  for (let i = offset; i < offset + count; i++) ids.push(api.submit(MEMBERS[i], MOVIES[i]));
  return ids;
}
