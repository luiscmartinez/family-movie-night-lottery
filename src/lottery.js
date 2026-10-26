// Core lottery logic. Independent of Cloudflare so it can be tested in Node.

import { STATUS } from './config.js';
import { secureRandomInt } from './random.js';

const MINUTE = 60_000;
const SYNC_LEASE_MS = 2 * MINUTE;
// Cloudflare's free plan allows 50 outbound requests per invocation; leave
// room for the query and the results sync. Any remainder is written next check.
const MAX_UPDATES_PER_CHECK = 25;

// Decides which submissions count for a round. Pure function.
//
// Notion forms do not authenticate respondents, so the rule is simple and
// conservative: a family member counts only when they have exactly one
// submission in the round that the administrator has not marked "Rejected".
// Two or more submissions for the same name are all marked "Duplicate" and
// that member does not count until the administrator rejects the extra ones.
export function evaluateRound(round, rows, members) {
  // Notion's created_time is truncated to the minute.
  const startMinute = Math.floor(round.startedAt / MINUTE) * MINUTE;
  const memberByKey = new Map(members.map((m) => [m.toLowerCase(), m]));
  const byMember = new Map(members.map((m) => [m, []]));
  const desired = new Map(); // row id -> { round, status }

  for (const row of rows) {
    if (row.round && row.round !== round.id) continue;
    if (!row.round && Date.parse(row.createdTime) < startMinute) {
      desired.set(row.id, { round: 'late', status: STATUS.late });
      continue;
    }
    if (row.status === STATUS.rejected) {
      desired.set(row.id, { round: round.id, status: STATUS.rejected });
      continue;
    }
    const member = memberByKey.get(row.name.trim().toLowerCase());
    if (!member || !row.title) {
      desired.set(row.id, { round: round.id, status: STATUS.review });
      continue;
    }
    byMember.get(member).push(row);
  }

  const entries = [];
  const missing = [];
  const conflicts = [];
  for (const [member, list] of byMember) {
    if (list.length === 0) {
      missing.push(member);
    } else if (list.length === 1) {
      entries.push({ member, title: list[0].title, pageId: list[0].id });
      desired.set(list[0].id, { round: round.id, status: STATUS.counted });
    } else {
      conflicts.push(member);
      for (const r of list) desired.set(r.id, { round: round.id, status: STATUS.duplicate });
    }
  }

  // Only write to Notion what actually changed.
  const updates = [];
  for (const r of rows) {
    const d = desired.get(r.id);
    if (d && (r.round !== d.round || r.status !== d.status)) updates.push({ id: r.id, ...d });
  }

  return {
    entries,
    submitted: entries.map((e) => e.member),
    missing,
    conflicts,
    updates,
    ready: entries.length === members.length,
  };
}

export class Lottery {
  constructor({ store, notion, config, now = () => Date.now(), randomInt = secureRandomInt, log = console }) {
    Object.assign(this, { store, notion, config, now, randomInt, log });
    this.inflight = null;
  }

