import db from './db.js';
import { buildScaleMap, analyse } from './gpa.js';

/** Resolve the grading scale a user is on, falling back to the system default. */
export function getUserScale(userId) {
  const profile = db.prepare('SELECT scale_id FROM profiles WHERE user_id = ?').get(userId);
  let scaleId = profile?.scale_id;
  if (!scaleId) {
    scaleId = db.prepare('SELECT id FROM grading_scales WHERE is_system = 1 ORDER BY id LIMIT 1').get().id;
  }
  const scale = db.prepare('SELECT * FROM grading_scales WHERE id = ?').get(scaleId);
  const gradePoints = db
    .prepare('SELECT * FROM grade_points WHERE scale_id = ? ORDER BY position, points DESC')
    .all(scaleId);
  return { scale, gradePoints, scaleMap: buildScaleMap(gradePoints), maxPoint: Number(scale.max_point) };
}

/** Load the full nested academic structure for a user, ordered chronologically. */
export function loadStructure(userId) {
  const sessions = db
    .prepare('SELECT * FROM sessions WHERE user_id = ? ORDER BY position, start_year, id')
    .all(userId);
  const semesters = db
    .prepare('SELECT * FROM semesters WHERE user_id = ? ORDER BY position, id')
    .all(userId);
  const courses = db
    .prepare('SELECT * FROM courses WHERE user_id = ? ORDER BY id')
    .all(userId);

  const coursesBySem = new Map();
  for (const c of courses) {
    if (!coursesBySem.has(c.semester_id)) coursesBySem.set(c.semester_id, []);
    coursesBySem.get(c.semester_id).push(c);
  }
  const semsBySession = new Map();
  for (const s of semesters) {
    if (!semsBySession.has(s.session_id)) semsBySession.set(s.session_id, []);
    semsBySession.get(s.session_id).push({ ...s, courses: coursesBySem.get(s.id) || [] });
  }
  return sessions.map((s) => ({ ...s, semesters: semsBySession.get(s.id) || [] }));
}

export function getGoals(userId) {
  return db.prepare('SELECT * FROM goals WHERE user_id = ? ORDER BY achieved, target_cgpa DESC, id').all(userId);
}

/** One call that produces everything the dashboard and analytics pages need. */
export function fullAnalysis(userId) {
  const { scale, gradePoints, scaleMap, maxPoint } = getUserScale(userId);
  const sessions = loadStructure(userId);
  const goals = getGoals(userId);
  const analysis = analyse({ sessions, scaleMap, maxPoint, goals });
  return { scale, gradePoints, maxPoint, sessions, goals, ...analysis };
}

/** Ownership guard used by every mutating route. */
export function assertOwned(table, id, userId) {
  const row = db.prepare(`SELECT id FROM ${table} WHERE id = ? AND user_id = ?`).get(id, userId);
  if (!row) {
    const err = new Error('Not found');
    err.status = 404;
    throw err;
  }
  return true;
}
