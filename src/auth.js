// Admin authentication: a single shared token (ADMIN_TOKEN secret) sent as a
// Bearer header, compared in constant time.

async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

export const MIN_ADMIN_TOKEN_LENGTH = 16;

export async function isAdmin(request, env) {
  const expected = env.ADMIN_TOKEN ?? '';
  if (expected.length < MIN_ADMIN_TOKEN_LENGTH) return false; // admin disabled until a strong token is set
  const header = request.headers.get('Authorization') ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice(7) : '';
  const [a, b] = await Promise.all([sha256(presented), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
