import express from 'express';
import PDFDocument from 'pdfkit';
import db from '../lib/db.js';
import { requireAuth } from '../lib/auth.js';
import { getUserScale, loadStructure, fullAnalysis } from '../lib/academics.js';
import { computeTimeline, aggregate, isGraded, gradeInfo, classify, round2 } from '../lib/gpa.js';

const router = express.Router();
router.use(requireAuth);

const INK = '#101828';
const MUTED = '#667085';
const LINE = '#D8DEE9';
const ACCENT = '#1B4DFF';

/* ------------------------------------------------------------------- helpers */

function safeFilename(str, fallback) {
  const cleaned = String(str || '').trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/* --------------------------------------------------------------- CSV export */

router.get('/csv', (req, res) => {
  const { scaleMap } = getUserScale(req.user.id);
  const sessions = loadStructure(req.user.id);
  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.user.id);

  const rows = [[
    'Session', 'Semester', 'Level', 'Course Code', 'Course Title', 'Units',
    'Grade', 'Score', 'Grade Point', 'Quality Points', 'Status', 'Carryover',
  ]];

  for (const s of sessions) {
    for (const m of s.semesters) {
      for (const c of m.courses) {
        const info = isGraded(c, scaleMap) ? gradeInfo(c, scaleMap) : null;
        rows.push([
          s.name, m.name, m.level, c.code, c.title, c.unit,
          c.grade || '', c.score ?? '', info ? info.points : '',
          info ? round2(info.points * c.unit) : '', c.status, c.is_carryover ? 'Yes' : 'No',
        ]);
      }
    }
  }

  // Summary block appended below the raw records.
  const timeline = computeTimeline(sessions, scaleMap);
  rows.push([]);
  rows.push(['SEMESTER SUMMARY']);
  rows.push(['Session', 'Semester', 'Units', 'GPA', 'Cumulative Units', 'CGPA']);
  for (const sem of timeline.semesters) {
    rows.push([sem.sessionName, sem.semesterName, sem.units, sem.gpa.toFixed(2), sem.cumulativeUnits, sem.cgpa.toFixed(2)]);
  }
  rows.push([]);
  rows.push(['Total Units', timeline.totalUnits]);
  rows.push(['Total Quality Points', timeline.totalQualityPoints]);
  rows.push(['CGPA', timeline.cgpa.toFixed(2)]);

  const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\n');
  const name = safeFilename(profile?.full_name, 'academic') + '-records.csv';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send('\uFEFF' + csv);
});

/* -------------------------------------------------------------- JSON backup */

router.get('/json', (req, res) => {
  const data = fullAnalysis(req.user.id);
  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.user.id);
  const name = safeFilename(profile?.full_name, 'academic') + '-backup.json';
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(JSON.stringify({
    exportedAt: new Date().toISOString(),
    profile,
    scale: data.scale,
    sessions: data.sessions,
    goals: data.goals,
    summary: { cgpa: data.cgpa, totalUnits: data.totalUnits, classification: data.classification },
  }, null, 2));
});

/* ---------------------------------------------------------- PDF transcript */

