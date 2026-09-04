import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import authRoutes from './routes/auth.js';
import academicRoutes from './routes/academics.js';
import analyticsRoutes from './routes/analytics.js';
import exportRoutes from './routes/transcript.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Baseline hardening. No external origins are involved: the SPA and the API
// are served from the same origin, so no CORS surface is opened at all.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

/** Very small in-memory rate limiter for the auth endpoints. */
const attempts = new Map();
app.use('/api/auth', (req, res, next) => {
  if (req.method !== 'POST' || req.path === '/logout') return next();
  const key = `${req.ip}:${req.path}`;
  const now = Date.now();
  const win = attempts.get(key)?.filter((t) => now - t < 15 * 60 * 1000) || [];
  if (win.length >= 30) {
    return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });
  }
  win.push(now);
  attempts.set(key, win);
  next();
});

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'gradient', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api', academicRoutes);
app.use('/api', analyticsRoutes);
app.use('/api/export', exportRoutes);

app.use('/api', (req, res) => res.status(404).json({ error: 'Unknown endpoint' }));

// Central error handler — thrown ownership/validation errors land here.
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on our end' : err.message });
});

/* ------------------------------------------------- static SPA (built client) */
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
} else {
  app.get('*', (req, res) =>
    res.status(503).send('<h1>Client not built</h1><p>Run <code>npm run build</code> first.</p>'));
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Gradient running on http://0.0.0.0:${PORT}`);
});
