// Core lottery logic. Independent of Cloudflare so it can be tested in Node.

import { MAX_TITLE_LENGTH } from './config.js';
import { secureRandomInt } from './random.js';

// Decides which submissions count for a round. Pure function.
//
// Anyone with the link can submit under any name, so the rule is simple and
// conservative: a family member counts only when they have exactly one
// active (not removed) submission in the round. Two or more active
// submissions for the same name are a duplicate, and that member does not
// count until the administrator removes the extra ones.
export function evaluateRound(submissions, members) {
  const byMember = new Map(members.map((m) => [m, []]));
  for (const s of submissions) {
    if (!s.removedAt && byMember.has(s.member)) byMember.get(s.member).push(s);
  }
  const entries = [];
  const missing = [];
  const duplicates = [];
  for (const [member, list] of byMember) {
    if (list.length === 0) missing.push(member);
    else if (list.length === 1) entries.push({ member, title: list[0].title, submissionId: list[0].id });
    else duplicates.push(member);
  }
  return { entries, submitted: entries.map((e) => e.member), missing, duplicates, ready: entries.length === members.length };
}

export class LotteryError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export class Lottery {
  constructor({ store, config, now = () => Date.now(), randomInt = secureRandomInt }) {
    Object.assign(this, { store, config, now, randomInt });
  }

  ensureRound() {
    return this.store.currentRound() ?? this.store.startRound(this.now()) ?? this.store.currentRound();
  }

  // Returns the canonical member name, or throws for anything not in the list.
  member(name) {
    const key = String(name ?? '').trim().toLowerCase();
    const member = this.config.members.find((m) => m.toLowerCase() === key);
    if (!member) throw new LotteryError('Please choose your name from the list.');
    return member;
  }

  title(value) {
    const title = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!title) throw new LotteryError('Please enter a movie title.');
    if (title.length > MAX_TITLE_LENGTH) throw new LotteryError(`Movie titles can be at most ${MAX_TITLE_LENGTH} characters.`);
    return title;
  }

  // A family member's submission from the public form (or the admin on their behalf).
  submit({ name, title }, source = 'form') {
    const round = this.ensureRound();
    const member = this.member(name);
    const clean = this.title(title);
    if (round.status !== 'Open') throw new LotteryError('The winner has already been drawn. Submissions open again next round.', 409);
    const submission = this.store.addSubmission(round.id, { member, title: clean, source }, this.now());
    if (!submission) throw new LotteryError('The winner has already been drawn. Submissions open again next round.', 409);
    return submission;
  }

  editSubmission(id, { name, title }) {
    const fields = {};
    if (name !== undefined) fields.member = this.member(name);
    if (title !== undefined) fields.title = this.title(title);
    return this.mustUpdate(id, fields);
  }

  removeSubmission(id) {
    return this.mustUpdate(id, { removed: true });
  }

  restoreSubmission(id) {
    return this.mustUpdate(id, { removed: false });
  }

  mustUpdate(id, fields) {
    const updated = this.store.updateSubmission(Number(id), fields, this.now());
    if (!updated) throw new LotteryError('That submission can no longer be changed (not found, or its round is already drawn).', 409);
    return updated;
  }

  // The admin's "Draw Winning Movie" button. Allowed only once per round, and
  // only when every family member has exactly one active submission.
  draw() {
    const round = this.ensureRound();
    if (round.status !== 'Open') throw new LotteryError(`${round.label} has already been drawn.`, 409);
    const ev = evaluateRound(this.store.submissions(round.id), this.config.members);
    if (!ev.ready) {
      const parts = [];
      if (ev.missing.length) parts.push(`waiting for ${ev.missing.join(', ')}`);
      if (ev.duplicates.length) parts.push(`resolve duplicates for ${ev.duplicates.join(', ')}`);
      throw new LotteryError(`Not ready to draw: ${parts.join('; ')}.`, 409);
    }
    const drawn = this.store.recordDraw(round.id, {
      entries: ev.entries,
      winnerIndex: this.randomInt(ev.entries.length),
      drawnAt: this.now(),
    });
    if (!drawn) throw new LotteryError(`${round.label} has already been drawn.`, 409);
    return drawn;
  }

  // Starts the next round. Only allowed once the current round is drawn.
  startNewRound() {
    const current = this.ensureRound();
    if (current.status !== 'Completed') throw new LotteryError(`${current.label} hasn't been drawn yet.`, 409);
    const round = this.store.startRound(this.now());
    if (!round) throw new LotteryError('A round is already open.', 409);
    return round;
  }

  history(excludeId) {
    return this.store
      .completedRounds(6)
      .filter((r) => r.id !== excludeId)
      .slice(0, 5)
      .map((r) => ({ label: r.label, title: r.winnerTitle, member: r.winnerMember, drawnAt: r.drawnAt }));
  }

  // What anyone with the link may see. Movie titles stay hidden until the draw.
  publicStatus() {
    const round = this.ensureRound();
    const total = this.config.members.length;
    const base = {
      round: { number: round.number, label: round.label },
      total,
      members: this.config.members,
      history: this.history(round.id),
    };
    if (round.status === 'Open') {
      const ev = evaluateRound(this.store.submissions(round.id), this.config.members);
      return {
        ...base,
        state: ev.ready ? 'ready' : 'open',
        submittedCount: ev.submitted.length,
        submitted: ev.submitted,
        waitingFor: ev.missing,
        needsAttention: ev.duplicates,
      };
    }
    return {
      ...base,
      state: 'completed',
      submittedCount: total,
      winner: { title: round.winnerTitle, member: round.winnerMember, drawnAt: round.drawnAt },
      winnerIndex: round.winnerIndex, // lets the page's wheel land on the saved result
      entries: round.entries.map(({ member, title }) => ({ member, title })),
    };
  }

  // Full detail for the admin dashboard.
  adminState() {
    const round = this.ensureRound();
    const subs = this.store.submissions(round.id);
    const ev = evaluateRound(subs, this.config.members);
    const status = (m) => (ev.submitted.includes(m) ? 'ready' : ev.duplicates.includes(m) ? 'duplicate' : 'missing');
    return {
      round,
      canDraw: round.status === 'Open' && ev.ready,
      readyCount: ev.submitted.length,
      total: this.config.members.length,
      members: this.config.members.map((m) => ({
        name: m,
        status: round.status === 'Open' ? status(m) : 'ready',
        submissions: subs.filter((s) => s.member === m && !s.removedAt),
      })),
      // Entries under a name that is no longer in FAMILY_MEMBERS.
      unknown: subs.filter((s) => !s.removedAt && !this.config.members.includes(s.member)),
      removed: subs.filter((s) => s.removedAt),
      history: this.history(round.id),
    };
  }

  // Everything, for backups.
  export() {
    return { exportedAt: new Date(this.now()).toISOString(), rounds: this.store.allRounds(), submissions: this.store.allSubmissions() };
  }
}
