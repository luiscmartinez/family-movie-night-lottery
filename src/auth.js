// Admin authentication: one password (the ADMIN_PASSWORD secret), exchanged
// for a short-lived signed session cookie. Repeated failures lock out the
// sender's IP for a while.

const enc = new TextEncoder();

export const SESSION_COOKIE = '__Host-fmnl_admin';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const MAX_FAILURES = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

function equalBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// Constant-time comparison (both sides hashed to equal length first).
export async function passwordMatches(presented, expected) {
  const [a, b] = await Promise.all([sha256(String(presented ?? '')), sha256(expected)]);
  return equalBytes(a, b);
}

export function cookieValue(header, name = SESSION_COOKIE) {
  for (const part of (header ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return '';
}

export class AdminAuth {
  // `secret` is random per installation (stored in the database); mixing in
  // the password means changing the password logs every session out.
  constructor({ store, password, now = () => Date.now() }) {
    Object.assign(this, { store, password, now });
  }

  async key() {
    if (!this._key) {
      let secret = this.store.getMeta('session_secret');
      if (!secret) secret = this.store.initMeta('session_secret', b64url(crypto.getRandomValues(new Uint8Array(32))));
      const material = await sha256(`${secret}\u0000${this.password}`);
      this._key = await crypto.subtle.importKey('raw', material, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    }
    return this._key;
  }

  async sign(payload) {
    return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', await this.key(), enc.encode(payload))));
  }

  async createSession() {
    const expires = this.now() + SESSION_TTL_MS;
    const nonce = b64url(crypto.getRandomValues(new Uint8Array(16)));
    const payload = `${expires}.${nonce}`;
    return { token: `${payload}.${await this.sign(payload)}`, maxAge: SESSION_TTL_MS / 1000 };
  }

  async verifySession(token) {
    const parts = String(token ?? '').split('.');
    if (parts.length !== 3) return false;
    const [expires, nonce, sig] = parts;
    if (!(Number(expires) > this.now())) return false;
    return equalBytes(enc.encode(await this.sign(`${expires}.${nonce}`)), enc.encode(sig));
  }

  // Returns { ok, token?, maxAge?, error?, retryAfter? }.
  async login(presented, clientKey) {
    const key = `login:${clientKey}`;
    const now = this.now();
    if (this.store.count(key, now, LOCKOUT_MS) >= MAX_FAILURES) {
      return { ok: false, error: 'Too many attempts. Try again in 15 minutes.', retryAfter: LOCKOUT_MS / 1000 };
    }
    if (await passwordMatches(presented, this.password)) {
      this.store.clearCounter(key);
      return { ok: true, ...(await this.createSession()) };
    }
    const failures = this.store.hit(key, now, LOCKOUT_MS);
    const left = MAX_FAILURES - failures;
    return { ok: false, error: left > 0 ? `Wrong password. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many attempts. Try again in 15 minutes.' };
  }
}
