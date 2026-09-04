import express from 'express';
import { z } from 'zod';
import db, { defaultScaleId } from '../lib/db.js';
import { hashPassword, verifyPassword, signToken, requireAuth, cookieOptions, COOKIE_NAME } from '../lib/auth.js';

const router = express.Router();

const credentials = z.object({
  email: z.string().trim().email('Enter a valid email address').max(180),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
});

const signupSchema = credentials.extend({
  fullName: z.string().trim().min(2, 'Enter your full name').max(120),
});

router.post('/signup', (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message, issues: parsed.error.issues });
  }
  const { email, password, fullName } = parsed.data;

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'An account with that email already exists' });

  const created = db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
      .run(email, hashPassword(password));
    db.prepare('INSERT INTO profiles (user_id, full_name, scale_id) VALUES (?, ?, ?)')
      .run(lastInsertRowid, fullName, defaultScaleId());
    return db.prepare('SELECT id, email, created_at FROM users WHERE id = ?').get(lastInsertRowid);
  })();

  res.cookie(COOKIE_NAME, signToken(created), cookieOptions());
  res.status(201).json({ user: created });
});

router.post('/login', (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { email, password } = parsed.data;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  // Same message either way so the endpoint cannot be used to enumerate accounts.
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Incorrect email or password' });
  }

  res.cookie(COOKIE_NAME, signToken(user), cookieOptions());
  res.json({ user: { id: user.id, email: user.email, created_at: user.created_at } });
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.user.id);
  res.json({ user: req.user, profile });
});

router.post('/change-password', requireAuth, (req, res) => {
  const schema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8, 'New password must be at least 8 characters').max(200),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(parsed.data.currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .run(hashPassword(parsed.data.newPassword), req.user.id);
  res.json({ ok: true });
});

export default router;
