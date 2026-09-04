import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'gradient.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * Schema. Every user-owned row carries user_id so authorisation checks are a
 * single indexed predicate rather than a join chain.
 */
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name     TEXT NOT NULL DEFAULT '',
  matric_number TEXT NOT NULL DEFAULT '',
  university    TEXT NOT NULL DEFAULT '',
  faculty       TEXT NOT NULL DEFAULT '',
  department    TEXT NOT NULL DEFAULT '',
  programme     TEXT NOT NULL DEFAULT '',
  level         TEXT NOT NULL DEFAULT '',
  entry_year    INTEGER,
  scale_id      INTEGER REFERENCES grading_scales(id),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Grading scales are first-class so other universities / 4.0 systems can be
-- added later without touching the calculation engine.
CREATE TABLE IF NOT EXISTS grading_scales (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  max_point  REAL NOT NULL,
  is_system  INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS grade_points (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  scale_id  INTEGER NOT NULL REFERENCES grading_scales(id) ON DELETE CASCADE,
  letter    TEXT NOT NULL,
  points    REAL NOT NULL,
  min_score REAL,
  max_score REAL,
  is_pass   INTEGER NOT NULL DEFAULT 1,
  position  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  start_year INTEGER,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS semesters (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  level      TEXT NOT NULL DEFAULT '',
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS courses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  semester_id INTEGER NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  title       TEXT NOT NULL DEFAULT '',
  unit        REAL NOT NULL,
  grade       TEXT,
  score       REAL,
  status      TEXT NOT NULL DEFAULT 'completed', -- completed | ongoing | planned
  is_carryover INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS goals (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  target_cgpa  REAL NOT NULL,
  target_date  TEXT,
  notes        TEXT NOT NULL DEFAULT '',
  achieved     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_user   ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_semesters_user  ON semesters(user_id, session_id);
CREATE INDEX IF NOT EXISTS idx_courses_user    ON courses(user_id, semester_id);
CREATE INDEX IF NOT EXISTS idx_goals_user      ON goals(user_id);
CREATE INDEX IF NOT EXISTS idx_gradepts_scale  ON grade_points(scale_id);
`);

/** Seed the built-in grading scales once. */
function seedSystemScales() {
  const existing = db.prepare(`SELECT COUNT(*) c FROM grading_scales WHERE is_system = 1`).get().c;
  if (existing > 0) return;

  const insertScale = db.prepare(
    `INSERT INTO grading_scales (user_id, name, max_point, is_system) VALUES (NULL, ?, ?, 1)`
  );
  const insertGrade = db.prepare(
    `INSERT INTO grade_points (scale_id, letter, points, min_score, max_score, is_pass, position)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  const scales = [
    {
      name: 'Nigerian 5.0 Scale',
      max: 5.0,
      grades: [
        ['A', 5, 70, 100, 1],
        ['B', 4, 60, 69.99, 1],
        ['C', 3, 50, 59.99, 1],
        ['D', 2, 45, 49.99, 1],
        ['E', 1, 40, 44.99, 1],
        ['F', 0, 0, 39.99, 0],
      ],
    },
    {
      name: 'Standard 4.0 Scale',
      max: 4.0,
      grades: [
        ['A', 4, 70, 100, 1],
        ['B', 3, 60, 69.99, 1],
        ['C', 2, 50, 59.99, 1],
        ['D', 1, 45, 49.99, 1],
        ['F', 0, 0, 44.99, 0],
      ],
    },
  ];

  db.transaction(() => {
    for (const s of scales) {
      const { lastInsertRowid } = insertScale.run(s.name, s.max);
      s.grades.forEach((g, i) => insertGrade.run(lastInsertRowid, g[0], g[1], g[2], g[3], g[4], i));
    }
  })();
}
seedSystemScales();

export const defaultScaleId = () =>
  db.prepare(`SELECT id FROM grading_scales WHERE is_system = 1 ORDER BY id LIMIT 1`).get().id;

export default db;
