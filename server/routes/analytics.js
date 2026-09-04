import express from 'express';
import { z } from 'zod';
import db from '../lib/db.js';
import { requireAuth } from '../lib/auth.js';
import { fullAnalysis, getUserScale, loadStructure } from '../lib/academics.js';
import { aggregate, computeTimeline, classify, requiredAverage, round2 } from '../lib/gpa.js';

const router = express.Router();
router.use(requireAuth);

/** Everything the dashboard needs, in one round trip. */
router.get('/analysis', (req, res) => {
  res.json(fullAnalysis(req.user.id));
});

/**
 * What-if simulator.
 * Accepts hypothetical courses plus optional grade overrides for existing
 * courses, then recomputes the whole timeline without persisting anything.
 */
const simulateSchema = z.object({
  hypothetical: z.array(z.object({
    code: z.string().trim().max(24).optional(),
    unit: z.coerce.number().min(0.5).max(24),
    grade: z.string().trim().max(4),
  })).max(60).optional(),
  overrides: z.record(z.string(), z.string().trim().max(4)).optional(),
  includeOutstanding: z.boolean().optional(),
});

router.post('/simulate', (req, res) => {
  const parsed = simulateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { scaleMap, maxPoint } = getUserScale(req.user.id);
  const sessions = loadStructure(req.user.id);
  const baseline = computeTimeline(sessions, scaleMap);

  const overrides = parsed.data.overrides || {};
  const projected = sessions.map((s) => ({
    ...s,
    semesters: s.semesters.map((m) => ({
      ...m,
      courses: m.courses.map((c) => {
        const override = overrides[String(c.id)];
        if (!override) return c;
        return { ...c, grade: override.toUpperCase(), status: 'completed' };
      }),
    })),
  }));

  const projectedTimeline = computeTimeline(projected, scaleMap);

  // Hypothetical courses form a virtual future semester appended to the record.
  const hypothetical = (parsed.data.hypothetical || []).map((h, i) => ({
    id: `hyp-${i}`,
    code: h.code || `NEW${i + 1}`,
    unit: h.unit,
    grade: String(h.grade).toUpperCase(),
    status: 'completed',
  }));
  const invalid = hypothetical.filter((h) => !scaleMap.has(h.grade));
  if (invalid.length) {
    return res.status(400).json({ error: `Unknown grade "${invalid[0].grade}" for your grading scale` });
  }

  const hypAgg = aggregate(hypothetical, scaleMap);
  const totalUnits = projectedTimeline.totalUnits + hypAgg.units;
  const totalQp = projectedTimeline.totalQualityPoints + hypAgg.qualityPoints;
  const finalCgpa = totalUnits > 0 ? round2(totalQp / totalUnits) : 0;

  res.json({
    baseline: {
      cgpa: baseline.cgpa,
      units: baseline.totalUnits,
      classification: classify(baseline.cgpa, maxPoint),
    },
    projected: {
      cgpa: finalCgpa,
      units: totalUnits,
      qualityPoints: round2(totalQp),
      classification: classify(finalCgpa, maxPoint),
      semesterGpa: round2(hypAgg.gpa),
      semesterUnits: hypAgg.units,
    },
    delta: round2(finalCgpa - baseline.cgpa),
    maxPoint,
  });
});

/**
 * "What do I need from here?" — required average per unit for a target CGPA
 * across a caller-supplied number of remaining units.
 */
router.post('/target', (req, res) => {
  const schema = z.object({
    target: z.coerce.number().min(0).max(5),
    remainingUnits: z.coerce.number().min(1).max(400),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { scaleMap, maxPoint, gradePoints } = getUserScale(req.user.id);
  const timeline = computeTimeline(loadStructure(req.user.id), scaleMap);
  const { target, remainingUnits } = parsed.data;

  const result = requiredAverage({
    target,
    earnedUnits: timeline.totalUnits,
    qualityPoints: timeline.totalQualityPoints,
    remainingUnits,
    maxPoint,
  });

  // Translate the abstract "required average" into concrete grade language.
  let equivalent = null;
  if (result.possible && result.required != null) {
    const sorted = [...gradePoints].sort((a, b) => a.points - b.points);
    const above = sorted.find((g) => g.points >= result.required - 1e-9);
    equivalent = above ? { letter: above.letter, points: above.points } : null;
  }

  res.json({
    target,
    remainingUnits,
    current: { cgpa: timeline.cgpa, units: timeline.totalUnits, qualityPoints: timeline.totalQualityPoints },
    maxPoint,
    equivalent,
    ...result,
  });
});

/* --------------------------------------------------------------------- goals */

const goalSchema = z.object({
  title: z.string().trim().min(2, 'Give the goal a name').max(120),
  target_cgpa: z.coerce.number().min(0).max(5),
  target_date: z.string().trim().max(40).nullable().optional(),
  notes: z.string().trim().max(1000).optional(),
  achieved: z.coerce.boolean().optional(),
});

router.get('/goals', (req, res) => {
  res.json({ goals: db.prepare('SELECT * FROM goals WHERE user_id = ? ORDER BY achieved, target_cgpa DESC').all(req.user.id) });
});

router.post('/goals', (req, res) => {
  const parsed = goalSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;
  const { lastInsertRowid } = db
    .prepare('INSERT INTO goals (user_id, title, target_cgpa, target_date, notes) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, d.title, d.target_cgpa, d.target_date || null, d.notes || '');
  res.status(201).json({ goal: db.prepare('SELECT * FROM goals WHERE id = ?').get(lastInsertRowid) });
});

router.put('/goals/:id', (req, res) => {
  const owned = db.prepare('SELECT id FROM goals WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!owned) return res.status(404).json({ error: 'Goal not found' });

  const parsed = goalSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = { ...parsed.data };
  if ('achieved' in d) d.achieved = d.achieved ? 1 : 0;
  const keys = Object.keys(d);
  if (keys.length) {
    db.prepare(`UPDATE goals SET ${keys.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id AND user_id = @uid`)
      .run({ ...d, id: req.params.id, uid: req.user.id });
  }
  res.json({ goal: db.prepare('SELECT * FROM goals WHERE id = ?').get(req.params.id) });
});

router.delete('/goals/:id', (req, res) => {
  db.prepare('DELETE FROM goals WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

export default router;
