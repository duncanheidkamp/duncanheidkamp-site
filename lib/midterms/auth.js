// ============================================================
// auth.js — PIN hashing and session tokens.
//
// This is "keep friends honest" security, not bank security: a 4-digit
// PIN only has 10,000 possibilities. We still hash it (scrypt + salt)
// so the raw PIN never sits in the database.
//
// Sessions: on sign-in the server makes a random token, stores only its
// SHA-256 hash, and hands the raw token to the browser (localStorage).
// A player can be signed in on a few devices at once (we keep 5 hashes).
// ============================================================

import { scryptSync, randomBytes, createHash, timingSafeEqual } from 'node:crypto';

export function hashPin(pin) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(pin, salt, 32).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPin(pin, stored) {
  const [, salt, hash] = String(stored || '').split('$');
  if (!salt || !hash) return false;
  const attempt = scryptSync(pin, salt, 32);
  return timingSafeEqual(attempt, Buffer.from(hash, 'hex'));
}

export function newSessionToken() {
  return randomBytes(24).toString('hex');
}

export function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

/** Keep the newest few session hashes so old devices eventually expire. */
export function addSessionHash(existing, tokenHash, keep = 5) {
  return [tokenHash, ...(existing || []).filter((h) => h !== tokenHash)].slice(0, keep);
}

/** Constant-time string compare for the admin passcode. */
export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Parse "Authorization: Bearer <playerId>.<token>".
 * @returns {{playerId:string, token:string} | null}
 */
export function readSession(req) {
  const h = req.headers.authorization || req.headers.Authorization || '';
  const m = /^Bearer\s+([0-9a-f-]{36})\.([0-9a-f]{48})$/i.exec(h);
  return m ? { playerId: m[1], token: m[2] } : null;
}
