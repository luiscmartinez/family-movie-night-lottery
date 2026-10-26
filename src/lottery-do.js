// The single Durable Object instance that owns all lottery state.
// Every check, draw and admin action runs here, so they are serialized.

import { DurableObject } from 'cloudflare:workers';
import { loadConfig } from './config.js';
import { Lottery } from './lottery.js';
import { NotionClient } from './notion.js';
import { LotteryStore, durableObjectDb } from './store.js';

// Page views trigger a fresh Notion check at most this often.
const REFRESH_AFTER_MS = 15_000;

export class LotteryDO extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.store = new LotteryStore(durableObjectDb(ctx.storage));
  }

  lottery() {
    if (!this._lottery) {
      const config = loadConfig(this.env);
      const notion = new NotionClient({
        token: config.notionToken,
        version: config.notionVersion,
        apiBase: config.notionApiBase,
      });
      this._lottery = new Lottery({ store: this.store, notion, config });
    }
    return this._lottery;
  }

  async check() {
    const { round, drew, error } = await this.lottery().check();
    return { round: round.id, status: round.status, drew, error: error ?? null };
  }

  async publicStatus() {
    const lottery = this.lottery();
    const round = lottery.ensureRound();
    const stale = !round.checkedAt || Date.now() - round.checkedAt > REFRESH_AFTER_MS;
    if (round.status !== 'Completed' && stale) {
      // Wait briefly for a fresh check so the page feels instant, but never
      // hold the page hostage to a slow Notion API.
      const run = lottery.check().catch(() => {});
      this.ctx.waitUntil(run);
      await Promise.race([run, new Promise((r) => setTimeout(r, 4000))]);
    } else if (round.status === 'Completed' && !round.notionSynced) {
      this.ctx.waitUntil(lottery.check().catch(() => {}));
    }
    return lottery.publicStatus();
  }

  adminStatus() {
    return this.lottery().adminStatus();
  }

  startNewRound() {
    return this.lottery().startNewRound();
  }
}
