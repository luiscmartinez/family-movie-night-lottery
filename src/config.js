// Reads and validates the Worker environment (wrangler.toml [vars] + secrets).

export const FAMILY_SIZE = 9;

// Property names in the "Movie Submissions" Notion database.
export const PROPS = {
  title: 'Movie Title',
  name: 'Your Name',
  round: 'Round',
  status: 'Status',
};

// Property names in the optional "Lottery Rounds" Notion database.
export const ROUND_PROPS = {
  title: 'Round',
  movie: 'Winning Movie',
  member: 'Submitted By',
  date: 'Lottery Date',
};

// Values the lottery writes to the submission "Status" select.
// "Rejected" is the only value the administrator sets by hand.
export const STATUS = {
  counted: 'Counted',
  duplicate: 'Duplicate',
  review: 'Needs review',
  rejected: 'Rejected',
  late: 'Late',
  winner: 'Winner',
};

export class ConfigError extends Error {}

// Accepts a bare 32-char ID, a dashed UUID, or a full notion.so URL.
export function parseNotionId(value) {
  if (!value) return '';
  const match = String(value).replace(/-/g, '').match(/[0-9a-f]{32}(?![0-9a-f])/i);
  if (!match) throw new ConfigError(`Not a Notion ID or URL: ${value}`);
  const h = match[0].toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function parseMembers(value) {
  const members = String(value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (members.length !== FAMILY_SIZE) {
    throw new ConfigError(
      `FAMILY_MEMBERS must list exactly ${FAMILY_SIZE} comma-separated names (found ${members.length}).`,
    );
  }
  const seen = new Set();
  for (const m of members) {
    const key = m.toLowerCase();
    if (seen.has(key)) throw new ConfigError(`FAMILY_MEMBERS contains "${m}" twice.`);
    seen.add(key);
  }
  return members;
}

export function loadConfig(env) {
  const missing = ['NOTION_TOKEN', 'NOTION_SUBMISSIONS_DB'].filter((k) => !env[k]);
  if (missing.length) throw new ConfigError(`Missing configuration: ${missing.join(', ')}`);
  const revealDelaySeconds = Number(env.REVEAL_DELAY_SECONDS ?? 20);
  if (!Number.isFinite(revealDelaySeconds) || revealDelaySeconds < 0) {
    throw new ConfigError('REVEAL_DELAY_SECONDS must be a number >= 0');
  }
  return {
    members: parseMembers(env.FAMILY_MEMBERS),
    notionToken: env.NOTION_TOKEN,
    notionVersion: env.NOTION_VERSION || '2026-03-11',
    notionApiBase: env.NOTION_API_BASE || 'https://api.notion.com/v1',
    submissionsDb: parseNotionId(env.NOTION_SUBMISSIONS_DB),
    roundsDb: parseNotionId(env.NOTION_ROUNDS_DB),
    formUrl: env.NOTION_FORM_URL || '',
    revealDelayMs: revealDelaySeconds * 1000,
  };
}
