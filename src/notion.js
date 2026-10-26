// Minimal Notion API client: only the calls the lottery needs, with retries.

import { PROPS, ROUND_PROPS } from './config.js';

export class NotionError extends Error {
  constructor(message, { status, code, retryable } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

export class NotionClient {
  constructor({
    token,
    version = '2026-03-11',
    apiBase = 'https://api.notion.com/v1',
    fetchImpl = (...a) => fetch(...a),
    retries = 3,
    baseDelayMs = 500,
    sleep = sleepMs,
  }) {
    Object.assign(this, { token, version, apiBase, fetchImpl, retries, baseDelayMs, sleep });
    this.dataSourceIds = new Map();
  }

  async request(method, path, body) {
    let attempt = 0;
    for (;;) {
      let err;
      try {
        const res = await this.fetchImpl(`${this.apiBase}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Notion-Version': this.version,
            'Content-Type': 'application/json',
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (res.ok) return await res.json();
        const data = await res.json().catch(() => ({}));
        const retryable = res.status === 429 || res.status >= 500;
        err = new NotionError(`Notion ${method} ${path} failed: ${res.status} ${data.message ?? ''}`.trim(), {
          status: res.status,
          code: data.code,
          retryable,
        });
        err.retryAfterMs = Number(res.headers?.get?.('retry-after')) * 1000 || 0;
      } catch (e) {
        if (e instanceof NotionError) throw e;
        // Network errors and timeouts are worth retrying.
        err = new NotionError(`Notion ${method} ${path} failed: ${e.message}`, { retryable: true });
      }
      if (!err.retryable || attempt >= this.retries) throw err;
      await this.sleep(Math.max(err.retryAfterMs ?? 0, this.baseDelayMs * 2 ** attempt));
      attempt++;
    }
  }

  // Accepts either a database ID (resolved to its first data source) or a data source ID.
  async dataSourceId(id) {
    if (this.dataSourceIds.has(id)) return this.dataSourceIds.get(id);
    let dsId = id;
    try {
      const db = await this.request('GET', `/databases/${id}`);
      if (db.data_sources?.length) dsId = db.data_sources[0].id;
    } catch (e) {
      if (e.status !== 404 && e.status !== 400) throw e;
    }
    this.dataSourceIds.set(id, dsId);
    return dsId;
  }

  async queryAll(dataSourceId, body) {
    const results = [];
    let cursor;
    do {
      const page = await this.request('POST', `/data_sources/${dataSourceId}/query`, {
        ...body,
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      });
      results.push(...page.results);
      cursor = page.has_more ? page.next_cursor : undefined;
    } while (cursor);
    return results;
  }

  // Rows that belong to the given round, plus rows not yet assigned to any round.
  async querySubmissions(databaseId, roundId) {
    const dsId = await this.dataSourceId(databaseId);
    const pages = await this.queryAll(dsId, {
      filter: {
        or: [
          { property: PROPS.round, rich_text: { is_empty: true } },
          { property: PROPS.round, rich_text: { equals: roundId } },
        ],
      },
      sorts: [{ timestamp: 'created_time', direction: 'ascending' }],
    });
    return pages.map(toSubmission);
  }

  async updateSubmission(pageId, { round, status }) {
    const properties = {};
    if (round !== undefined) properties[PROPS.round] = { rich_text: richText(round) };
    if (status !== undefined) properties[PROPS.status] = { select: status ? { name: status } : null };
    await this.request('PATCH', `/pages/${pageId}`, { properties });
  }

  // Creates or updates the row for a completed round in the "Lottery Rounds" database.
  async upsertRoundResult(databaseId, round) {
    const dsId = await this.dataSourceId(databaseId);
    const properties = {
      [ROUND_PROPS.title]: { title: richText(round.label) },
      [ROUND_PROPS.movie]: { rich_text: richText(round.winnerTitle) },
      [ROUND_PROPS.member]: { rich_text: richText(round.winnerMember) },
      [ROUND_PROPS.date]: { date: { start: new Date(round.drawnAt).toISOString() } },
    };
    const existing = await this.queryAll(dsId, {
      filter: { property: ROUND_PROPS.title, title: { equals: round.label } },
    });
    if (existing.length) {
      await this.request('PATCH', `/pages/${existing[0].id}`, { properties });
    } else {
      await this.request('POST', '/pages', { parent: { type: 'data_source_id', data_source_id: dsId }, properties });
    }
  }
}

function richText(content) {
  return content ? [{ type: 'text', text: { content: String(content).slice(0, 2000) } }] : [];
}

function plain(items) {
  return (items ?? []).map((t) => t.plain_text ?? t.text?.content ?? '').join('').trim();
}

export function toSubmission(page) {
  const p = page.properties ?? {};
  return {
    id: page.id,
    createdTime: page.created_time,
    title: plain(p[PROPS.title]?.title),
    name: p[PROPS.name]?.select?.name ?? '',
    round: plain(p[PROPS.round]?.rich_text),
    status: p[PROPS.status]?.select?.name ?? '',
  };
}
