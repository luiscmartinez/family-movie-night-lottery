// Persistent lottery state in SQLite (Durable Object storage in production,
// node:sqlite in tests). The `db` adapter exposes:
//   all(sql, ...params) -> rows      transaction(fn) -> fn()

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS rounds (
    id            TEXT PRIMARY KEY,
    number        INTEGER NOT NULL UNIQUE,
    status        TEXT NOT NULL CHECK (status IN ('Open', 'Completed')),
    started_at    INTEGER NOT NULL,
    drawn_at      INTEGER,
    entries_json  TEXT,
    winner_index  INTEGER,
    winner_title  TEXT,
    winner_member TEXT,
    winner_submission_id INTEGER
  )`,
  // At most one round may be open at any time.
  `CREATE UNIQUE INDEX IF NOT EXISTS one_open_round ON rounds (status) WHERE status = 'Open'`,
  `CREATE TABLE IF NOT EXISTS submissions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    round_id   TEXT NOT NULL REFERENCES rounds (id),
    member     TEXT NOT NULL,
    title      TEXT NOT NULL,
    source     TEXT NOT NULL DEFAULT 'form',
    created_at INTEGER NOT NULL,
    updated_at INTEGER,
    removed_at INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS submissions_by_round ON submissions (round_id)`,
  // Fixed-window counters for login lockout and submission rate limiting.
  `CREATE TABLE IF NOT EXISTS counters (
    key          TEXT PRIMARY KEY,
    window_start INTEGER NOT NULL,
    count        INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
];

export class LotteryStore {
  constructor(db) {
    this.db = db;
    for (const sql of SCHEMA) db.all(sql);
  }

  one(sql, ...params) {
    return this.db.all(sql, ...params)[0] ?? null;
  }

  currentRound() {
    return toRound(this.one('SELECT * FROM rounds ORDER BY number DESC LIMIT 1'));
  }

  getRound(id) {
    return toRound(this.one('SELECT * FROM rounds WHERE id = ?', id));
  }

  completedRounds(limit = 10) {
    return this.db
      .all(`SELECT * FROM rounds WHERE status = 'Completed' ORDER BY number DESC LIMIT ?`, limit)
      .map(toRound);
  }

  allRounds() {
    return this.db.all('SELECT * FROM rounds ORDER BY number').map(toRound);
  }

  // Creates the next round unless one is still open. Returns the new round,
  // or null if an open round already exists.
  startRound(now) {
    return this.db.transaction(() => {
      if (this.one(`SELECT id FROM rounds WHERE status = 'Open'`)) return null;
      const number = (this.one('SELECT MAX(number) AS n FROM rounds')?.n ?? 0) + 1;
      const id = `R${number}-${new Date(now).toISOString().slice(0, 10)}`;
      return toRound(
        this.one(
          `INSERT INTO rounds (id, number, status, started_at) VALUES (?, ?, 'Open', ?) RETURNING *`,
          id,
          number,
          now,
        ),
      );
    });
  }

  // Inserts only while the round is open, in the same statement, so a
  // submission can never slip into a round that has already been drawn.
  addSubmission(roundId, { member, title, source }, now) {
    return toSubmission(
      this.one(
        `INSERT INTO submissions (round_id, member, title, source, created_at)
         SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM rounds WHERE id = ? AND status = 'Open')
         RETURNING *`,
        roundId,
        member,
        title,
        source,
        now,
        roundId,
      ),
    );
  }

  submissions(roundId) {
    return this.db.all('SELECT * FROM submissions WHERE round_id = ? ORDER BY created_at, id', roundId).map(toSubmission);
  }

  allSubmissions() {
    return this.db.all('SELECT * FROM submissions ORDER BY id').map(toSubmission);
  }

  // Edits are only possible while the submission's round is open.
  updateSubmission(id, fields, now) {
    const sets = [];
    const params = [];
    for (const [col, value] of [
      ['member', fields.member],
      ['title', fields.title],
    ]) {
      if (value !== undefined) {
        sets.push(`${col} = ?`);
        params.push(value);
      }
    }
    if ('removed' in fields) sets.push(fields.removed ? 'removed_at = ?' : 'removed_at = NULL');
    if (fields.removed) params.push(now);
    return toSubmission(
      this.one(
        `UPDATE submissions SET ${[...sets, 'updated_at = ?'].join(', ')}
          WHERE id = ? AND round_id IN (SELECT id FROM rounds WHERE status = 'Open')
          RETURNING *`,
        ...params,
        now,
        id,
      ),
    );
  }

  // The single place a winner is ever written. The `status = 'Open'` guard
  // makes this a compare-and-set: only the first caller changes the row, so a
  // round can never be drawn twice or have its winner replaced.
  recordDraw(id, { entries, winnerIndex, drawnAt }) {
    const w = entries[winnerIndex];
    return toRound(
      this.one(
        `UPDATE rounds
            SET status = 'Completed', drawn_at = ?, entries_json = ?, winner_index = ?,
                winner_title = ?, winner_member = ?, winner_submission_id = ?
          WHERE id = ? AND status = 'Open'
          RETURNING *`,
        drawnAt,
        JSON.stringify(entries),
        winnerIndex,
        w.title,
        w.member,
        w.submissionId,
        id,
      ),
    );
  }

  // Increments a fixed-window counter and returns the count in the current window.
  hit(key, now, windowMs) {
    return this.one(
      `INSERT INTO counters (key, window_start, count) VALUES (?, ?, 1)
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN window_start <= ? THEN 1 ELSE count + 1 END,
         window_start = CASE WHEN window_start <= ? THEN excluded.window_start ELSE window_start END
       RETURNING count`,
      key,
      now,
      now - windowMs,
      now - windowMs,
    ).count;
  }

  count(key, now, windowMs) {
    const row = this.one('SELECT count, window_start FROM counters WHERE key = ?', key);
    return row && row.window_start > now - windowMs ? row.count : 0;
  }

  clearCounter(key) {
    this.db.all('DELETE FROM counters WHERE key = ?', key);
  }

  getMeta(key) {
    return this.one('SELECT value FROM meta WHERE key = ?', key)?.value ?? null;
  }

  // Sets the value only if the key is absent; returns the stored value.
  initMeta(key, value) {
    this.db.all('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO NOTHING', key, value);
    return this.getMeta(key);
  }
}

function toRound(row) {
  if (!row) return null;
  return {
    id: row.id,
    number: row.number,
    label: `Movie Night #${row.number}`,
    status: row.status,
    startedAt: row.started_at,
    drawnAt: row.drawn_at,
    entries: row.entries_json ? JSON.parse(row.entries_json) : null,
    winnerIndex: row.winner_index,
    winnerTitle: row.winner_title,
    winnerMember: row.winner_member,
    winnerSubmissionId: row.winner_submission_id,
  };
}

function toSubmission(row) {
  if (!row) return null;
  return {
    id: row.id,
    roundId: row.round_id,
    member: row.member,
    title: row.title,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    removedAt: row.removed_at,
  };
}

// Adapter for Durable Object SQLite storage (ctx.storage).
export function durableObjectDb(storage) {
  return {
    all: (sql, ...params) => storage.sql.exec(sql, ...params).toArray(),
    transaction: (fn) => storage.transactionSync(fn),
  };
}