  // Runs one check. Concurrent callers in the same process share the same run;
  // across processes the compare-and-set in store.recordDraw prevents a
  // second draw.
  check() {
    if (!this.inflight) {
      this.inflight = this.runCheck().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  ensureRound() {
    // The very first round counts every unassigned submission (start = 0).
    return this.store.currentRound() ?? this.store.startRound(0, this.now()) ?? this.store.currentRound();
  }

  async runCheck() {
    let round = this.ensureRound();
    if (round.status === 'Drawing') round = this.store.completeIfRevealed(round.id, this.now()) ?? round;
    if (round.status === 'Completed') {
      await this.syncResults(round);
      return { round, drew: false };
    }
    if (round.status !== 'Open') return { round, drew: false };

    let rows;
    try {
      rows = await this.notion.querySubmissions(this.config.submissionsDb, round.id);
    } catch (e) {
      // Nothing has been decided; the next check simply tries again.
      this.store.saveError(round.id, e.message);
      this.log.warn?.(`check failed: ${e.message}`);
      return { round, drew: false, error: e.message };
    }

    const ev = evaluateRound(round, rows, this.config.members);

    // Another run may have drawn while we waited on Notion.
    const latest = this.store.getRound(round.id);
    if (latest.status !== 'Open') return { round: latest, drew: false };

    this.store.saveProgress(
      round.id,
      { submitted: ev.submitted, missing: ev.missing, conflicts: ev.conflicts },
      this.now(),
    );

    let drew = false;
    if (ev.ready) {
      const now = this.now();
      const drawn = this.store.recordDraw(round.id, {
        entries: ev.entries,
        winnerIndex: this.randomInt(ev.entries.length),
        drawnAt: now,
        revealAt: now + this.config.revealDelayMs,
      });
      if (drawn) {
        drew = true;
        round = drawn;
        this.log.info?.(`${round.id}: drew "${round.winnerTitle}" (${round.winnerMember})`);
      } else {
        round = this.store.getRound(round.id);
      }
    }

    await this.applyUpdates(ev.updates);
    if (round.status === 'Drawing') round = this.store.completeIfRevealed(round.id, this.now()) ?? round;
    if (round.status === 'Completed') await this.syncResults(round);
    return { round, drew };
  }

  // Cosmetic Notion bookkeeping. Failures are retried on the next check.
  async applyUpdates(updates) {
    for (const u of updates.slice(0, MAX_UPDATES_PER_CHECK)) {
      try {
        await this.notion.updateSubmission(u.id, { round: u.round, status: u.status });
      } catch (e) {
        this.log.warn?.(`could not update submission ${u.id}: ${e.message}`);
        return;
      }
    }
  }

  // Copies a completed round's result to Notion. Never changes the winner.
  async syncResults(round) {
    if (round.notionSynced || !this.store.claimSync(round.id, this.now(), SYNC_LEASE_MS)) return;
    try {
      for (const [i, e] of round.entries.entries()) {
        await this.notion.updateSubmission(e.pageId, {
          round: round.id,
          status: i === round.winnerIndex ? STATUS.winner : STATUS.counted,
        });
      }
      if (this.config.roundsDb) await this.notion.upsertRoundResult(this.config.roundsDb, round);
      this.store.markSynced(round.id);
    } catch (e) {
      this.store.releaseSync(round.id);
      this.log.warn?.(`could not sync results for ${round.id}: ${e.message}`);
    }
  }

  // Starts the next round. Only allowed once the current round is completed.
  startNewRound() {
    const current = this.ensureRound();
    if (current.status !== 'Completed') {
      return { ok: false, error: `${current.label} is still ${current.status.toLowerCase()}.` };
    }
    const now = this.now();
    const round = this.store.startRound(now, now);
    return round ? { ok: true, round } : { ok: false, error: 'A round is already in progress.' };
  }

  // What anyone with the link may see. Movie titles stay hidden until the winner is revealed.
  publicStatus() {
    let round = this.ensureRound();
    if (round.status === 'Drawing') round = this.store.completeIfRevealed(round.id, this.now()) ?? round;
    const total = this.config.members.length;
    const base = {
      round: { number: round.number, label: round.label, startedAt: round.startedAt || null },
      total,
      formUrl: this.config.formUrl,
      checkedAt: round.checkedAt,
      history: this.store
        .completedRounds(6)
        .filter((r) => r.id !== round.id)
        .slice(0, 5)
        .map((r) => ({ label: r.label, title: r.winnerTitle, member: r.winnerMember, drawnAt: r.drawnAt })),
    };
    if (round.status === 'Open') {
      const p = round.progress ?? { submitted: [], missing: this.config.members, conflicts: [] };
      return {
        ...base,
        state: 'open',
        submittedCount: p.submitted.length,
        submitted: p.submitted,
        waitingFor: p.missing,
        needsAttention: p.conflicts,
        notionError: round.lastError ? true : false,
      };
    }
    if (round.status === 'Drawing') {
      return { ...base, state: 'drawing', submittedCount: total, revealAt: round.revealAt };
    }
    return {
      ...base,
      state: 'completed',
      submittedCount: total,
      winner: { title: round.winnerTitle, member: round.winnerMember, drawnAt: round.drawnAt },
      entries: round.entries.map(({ member, title }) => ({ member, title })),
    };
  }

  // Full detail for the administrator page.
  adminStatus() {
    const round = this.ensureRound();
    const { entries, winnerTitle, winnerMember, ...rest } = round;
    return {
      ...rest,
      members: this.config.members,
      ...(round.status === 'Completed' ? { entries, winnerTitle, winnerMember } : {}),
    };
  }
}
