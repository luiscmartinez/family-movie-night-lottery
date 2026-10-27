// Reads and validates the Worker environment (dashboard variables + secrets).

export const FAMILY_SIZE = 9;
export const MAX_TITLE_LENGTH = 120;
export const MIN_ADMIN_PASSWORD_LENGTH = 12;

export class ConfigError extends Error {}

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
  return { members: parseMembers(env.FAMILY_MEMBERS) };
}

// The admin password is checked separately so the public page keeps working
// even before one is configured.
export function adminPassword(env) {
  const password = env.ADMIN_PASSWORD ?? '';
  if (password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    throw new ConfigError(
      `ADMIN_PASSWORD must be set as a secret with at least ${MIN_ADMIN_PASSWORD_LENGTH} characters.`,
    );
  }
  return password;
}
