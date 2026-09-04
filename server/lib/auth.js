import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');

/**
 * Secret resolution order: environment variable, then a locally persisted
 * random secret. Persisting it means sessions survive a server restart while
 * never shipping a hard-coded default.
 */
function resolveSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const file = path.join(DATA_DIR, '.jwt-secret');
  try {
    if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  } catch { /* fall through */ }
  const secret = crypto.randomBytes(48).toString('hex');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

const SECRET = resolveSecret();
const TOKEN_TTL = '30d';
export const COOKIE_NAME = 'gradient_token';

export const hashPassword = (plain) => bcrypt.hashSync(plain, 12);
export const verifyPassword = (plain, hash) => bcrypt.compareSync(plain, hash);
export const signToken = (user) => jwt.sign({ uid: user.id, email: user.email }, SECRET, { expiresIn: TOKEN_TTL });

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // preview runs behind a proxy that terminates TLS
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  };
}

/** Express middleware: rejects anonymous requests and attaches req.user. */
export function requireAuth(req, res, next) {
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  const token = req.cookies?.[COOKIE_NAME] || bearer;
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const payload = jwt.verify(token, SECRET);
    const user = db.prepare('SELECT id, email, created_at FROM users WHERE id = ?').get(payload.uid);
    if (!user) return res.status(401).json({ error: 'Account no longer exists' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired, please sign in again' });
  }
}