router.get('/transcript.pdf', (req, res) => {
  const { scale, scaleMap, maxPoint } = getUserScale(req.user.id);
  const sessions = loadStructure(req.user.id);
  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.user.id) || {};
  const timeline = computeTimeline(sessions, scaleMap);
  const cls = classify(timeline.cgpa, maxPoint);

  const doc = new PDFDocument({ size: 'A4', margin: 45, bufferPages: true });
  const filename = safeFilename(profile.full_name, 'academic') + '-transcript.pdf';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);

  const M = 45;
  const W = doc.page.width - M * 2;
  const BOTTOM = doc.page.height - 62;

  /* ---- header ---- */
  doc.rect(M, M, W, 4).fill(ACCENT);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(19)
    .text('ACADEMIC TRANSCRIPT', M, M + 20);
  doc.font('Helvetica').fontSize(9.5).fillColor(MUTED)
    .text((profile.university || 'Personal Academic Record').toUpperCase(), M, doc.y + 2);

  const issued = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  doc.fontSize(8.5).fillColor(MUTED)
    .text(`Issued ${issued}`, M, M + 24, { width: W, align: 'right' })
    .text('Unofficial · student-maintained record', M, doc.y + 1, { width: W, align: 'right' });

  doc.moveDown(1.4);

  /* ---- student details ---- */
  const detailTop = doc.y + 6;
  const details = [
    ['Student Name', profile.full_name || '—'],
    ['Matriculation No.', profile.matric_number || '—'],
    ['Programme', profile.programme || '—'],
    ['Department', profile.department || '—'],
    ['Faculty', profile.faculty || '—'],
    ['Current Level', profile.level || '—'],
    ['Year of Entry', profile.entry_year || '—'],
    ['Grading Scale', `${scale.name} (max ${Number(scale.max_point).toFixed(1)})`],
  ];

  const rowsPerCol = Math.ceil(details.length / 2);
  const colW = W / 2;
  const boxH = rowsPerCol * 20 + 16;
  doc.roundedRect(M, detailTop, W, boxH, 4).fillAndStroke('#F8FAFC', LINE);

  details.forEach((d, i) => {
    const col = Math.floor(i / rowsPerCol);
    const row = i % rowsPerCol;
    const x = M + 12 + col * colW;
    const y = detailTop + 12 + row * 20;
    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(String(d[0]).toUpperCase(), x, y);
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK)
      .text(String(d[1]), x, y + 8.5, { width: colW - 24, ellipsis: true, lineBreak: false });
  });

  doc.y = detailTop + boxH + 18;

  /* ---- table plumbing ---- */
  const cols = [
    { key: 'code',  label: 'CODE',  w: 68,  align: 'left' },
    { key: 'title', label: 'COURSE TITLE', w: W - 68 - 42 - 46 - 44 - 52, align: 'left' },
    { key: 'unit',  label: 'UNITS', w: 42, align: 'center' },
    { key: 'grade', label: 'GRADE', w: 46, align: 'center' },
    { key: 'point', label: 'POINT', w: 44, align: 'center' },
    { key: 'qp',    label: 'QP',    w: 52, align: 'right' },
  ];

  function ensureSpace(needed) {
    if (doc.y + needed > BOTTOM) {
      doc.addPage();
      doc.y = M;
      return true;
    }
    return false;
  }

  function drawTableHead() {
    const y = doc.y;
    doc.rect(M, y, W, 18).fill('#EEF2FF');
    let x = M + 8;
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#3538CD');
    for (const c of cols) {
      doc.text(c.label, x, y + 5.5, { width: c.w - 10, align: c.align });
      x += c.w;
    }
    doc.y = y + 18;
  }

  function drawRow(values, opts = {}) {
    const y = doc.y;
    const h = opts.height || 17;
    if (opts.zebra) doc.rect(M, y, W, h).fill('#FCFCFD');
    let x = M + 8;
    doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5)
      .fillColor(opts.color || INK);
    cols.forEach((c) => {
      const v = values[c.key] ?? '';
      doc.text(String(v), x, y + 4.5, { width: c.w - 10, align: c.align, ellipsis: true, lineBreak: false });
      x += c.w;
    });
    doc.y = y + h;
  }

  /* ---- body ---- */
  if (timeline.semesters.length === 0) {
    doc.font('Helvetica').fontSize(10).fillColor(MUTED)
      .text('No academic records have been entered yet.', M, doc.y + 10);
  }

  for (const session of sessions) {
    if (!session.semesters.length) continue;
    ensureSpace(90);

    doc.rect(M, doc.y, W, 20).fill(INK);
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#FFFFFF')
      .text(`ACADEMIC SESSION  ${session.name}`, M + 10, doc.y + 6);
    doc.y += 20;
    doc.moveDown(0.5);

    for (const sem of session.semesters) {
      ensureSpace(80);
      const semStats = aggregate(sem.courses, scaleMap);
      const row = timeline.semesters.find((s) => s.semesterId === sem.id);

      doc.font('Helvetica-Bold').fontSize(9).fillColor(INK)
        .text(`${sem.name}${sem.level ? `  ·  ${sem.level}` : ''}`, M, doc.y + 2);
      doc.y += 4;
      drawTableHead();

      sem.courses.forEach((c, i) => {
        if (ensureSpace(24)) drawTableHead();
        const graded = isGraded(c, scaleMap);
        const info = graded ? gradeInfo(c, scaleMap) : null;
        const failing = info && !info.isPass;
        drawRow({
          code: c.code,
          title: c.title || '—',
          unit: Number(c.unit) % 1 === 0 ? Number(c.unit) : Number(c.unit).toFixed(1),
          grade: c.grade || (c.status === 'planned' ? 'PL' : c.status === 'ongoing' ? 'IP' : '—'),
          point: info ? info.points.toFixed(2) : '—',
          qp: info ? (info.points * Number(c.unit)).toFixed(2) : '—',
        }, { zebra: i % 2 === 1, color: failing ? '#B42318' : INK });
      });

      // Semester summary strip
      ensureSpace(26);
      const y = doc.y;
      doc.rect(M, y, W, 20).fill('#F2F4F7');
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(INK)
        .text(`Semester units: ${semStats.units}    GPA: ${round2(semStats.gpa).toFixed(2)}`, M + 8, y + 6);
      doc.text(
        `Cumulative units: ${row?.cumulativeUnits ?? 0}    CGPA: ${(row?.cgpa ?? 0).toFixed(2)}`,
        M, y + 6, { width: W - 10, align: 'right' }
      );
      doc.y = y + 20;
      doc.moveDown(0.9);
    }
    doc.moveDown(0.3);
  }

  /* ---- final summary ---- */
  ensureSpace(150); // summary box + grading key kept together
  doc.moveDown(0.35);
  const sy = doc.y;
  doc.roundedRect(M, sy, W, 84, 5).fillAndStroke('#F8FAFC', LINE);
  doc.rect(M, sy, 4, 84).fill(ACCENT);

  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text('CUMULATIVE SUMMARY', M + 16, sy + 12);

  const stats = [
    ['Total units earned', String(timeline.totalUnits)],
    ['Total quality points', timeline.totalQualityPoints.toFixed(2)],
    ['Semesters recorded', String(timeline.semesters.length)],
    ['Final CGPA', timeline.cgpa.toFixed(2)],
  ];
  const sw = (W - 32) / 4;
  stats.forEach((s, i) => {
    const x = M + 16 + i * sw;
    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(s[0].toUpperCase(), x, sy + 36);
    doc.font('Helvetica-Bold').fontSize(15).fillColor(i === 3 ? ACCENT : INK).text(s[1], x, sy + 47);
  });

  doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
    .text(`Degree classification: `, M + 16, sy + 68, { continued: true })
    .font('Helvetica-Bold').fillColor(INK).text(cls.label);

  doc.y = sy + 84;

  /* ---- grade key + footers ---- */
  doc.moveDown(0.9);
  const key = db.prepare('SELECT * FROM grade_points WHERE scale_id = ? ORDER BY points DESC').all(scale.id);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text('GRADING KEY', M, doc.y);
  doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(
    key.map((g) => `${g.letter} = ${Number(g.points).toFixed(1)}${g.min_score != null ? ` (${g.min_score}–${g.max_score})` : ''}`).join('    ·    '),
    M, doc.y + 3, { width: W }
  );
  doc.text('IP = in progress   ·   PL = planned', M, doc.y + 2, { width: W });

  // Footers sit inside the bottom margin, so the margin is temporarily lifted —
  // otherwise PDFKit treats each footer as overflow and appends a blank page.
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const originalBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    const fy = doc.page.height - 42;
    doc.moveTo(M, fy - 8).lineTo(M + W, fy - 8).lineWidth(0.5).strokeColor(LINE).stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED)
      .text(`${profile.full_name || 'Academic record'}${profile.matric_number ? `  ·  ${profile.matric_number}` : ''}`,
            M, fy, { lineBreak: false })
      .text(`Page ${i + 1} of ${range.count}`, M, fy, { width: W, align: 'right', lineBreak: false });

    doc.page.margins.bottom = originalBottom;
  }

  doc.end();
});

export default router;
