// The single Durable Object instance that owns all lottery state.
// Every submission, admin action and draw runs here, one at a time.

import { DurableObject } from 'cloudflare:workers';
import { AdminAuth } from './auth.js';
import { adminPassword, ConfigError, loadConfig } from './config.js';
import { Lottery, LotteryError } from './lottery.js';
import { LotteryStore, durableObjectDb } from './store.js';

export const SUBMIT_LIMIT = 10; // per visitor per hour
const HOUR = 60 * 60 * 1000;

// Runs fn and turns expected errors into { status, body } results.
async function respond(fn) {
  try {
    return { status: 200, body: await fn() };
  } catch (e) {
    if (e instanceof LotteryError) return { status: e.status, body: { error: e.message } };
    if (e instanceof ConfigError) return { status: 503, body: { error: `Setup needed: ${e.message}` } };
    throw e;
  }
}

export class LotteryDO extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.store = new LotteryStore(durableObjectDb(ctx.storage));
  }

  lottery() {
    return (this._lottery ??= new Lottery({ store: this.store, config: loadConfig(this.env) }));
  }

  auth() {
    return (this._auth ??= new AdminAuth({ store: this.store, password: adminPassword(this.env) }));
  }

  publicStatus() {
    return respond(() => this.lottery().publicStatus());
  }

  submit(body, clientKey) {
    return respond(() => {
      if (this.store.hit(`submit:${clientKey}`, Date.now(), HOUR) > SUBMIT_LIMIT) {
        throw new LotteryError('Too many submissions from this device. Please try again later.', 429);
      }
      const s = this.lottery().submit({ name: body?.name, title: body?.title });
      return { ok: true, member: s.member };
    });
  }

  login(password, clientKey) {
    return respond(async () => {
      const result = await this.auth().login(password, clientKey);
      if (!result.ok) throw new LotteryError(result.error, result.retryAfter ? 429 : 401);
      return result;
    });
  }

  admin(token, action, payload = {}) {
    return respond(async () => {
      if (!(await this.auth().verifySession(token))) throw new LotteryError('Please sign in again.', 401);
      const lottery = this.lottery();
      switch (action) {
        case 'state':
          break;
        case 'add':
          lottery.submit({ name: payload.name, title: payload.title }, 'admin');
          break;
        case 'edit':
          lottery.editSubmission(payload.id, { name: payload.name, title: payload.title });
          break;
        case 'remove':
          lottery.removeSubmission(payload.id);
          break;
        case 'restore':
          lottery.restoreSubmission(payload.id);
          break;
        case 'draw':
          lottery.draw();
          break;
        case 'new-round':
          lottery.startNewRound();
          break;
        case 'export':
          return lottery.export();
        default:
          throw new LotteryError('Unknown action.', 404);
      }
      return lottery.adminState();
    });
  }
}
