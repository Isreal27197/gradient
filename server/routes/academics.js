import express from 'express';
import { z } from 'zod';
import db from '../lib/db.js';
import { requireAuth } from '../lib/auth.js';
import { assertOwned, loadStructure, getUserScale } from '../lib/academics.js';

const router = express.Router();
router.use(requireAuth);

/* ------------------------------------------------------------------ profile */

const profileSchema = z.object({
  full_name: z.string().trim().max(120).optional(),
  matric_number: z.string().trim().max(60).optional(),
  university: z.string().trim().max(160).optional(),
  faculty: z.string().trim().max(160).optional(),
  department: z.string().trim().max(160).optional(),
  programme: z.string().trim().max(160).optional(),
  level: z.string().trim().max(40).optional(),
  entry_year: z.coerce.number().int().min(1900).max(2200).nullable().optional(),
  scale_id: z.coerce.number().int().positive().optional(),
});

router.get('/profile', (req, res) => {
  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.user.id);
  res.json({ profile });
});

router.put('/profile', (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const fields = parsed.data;
  if (fields.scale_id) {
    const ok = db
      .prepare('SELECT id FROM grading_scales WHERE id = ? AND (is_system = 1 OR user_id = ?)')
      .get(fields.scale_id, req.user.id);
    if (!ok) return res.status(400).json({ error: 'Unknown grading scale' });
  }

  const keys = Object.keys(fields);
  if (keys.length) {
    const setters = keys.map((k) => `${k} = @${k}`).join(', ');
    db.prepare(`UPDATE profiles SET ${setters}, updated_at = datetime('now') WHERE user_id = @user_id`)
      .run({ ...fields, user_id: req.user.id });
  }
  res.json({ profile: db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.user.id) });
});

/* ------------------------------------------------------------------- scales */

router.get('/scales', (req, res) => {
  const scales = db
    .prepare('SELECT * FROM grading_scales WHERE is_system = 1 OR user_id = ? ORDER BY is_system DESC, id')
    .all(req.user.id);
  const withGrades = scales.map((s) => ({
    ...s,
    grades: db.prepare('SELECT * FROM grade_points WHERE scale_id = ? ORDER BY position, points DESC').all(s.id),
  }));
  res.json({ scales: withGrades, active: getUserScale(req.user.id).scale.id });
});

/* ----------------------------------------------------------------- structure */

router.get('/structure', (req, res) => {
  res.json({ sessions: loadStructure(req.user.id) });
});

/* ------------------------------------------------------------------ sessions */

const sessionSchema = z.object({
  name: z.string().trim().min(4, 'Session name is required').max(40),
  start_year: z.coerce.number().int().min(1900).max(2200).nullable().optional(),
  position: z.coerce.number().int().optional(),
});

router.post('/sessions', (req, res) => {
  const parsed = sessionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { name } = parsed.data;
  const dup = db.prepare('SELECT id FROM sessions WHERE user_id = ? AND name = ?').get(req.user.id, name);
  if (dup) return res.status(409).json({ error: `Session "${name}" already exists` });

  const startYear = parsed.data.start_year ?? (parseInt(String(name).slice(0, 4), 10) || null);
  const nextPos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 p FROM sessions WHERE user_id = ?').get(req.user.id).p;
  const { lastInsertRowid } = db
    .prepare('INSERT INTO sessions (user_id, name, start_year, position) VALUES (?, ?, ?, ?)')
    .run(req.user.id, name, startYear, parsed.data.position ?? nextPos);

  res.status(201).json({ session: db.prepare('SELECT * FROM sessions WHERE id = ?').get(lastInsertRowid) });
});

router.put('/sessions/:id', (req, res) => {
  assertOwned('sessions', req.params.id, req.user.id);
  const parsed = sessionSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const keys = Object.keys(parsed.data);
  if (keys.length) {
    db.prepare(`UPDATE sessions SET ${keys.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id AND user_id = @uid`)
      .run({ ...parsed.data, id: req.params.id, uid: req.user.id });
  }
  res.json({ session: db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id) });
});

