// In-memory stand-in for the parts of the Notion API the lottery uses.
// Exposes a `fetch` compatible function so the real NotionClient is exercised.

import { PROPS, ROUND_PROPS } from '../src/config.js';

const text = (s) => (s ? [{ type: 'text', text: { content: s }, plain_text: s }] : []);
const plain = (rt) => (rt ?? []).map((t) => t.plain_text ?? t.text?.content ?? '').join('');

export const SUBMISSIONS_DB = '11111111-1111-1111-1111-111111111111';
export const SUBMISSIONS_DS = '22222222-2222-2222-2222-222222222222';
export const ROUNDS_DB = '33333333-3333-3333-3333-333333333333';
export const ROUNDS_DS = '44444444-4444-4444-4444-444444444444';

export class FakeNotion {
  constructor({ now = () => Date.now(), pageSize = 100 } = {}) {
    this.now = now;
    this.pageSize = pageSize;
    this.pages = new Map(); // id -> page
    this.seq = 0;
    this.failures = []; // queued failures: { match: (method, path) => bool, status }
    this.requests = [];
    this.fetch = this.fetch.bind(this);
    this.schemas = {
      [SUBMISSIONS_DS]: {
        [PROPS.title]: { type: 'title' },
        [PROPS.name]: { type: 'select', select: { options: [] } },
        [PROPS.round]: { type: 'rich_text' },
        [PROPS.status]: { type: 'select', select: { options: [] } },
      },
      [ROUNDS_DS]: {
        [ROUND_PROPS.title]: { type: 'title' },
        [ROUND_PROPS.movie]: { type: 'rich_text' },
        [ROUND_PROPS.member]: { type: 'rich_text' },
        [ROUND_PROPS.date]: { type: 'date' },
      },
    };
  }

  // Simulates a form submission. Notion truncates created_time to the minute.
  submit(name, title, { at } = {}) {
    const id = `page-${++this.seq}`;
    const created = new Date(Math.floor((at ?? this.now()) / 60_000) * 60_000).toISOString();
    this.pages.set(id, {
      object: 'page',
      id,
      parentDs: SUBMISSIONS_DS,
      created_time: created,
      properties: {
        [PROPS.title]: { type: 'title', title: text(title) },
        [PROPS.name]: { type: 'select', select: name ? { name } : null },
        [PROPS.round]: { type: 'rich_text', rich_text: [] },
        [PROPS.status]: { type: 'select', select: null },
      },
    });
    return id;
  }

  submission(id) {
    const p = this.pages.get(id).properties;
    return {
      title: plain(p[PROPS.title].title),
      name: p[PROPS.name].select?.name,
      round: plain(p[PROPS.round].rich_text),
      status: p[PROPS.status].select?.name ?? '',
    };
  }

  setStatus(id, status) {
    this.pages.get(id).properties[PROPS.status].select = status ? { name: status } : null;
  }

  setTitle(id, title) {
    this.pages.get(id).properties[PROPS.title].title = text(title);
  }

  roundRows() {
    return [...this.pages.values()]
      .filter((p) => p.parentDs === ROUNDS_DS)
      .map((p) => ({
        round: plain(p.properties[ROUND_PROPS.title].title),
        movie: plain(p.properties[ROUND_PROPS.movie].rich_text),
        member: plain(p.properties[ROUND_PROPS.member].rich_text),
      }));
  }

  // Make the next `count` matching requests fail with `status`.
  failNext(count, status = 503, match = () => true) {
    for (let i = 0; i < count; i++) this.failures.push({ status, match });
  }

  async fetch(url, init = {}) {
    const path = new URL(url).pathname.replace(/^\/v1/, '');
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    this.requests.push({ method, path, body });
    const fi = this.failures.findIndex((f) => f.match(method, path));
    if (fi !== -1) {
      const [f] = this.failures.splice(fi, 1);
      if (f.status === 'network') throw new TypeError('fetch failed');
      return respond(f.status, { object: 'error', code: 'service_unavailable', message: 'Simulated outage' });
    }
    if (!init.headers?.Authorization?.startsWith('Bearer ')) return respond(401, { code: 'unauthorized' });
    if (!init.headers?.['Notion-Version']) return respond(400, { code: 'missing_version' });
    return this.route(method, path, body);
  }

  route(method, path, body) {
    let m;
    if (method === 'GET' && (m = path.match(/^\/databases\/(.+)$/))) {
      const ds = { [SUBMISSIONS_DB]: SUBMISSIONS_DS, [ROUNDS_DB]: ROUNDS_DS }[m[1]];
      return ds ? respond(200, { object: 'database', id: m[1], data_sources: [{ id: ds }] }) : respond(404, {});
    }
    if (method === 'POST' && (m = path.match(/^\/data_sources\/(.+)\/query$/))) return this.query(m[1], body);
    if ((m = path.match(/^\/data_sources\/([^/]+)$/)) && this.schemas[m[1]]) {
      if (method === 'PATCH') {
        for (const [k, v] of Object.entries(body.properties)) Object.assign(this.schemas[m[1]][k], v);
      }
      return respond(200, { object: 'data_source', id: m[1], properties: this.schemas[m[1]] });
    }
    if (method === 'PATCH' && (m = path.match(/^\/pages\/(.+)$/))) {
      const page = this.pages.get(m[1]);
      if (!page) return respond(404, {});
      for (const [k, v] of Object.entries(body.properties ?? {})) {
        if (v.rich_text) page.properties[k] = { type: 'rich_text', rich_text: v.rich_text.map((t) => ({ ...t, plain_text: t.text.content })) };
        else if (v.title) page.properties[k] = { type: 'title', title: v.title.map((t) => ({ ...t, plain_text: t.text.content })) };
        else if ('select' in v) page.properties[k] = { type: 'select', select: v.select };
        else page.properties[k] = v;
      }
      return respond(200, page);
    }
    if (method === 'POST' && path === '/pages') {
      const id = `page-${++this.seq}`;
      const props = {};
      for (const [k, v] of Object.entries(body.properties)) {
        if (v.rich_text) props[k] = { rich_text: v.rich_text.map((t) => ({ ...t, plain_text: t.text.content })) };
        else if (v.title) props[k] = { title: v.title.map((t) => ({ ...t, plain_text: t.text.content })) };
        else props[k] = v;
      }
      const page = { object: 'page', id, parentDs: body.parent.data_source_id, created_time: new Date(this.now()).toISOString(), properties: props };
      this.pages.set(id, page);
      return respond(200, page);
    }
    return respond(404, { message: `No fake route for ${method} ${path}` });
  }

  query(dsId, body) {
    let rows = [...this.pages.values()].filter((p) => p.parentDs === dsId);
    if (body.filter) rows = rows.filter((p) => matches(p, body.filter));
    rows.sort((a, b) => a.created_time.localeCompare(b.created_time));
    const start = Number(body.start_cursor ?? 0);
    const size = Math.min(body.page_size ?? 100, this.pageSize);
    const slice = rows.slice(start, start + size);
    const more = start + size < rows.length;
    return respond(200, { object: 'list', results: slice, has_more: more, next_cursor: more ? String(start + size) : null });
  }
}

function matches(page, f) {
  if (f.or) return f.or.some((g) => matches(page, g));
  if (f.and) return f.and.every((g) => matches(page, g));
  const prop = page.properties[f.property];
  const value = plain(prop?.rich_text ?? prop?.title);
  const cond = f.rich_text ?? f.title;
  if (cond.is_empty) return value === '';
  if ('equals' in cond) return value === cond.equals;
  throw new Error(`Unsupported filter ${JSON.stringify(f)}`);
}

function respond(status, data) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
