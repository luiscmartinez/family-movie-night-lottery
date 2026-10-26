// Persistent lottery state in SQLite (Durable Object storage in production,
// node:sqlite in tests). The `db` adapter exposes:
//   all(sql, ...params) -> rows      transaction(fn) -> fn()

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS rounds (
    id            TEXT PRIMARY KEY,
    number        INTEGER NOT NULL UNIQUE,
    status        TEXT NOT NULL CHECK (status IN ('Open', 'Drawing', 'Completed')),
    started_at    INTEGER NOT NULL,
    drawn_at      INTEGER,
    reveal_at     INTEGER,
    completed_at  INTEGER,
    entries_json  TEXT,
    winner_index  INTEGER,
    winner_title  TEXT,
    winner_member TEXT,
    winner_page_id TEXT,
    progress_json TEXT,
    checked_at    INTEGER,
    last_error    TEXT,
    notion_synced INTEGER NOT NULL DEFAULT 0,
    sync_lease_until INTEGER
  )`,
  // At most one round may be unfinished at any time.
  `CREATE UNIQUE INDEX IF NOT EXISTS one_active_round
     ON rounds (status = 'Completed') WHERE status <> 'Completed'`,
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

  // Creates the next round unless one is still unfinished. Returns the new
  // round, or null if an unfinished round already exists.
  startRound(startedAt, now = startedAt) {
    return this.db.transaction(() => {
      if (this.one(`SELECT id FROM rounds WHERE status <> 'Completed'`)) return null;
      const number = (this.one('SELECT MAX(number) AS n FROM rounds')?.n ?? 0) + 1;
      const id = `R${number}-${new Date(now).toISOString().slice(0, 10)}`;
      return toRound(
        this.one(
          `INSERT INTO rounds (id, number, status, started_at) VALUES (?, ?, 'Open', ?) RETURNING *`,
          id,
          number,
          startedAt,
        ),
      );
    });
  }

  saveProgress(id, progress, checkedAt) {
    this.db.all(
      `UPDATE rounds SET progress_json = ?, checked_at = ?, last_error = NULL WHERE id = ? AND status = 'Open'`,
      JSON.stringify(progress),
      checkedAt,
      id,
    );
  }

  saveError(id, message) {
    this.db.all('UPDATE rounds SET last_error = ? WHERE id = ?', message, id);
  }

  // The single place a winner is ever written. The `status = 'Open'` guard
  // makes this a compare-and-set: only the first caller changes the row, so a
  // round can never be drawn twice or have its winner replaced.
  recordDraw(id, { entries, winnerIndex, drawnAt, revealAt }) {
    const w = entries[winnerIndex];
    return toRound(
      this.one(
        `UPDATE rounds
            SET status = 'Drawing', drawn_at = ?, reveal_at = ?, entries_json = ?,
                winner_index = ?, winner_title = ?, winner_member = ?, winner_page_id = ?
          WHERE id = ? AND status = 'Open'
          RETURNING *`,
        drawnAt,
        revealAt,
        JSON.stringify(entries),
        winnerIndex,
        w.title,
        w.member,
        w.pageId,
        id,
      ),
    );
  }

  completeIfRevealed(id, now) {
    return toRound(
      this.one(
        `UPDATE rounds SET status = 'Completed', completed_at = reveal_at
          WHERE id = ? AND status = 'Drawing' AND reveal_at <= ? RETURNING *`,
        id,
        now,
      ),
    );
  }

  // Lets exactly one execution write a round's result to Notion at a time.
  claimSync(id, now, leaseMs) {
    return !!this.one(
      `UPDATE rounds SET sync_lease_until = ?
        WHERE id = ? AND status = 'Completed' AND notion_synced = 0
          AND (sync_lease_until IS NULL OR sync_lease_until < ?)
        RETURNING id`,
      now + leaseMs,
      id,
      now,
    );
  }

  releaseSync(id) {
    this.db.all('UPDATE rounds SET sync_lease_until = NULL WHERE id = ?', id);
  }

  markSynced(id) {
    this.db.all('UPDATE rounds SET notion_synced = 1, sync_lease_until = NULL WHERE id = ?', id);
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
    revealAt: row.reveal_at,
    completedAt: row.completed_at,
    entries: row.entries_json ? JSON.parse(row.entries_json) : null,
    winnerIndex: row.winner_index,
    winnerTitle: row.winner_title,
    winnerMember: row.winner_member,
    winnerPageId: row.winner_page_id,
    progress: row.progress_json ? JSON.parse(row.progress_json) : null,
    checkedAt: row.checked_at,
    lastError: row.last_error,
    notionSynced: !!row.notion_synced,
  };
}

// Adapter for Durable Object SQLite storage (ctx.storage).
export function durableObjectDb(storage) {
  return {
    all: (sql, ...params) => storage.sql.exec(sql, ...params).toArray(),
    transaction: (fn) => storage.transactionSync(fn),
  };
}