router.delete('/sessions/:id', (req, res) => {
  assertOwned('sessions', req.params.id, req.user.id);
  db.prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

/* ----------------------------------------------------------------- semesters */

const semesterSchema = z.object({
  session_id: z.coerce.number().int().positive(),
  name: z.string().trim().min(1, 'Semester name is required').max(40),
  level: z.string().trim().max(40).optional(),
  position: z.coerce.number().int().optional(),
});

router.post('/semesters', (req, res) => {
  const parsed = semesterSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  assertOwned('sessions', parsed.data.session_id, req.user.id);

  const dup = db
    .prepare('SELECT id FROM semesters WHERE user_id = ? AND session_id = ? AND name = ?')
    .get(req.user.id, parsed.data.session_id, parsed.data.name);
  if (dup) return res.status(409).json({ error: `That session already has a "${parsed.data.name}"` });

  const nextPos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 p FROM semesters WHERE user_id = ?').get(req.user.id).p;
  const { lastInsertRowid } = db
    .prepare('INSERT INTO semesters (user_id, session_id, name, level, position) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, parsed.data.session_id, parsed.data.name, parsed.data.level || '', parsed.data.position ?? nextPos);

  res.status(201).json({ semester: db.prepare('SELECT * FROM semesters WHERE id = ?').get(lastInsertRowid) });
});

router.put('/semesters/:id', (req, res) => {
  assertOwned('semesters', req.params.id, req.user.id);
  const parsed = semesterSchema.partial().omit({ session_id: true }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const keys = Object.keys(parsed.data);
  if (keys.length) {
    db.prepare(`UPDATE semesters SET ${keys.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id AND user_id = @uid`)
      .run({ ...parsed.data, id: req.params.id, uid: req.user.id });
  }
  res.json({ semester: db.prepare('SELECT * FROM semesters WHERE id = ?').get(req.params.id) });
});

router.delete('/semesters/:id', (req, res) => {
  assertOwned('semesters', req.params.id, req.user.id);
  db.prepare('DELETE FROM semesters WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------- courses */

const courseSchema = z.object({
  semester_id: z.coerce.number().int().positive(),
  code: z.string().trim().min(2, 'Course code is required').max(24),
  title: z.string().trim().max(180).optional(),
  unit: z.coerce.number().min(0.5, 'Units must be at least 0.5').max(24),
  grade: z.string().trim().max(4).nullable().optional(),
  score: z.coerce.number().min(0).max(100).nullable().optional(),
  status: z.enum(['completed', 'ongoing', 'planned']).optional(),
  is_carryover: z.coerce.boolean().optional(),
});

/** Validate the grade against the user's active scale before writing. */
function validateGrade(userId, grade) {
  if (grade == null || grade === '') return null;
  const { scaleMap } = getUserScale(userId);
  const letter = String(grade).toUpperCase();
  if (!scaleMap.has(letter)) {
    const err = new Error(`"${grade}" is not a valid grade on your grading scale`);
    err.status = 400;
    throw err;
  }
  return letter;
}

router.post('/courses', (req, res) => {
  const parsed = courseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  assertOwned('semesters', parsed.data.semester_id, req.user.id);

  const d = parsed.data;
  const grade = validateGrade(req.user.id, d.grade);
  const status = d.status || (grade ? 'completed' : 'ongoing');

  const { lastInsertRowid } = db
    .prepare(`INSERT INTO courses (user_id, semester_id, code, title, unit, grade, score, status, is_carryover)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(req.user.id, d.semester_id, d.code.toUpperCase(), d.title || '', d.unit, grade,
         d.score ?? null, status, d.is_carryover ? 1 : 0);

  res.status(201).json({ course: db.prepare('SELECT * FROM courses WHERE id = ?').get(lastInsertRowid) });
});

/** Bulk insert — used by the "add several courses at once" flow. */
router.post('/courses/bulk', (req, res) => {
  const schema = z.object({
    semester_id: z.coerce.number().int().positive(),
    courses: z.array(courseSchema.omit({ semester_id: true })).min(1).max(60),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  assertOwned('semesters', parsed.data.semester_id, req.user.id);

  const stmt = db.prepare(`INSERT INTO courses (user_id, semester_id, code, title, unit, grade, score, status, is_carryover)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertAll = db.transaction((rows) => {
    for (const d of rows) {
      const grade = validateGrade(req.user.id, d.grade);
      stmt.run(req.user.id, parsed.data.semester_id, d.code.toUpperCase(), d.title || '', d.unit,
               grade, d.score ?? null, d.status || (grade ? 'completed' : 'ongoing'), d.is_carryover ? 1 : 0);
    }
  });
  insertAll(parsed.data.courses);

  res.status(201).json({
    courses: db.prepare('SELECT * FROM courses WHERE semester_id = ? AND user_id = ? ORDER BY id')
      .all(parsed.data.semester_id, req.user.id),
  });
});

router.put('/courses/:id', (req, res) => {
  assertOwned('courses', req.params.id, req.user.id);
  const parsed = courseSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const d = { ...parsed.data };
  if ('semester_id' in d) assertOwned('semesters', d.semester_id, req.user.id);
  if ('grade' in d) d.grade = validateGrade(req.user.id, d.grade);
  if ('code' in d && d.code) d.code = d.code.toUpperCase();
  if ('is_carryover' in d) d.is_carryover = d.is_carryover ? 1 : 0;

  const keys = Object.keys(d);
  if (keys.length) {
    db.prepare(`UPDATE courses SET ${keys.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id AND user_id = @uid`)
      .run({ ...d, id: req.params.id, uid: req.user.id });
  }
  res.json({ course: db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.id) });
});

router.delete('/courses/:id', (req, res) => {
  assertOwned('courses', req.params.id, req.user.id);
  db.prepare('DELETE FROM courses WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

export default router;
