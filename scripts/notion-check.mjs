// Verifies the Notion setup before (or after) deploying:
//   npm run notion:check                 check access and database properties
//   npm run notion:check -- --sync-members   also add missing names to "Your Name"
//
// Reads NOTION_TOKEN from the environment or .dev.vars, and the other
// settings from wrangler.toml [vars] (environment variables override).

import { readFileSync } from 'node:fs';
import { PROPS, ROUND_PROPS, STATUS, parseMembers, parseNotionId } from '../src/config.js';
import { NotionClient } from '../src/notion.js';

function readVars() {
  const vars = {};
  const read = (file, re) => {
    try {
      for (const m of readFileSync(file, 'utf8').matchAll(re)) vars[m[1]] = m[2];
    } catch {}
  };
  read('wrangler.toml', /^\s*([A-Z_]+)\s*=\s*"([^"]*)"/gm);
  read('.dev.vars', /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/gm);
  return { ...vars, ...process.env };
}

const env = readVars();
const problems = [];
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg) => {
  problems.push(msg);
  console.log(`  ✗ ${msg}`);
};

if (!env.NOTION_TOKEN) {
  console.error('NOTION_TOKEN is not set (export it or put it in .dev.vars).');
  process.exit(1);
}
const members = parseMembers(env.FAMILY_MEMBERS);
const notion = new NotionClient({ token: env.NOTION_TOKEN, ...(env.NOTION_API_BASE ? { apiBase: env.NOTION_API_BASE } : {}) });

async function checkDatabase(label, rawId, expected) {
  console.log(`\n${label}`);
  if (!rawId) return bad(`${label} ID is not set in wrangler.toml`), null;
  const id = parseNotionId(rawId);
  let dsId;
  let ds;
  try {
    dsId = await notion.dataSourceId(id);
    ds = await notion.request('GET', `/data_sources/${dsId}`);
  } catch (e) {
    bad(`Cannot open it (${e.status ?? ''} ${e.message}). Share the database with your integration: ••• → Connections.`);
    return null;
  }
  ok('Integration can access it');
  for (const [name, type] of Object.entries(expected)) {
    const prop = ds.properties?.[name];
    if (!prop) bad(`Missing property "${name}" (${type})`);
    else if (prop.type !== type) bad(`Property "${name}" should be ${type}, is ${prop.type}`);
    else ok(`"${name}" (${type})`);
  }
  return { dsId, ds };
}

const subs = await checkDatabase('Movie Submissions database', env.NOTION_SUBMISSIONS_DB, {
  [PROPS.title]: 'title',
  [PROPS.name]: 'select',
  [PROPS.round]: 'rich_text',
  [PROPS.status]: 'select',
});

if (subs?.ds.properties?.[PROPS.name]?.type === 'select') {
  const options = subs.ds.properties[PROPS.name].select.options.map((o) => o.name);
  const missing = members.filter((m) => !options.includes(m));
  const extra = options.filter((o) => !members.includes(o));
  if (missing.length && process.argv.includes('--sync-members')) {
    await notion.request('PATCH', `/data_sources/${subs.dsId}`, {
      properties: { [PROPS.name]: { select: { options: [...options, ...missing].map((name) => ({ name })) } } },
    });
    ok(`Added ${missing.join(', ')} to "${PROPS.name}"`);
  } else if (missing.length) {
    bad(`"${PROPS.name}" is missing: ${missing.join(', ')} (rerun with --sync-members to add them)`);
  } else ok(`"${PROPS.name}" has all ${members.length} family members`);
  if (extra.length) bad(`Remove these options from "${PROPS.name}" in Notion (not in FAMILY_MEMBERS): ${extra.join(', ')}`);
}

if (env.NOTION_ROUNDS_DB) {
  await checkDatabase('Lottery Rounds database', env.NOTION_ROUNDS_DB, {
    [ROUND_PROPS.title]: 'title',
    [ROUND_PROPS.movie]: 'rich_text',
    [ROUND_PROPS.member]: 'rich_text',
    [ROUND_PROPS.date]: 'date',
  });
} else console.log('\nLottery Rounds database: not configured (optional)');

console.log(`\nStatus values the lottery uses: ${Object.values(STATUS).join(', ')}`);
if (!env.NOTION_FORM_URL) bad('NOTION_FORM_URL is empty: the Submit button will be disabled');

console.log(problems.length ? `\n${problems.length} problem(s) found.` : '\nAll good! 🍿');
process.exit(problems.length ? 1 : 0);
