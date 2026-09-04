import { useState, useMemo } from 'react';
import { useData } from '../lib/store.jsx';
import { api, fmt, fmtUnit, gradeClass } from '../lib/api.js';
import { Card, Button, Badge, Modal, Field, Input, Select, Empty, useToast, ConfirmDialog } from '../components/UI.jsx';
import Icon from '../components/Icons.jsx';

const SEMESTER_PRESETS = ['First Semester', 'Second Semester', 'Summer Session'];
const LEVEL_PRESETS = ['100 Level', '200 Level', '300 Level', '400 Level', '500 Level', '600 Level'];
const STATUSES = [
  { value: 'completed', label: 'Completed (graded)' },
  { value: 'ongoing', label: 'Ongoing (in progress)' },
  { value: 'planned', label: 'Planned (future)' },
];

function suggestSessionName() {
  const now = new Date();
  const y = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}/${y + 1}`;
}

export default function Records() {
  const { data, loading, refresh } = useData();
  const toast = useToast();

  const [openSems, setOpenSems] = useState({});
  const [sessionModal, setSessionModal] = useState(null);   // { name } | null
  const [semesterModal, setSemesterModal] = useState(null); // { session_id, name, level }
  const [courseModal, setCourseModal] = useState(null);     // { semester_id, ...course }
  const [bulkModal, setBulkModal] = useState(null);         // { semester_id, text }
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const semesterStats = useMemo(() => {
    const map = new Map();
    for (const s of data?.timeline?.semesters || []) map.set(s.semesterId, s);
    return map;
  }, [data]);

  if (loading) return <div className="skeleton" style={{ height: 380 }} />;
  if (!data) return null;

  const { sessions, gradePoints, maxPoint } = data;
  const toggle = (id) => setOpenSems((o) => ({ ...o, [id]: !o[id] }));

  const run = async (fn, successMsg) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await refresh();
      if (successMsg) toast.success(successMsg);
      return true;
    } catch (e) {
      setError(e.message);
      toast.error(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  /* --------------------------------------------------------------- handlers */

  const saveSession = async () => {
    const ok = await run(() => api.addSession({ name: sessionModal.name.trim() }), 'Session added');
    if (ok) setSessionModal(null);
  };

  const saveSemester = async () => {
    const ok = await run(() => api.addSemester({
      session_id: semesterModal.session_id,
      name: semesterModal.name,
      level: semesterModal.level || '',
    }), 'Semester added');
    if (ok) {
      setSemesterModal(null);
      await refresh();
    }
  };

  const saveCourse = async () => {
    const payload = {
      code: courseModal.code.trim(),
      title: courseModal.title?.trim() || '',
      unit: Number(courseModal.unit),
      grade: courseModal.status === 'completed' ? (courseModal.grade || null) : null,
      score: courseModal.score === '' || courseModal.score == null ? null : Number(courseModal.score),
      status: courseModal.status,
      is_carryover: !!courseModal.is_carryover,
    };
    if (payload.status === 'completed' && !payload.grade) {
      setError('Choose a grade, or mark the course as ongoing/planned.');
      return;
    }
    const ok = courseModal.id
      ? await run(() => api.updateCourse(courseModal.id, payload), 'Course updated')
      : await run(() => api.addCourse({ ...payload, semester_id: courseModal.semester_id }), 'Course added');
    if (ok) setCourseModal(null);
  };

  const saveBulk = async () => {
    const rows = bulkModal.text.split('\n').map((l) => l.trim()).filter(Boolean);
    const parsed = [];
    const validGrades = new Set(gradePoints.map((g) => g.letter.toUpperCase()));

    for (const [i, line] of rows.entries()) {
      const parts = line.split(/\s*[,|\t]\s*/);
      if (parts.length < 3) { setError(`Line ${i + 1}: expected at least "CODE, TITLE, UNITS".`); return; }
      const [code, ...rest] = parts;
      const gradeRaw = rest.length >= 3 ? rest.pop() : null;
      const unitRaw = rest.pop();
      const title = rest.join(', ');
      const unit = Number(unitRaw);
      if (!Number.isFinite(unit) || unit <= 0) { setError(`Line ${i + 1}: "${unitRaw}" is not a valid unit value.`); return; }
      const grade = gradeRaw ? gradeRaw.toUpperCase() : null;
      if (grade && !validGrades.has(grade)) { setError(`Line ${i + 1}: "${grade}" is not a grade on your scale.`); return; }
      parsed.push({ code, title, unit, grade, status: grade ? 'completed' : 'ongoing' });
    }
    if (!parsed.length) { setError('Add at least one course line.'); return; }

    const ok = await run(() => api.addCoursesBulk({ semester_id: bulkModal.semester_id, courses: parsed }),
      `${parsed.length} courses added`);
    if (ok) setBulkModal(null);
  };

  const doDelete = async () => {
    const { kind, id } = confirm;
    const fn = kind === 'session' ? api.deleteSession : kind === 'semester' ? api.deleteSemester : api.deleteCourse;
    const ok = await run(() => fn(id), `${kind[0].toUpperCase()}${kind.slice(1)} deleted`);
    if (ok) setConfirm(null);
  };

  /* ------------------------------------------------------------------ render */

  return (
    <>
      <div className="flex between wrap mb-4" style={{ gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.35rem' }}>Academic records</h1>
          <p className="muted small">{sessions.length} session{sessions.length !== 1 ? 's' : ''} · {data.counts.courses} courses · {data.totalUnits} units earned</p>
        </div>
        <Button variant="primary" onClick={() => setSessionModal({ name: suggestSessionName() })}>
          <Icon.Plus size={16} /> New session
        </Button>
      </div>

      {sessions.length === 0 && (
        <Empty icon="🗂️" title="No sessions yet"
               action={<Button variant="primary" onClick={() => setSessionModal({ name: suggestSessionName() })}><Icon.Plus size={16} /> Add session</Button>}>
          An academic session is a full year, like 2024/2025. Inside it you add semesters, and inside those, your courses.
        </Empty>
      )}

      {sessions.map((session) => {
        const sessUnits = session.semesters.reduce((sum, m) =>
          sum + m.courses.reduce((u, c) => u + Number(c.unit), 0), 0);
        return (
          <div className="session-block" key={session.id}>
            <div className="session-head">
              <Icon.Layers size={17} style={{ color: 'var(--accent)' }} />
              <div style={{ flex: 1, minWidth: 130 }}>
                <h3>{session.name}</h3>
                <span className="muted small">
                  {session.semesters.length} semester{session.semesters.length !== 1 ? 's' : ''} · {sessUnits} units
                </span>
              </div>
              <Button size="sm" onClick={() => setSemesterModal({ session_id: session.id, name: SEMESTER_PRESETS[0], level: '' })}>
                <Icon.Plus size={14} /> Semester
              </Button>
              <button className="icon-btn" title="Delete session"
                      onClick={() => setConfirm({ kind: 'session', id: session.id, name: session.name })}>
                <Icon.Trash size={15} />
              </button>
            </div>

            {session.semesters.length === 0 && (
              <div style={{ padding: '18px 20px' }} className="muted small">
                No semesters in this session yet.
              </div>
            )}

            {session.semesters.map((sem) => {
              const stats = semesterStats.get(sem.id);
              const isOpen = openSems[sem.id] ?? true;
              const semUnits = sem.courses.reduce((u, c) => u + Number(c.unit), 0);
              return (
                <div className="semester-block" key={sem.id}>
                  <div className="semester-head" onClick={() => toggle(sem.id)}>
                    <Icon.Chevron size={15} className={`chev ${isOpen ? 'open' : ''}`} />
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <h4>{sem.name}</h4>
                      {sem.level && <span className="muted small">{sem.level}</span>}
                    </div>
                    <div className="flex wrap" style={{ gap: 16 }}>
                      <span className="metric-inline">GPA <b>{stats ? fmt(stats.gpa) : '—'}</b></span>
                      <span className="metric-inline">Units <b>{semUnits}</b></span>
                      <span className="metric-inline">CGPA <b>{stats ? fmt(stats.cgpa) : '—'}</b></span>
                    </div>
                    <div className="flex" style={{ gap: 6 }} onClick={(e) => e.stopPropagation()}>
                      <Button size="xs" onClick={() => setCourseModal({
                        semester_id: sem.id, code: '', title: '', unit: 3, grade: gradePoints[0]?.letter || 'A',
                        score: '', status: 'completed', is_carryover: false,
                      })}><Icon.Plus size={13} /> Course</Button>
                      <button className="icon-btn" title="Paste several courses"
                              onClick={() => setBulkModal({ semester_id: sem.id, text: '' })}>
                        <Icon.Records size={14} />
                      </button>
                      <button className="icon-btn" title="Delete semester"
                              onClick={() => setConfirm({ kind: 'semester', id: sem.id, name: `${session.name} · ${sem.name}` })}>
                        <Icon.Trash size={14} />
                      </button>
                    </div>
                  </div>

                  {isOpen && (
                    <div style={{ padding: '0 12px 14px' }}>
                      {sem.courses.length === 0 ? (
                        <div className="muted small" style={{ padding: '6px 10px 12px' }}>
                          No courses recorded. Add them individually or paste a list.
                        </div>
                      ) : (
                        <div className="table-wrap">
                          <table className="data">
                            <thead>
                              <tr>
                                <th>Code</th><th>Title</th>
                                <th className="num">Units</th>
                                <th className="center">Grade</th>
                                <th className="num">Point</th>
                                <th className="num">Quality pts</th>
                                <th>Status</th>
                                <th style={{ width: 78 }}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {sem.courses.map((c) => {
                                const gp = gradePoints.find((g) => g.letter.toUpperCase() === String(c.grade || '').toUpperCase());
                                const points = gp ? Number(gp.points) : null;
                                const graded = c.status === 'completed' && points != null;
                                return (
                                  <tr key={c.id}>
                                    <td className="code-cell">
                                      {c.code}
                                      {!!c.is_carryover && <Badge tone="warn" >CO</Badge>}
                                    </td>
                                    <td style={{ maxWidth: 260 }}>{c.title || <span className="muted">—</span>}</td>
                                    <td className="num tabular">{fmtUnit(c.unit)}</td>
                                    <td className="center">
                                      <span className={`grade-pill ${gradeClass(c.grade, points, maxPoint)}`}>
                                        {c.grade || (c.status === 'ongoing' ? 'IP' : 'PL')}
                                      </span>
                                    </td>
                                    <td className="num tabular muted">{graded ? fmt(points) : '—'}</td>
                                    <td className="num tabular">{graded ? fmt(points * Number(c.unit)) : '—'}</td>
                                    <td>
                                      <Badge tone={c.status === 'completed' ? 'plain' : c.status === 'ongoing' ? 'accent' : 'warn'}>
                                        {c.status}
                                      </Badge>
                                    </td>
                                    <td>
                                      <div className="flex" style={{ gap: 4, justifyContent: 'flex-end' }}>
                                        <button className="icon-btn" style={{ width: 28, height: 28 }} title="Edit"
                                                onClick={() => setCourseModal({
                                                  ...c, unit: Number(c.unit), score: c.score ?? '',
                                                  is_carryover: !!c.is_carryover, grade: c.grade || gradePoints[0]?.letter,
                                                })}>
                                          <Icon.Edit size={13} />
                                        </button>
                                        <button className="icon-btn" style={{ width: 28, height: 28 }} title="Delete"
                                                onClick={() => setConfirm({ kind: 'course', id: c.id, name: c.code })}>
                                          <Icon.Trash size={13} />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {/* ------------------------------------------------------------ modals */}

      <Modal open={!!sessionModal} onClose={() => setSessionModal(null)} title="New academic session"
             description="Use the format your school uses, e.g. 2024/2025."
             footer={<>
               <Button variant="ghost" onClick={() => setSessionModal(null)}>Cancel</Button>
               <Button variant="primary" onClick={saveSession} loading={busy}>Add session</Button>
             </>}>
        {error && <div className="alert danger">{error}</div>}
        <Field label="Session name">
          <Input value={sessionModal?.name || ''} autoFocus
                 onChange={(e) => setSessionModal((s) => ({ ...s, name: e.target.value }))}
                 placeholder="2024/2025" />
        </Field>
      </Modal>

      <Modal open={!!semesterModal} onClose={() => setSemesterModal(null)} title="Add semester"
             footer={<>
               <Button variant="ghost" onClick={() => setSemesterModal(null)}>Cancel</Button>
               <Button variant="primary" onClick={saveSemester} loading={busy}>Add semester</Button>
             </>}>
        {error && <div className="alert danger">{error}</div>}
        <Field label="Semester">
          <Select value={semesterModal?.name || ''} onChange={(e) => setSemesterModal((s) => ({ ...s, name: e.target.value }))}>
            {SEMESTER_PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </Field>
        <Field label="Level" hint="Optional — appears on your transcript.">
          <Select value={semesterModal?.level || ''} onChange={(e) => setSemesterModal((s) => ({ ...s, level: e.target.value }))}>
            <option value="">Not specified</option>
            {LEVEL_PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </Field>
      </Modal>

      <Modal open={!!courseModal} onClose={() => setCourseModal(null)}
             title={courseModal?.id ? 'Edit course' : 'Add course'}
             description={courseModal?.id ? 'Correct any detail — your GPA recalculates immediately.' : undefined}
             footer={<>
               <Button variant="ghost" onClick={() => setCourseModal(null)}>Cancel</Button>
               <Button variant="primary" onClick={saveCourse} loading={busy}>{courseModal?.id ? 'Save changes' : 'Add course'}</Button>
             </>}>
        {error && <div className="alert danger">{error}</div>}
        <div className="field-row">
          <Field label="Course code">
            <Input value={courseModal?.code || ''} autoFocus placeholder="CSC 201"
                   onChange={(e) => setCourseModal((c) => ({ ...c, code: e.target.value }))} />
          </Field>
          <Field label="Credit units">
            <Input type="number" min="0.5" max="24" step="0.5" value={courseModal?.unit ?? 3}
                   onChange={(e) => setCourseModal((c) => ({ ...c, unit: e.target.value }))} />
          </Field>
        </div>
        <Field label="Course title" hint="Optional, but it makes your transcript look complete.">
          <Input value={courseModal?.title || ''} placeholder="Data Structures and Algorithms"
                 onChange={(e) => setCourseModal((c) => ({ ...c, title: e.target.value }))} />
        </Field>
        <div className="field-row">
          <Field label="Status">
            <Select value={courseModal?.status || 'completed'}
                    onChange={(e) => setCourseModal((c) => ({ ...c, status: e.target.value }))}>
              {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
          </Field>
          <Field label="Grade">
            <Select value={courseModal?.grade || ''} disabled={courseModal?.status !== 'completed'}
                    onChange={(e) => setCourseModal((c) => ({ ...c, grade: e.target.value }))}>
              {gradePoints.map((g) => (
                <option key={g.letter} value={g.letter}>{g.letter} — {Number(g.points).toFixed(1)} pts</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="field-row">
          <Field label="Score" hint="Optional raw score out of 100.">
            <Input type="number" min="0" max="100" step="0.1" value={courseModal?.score ?? ''}
                   placeholder="e.g. 72"
                   onChange={(e) => setCourseModal((c) => ({ ...c, score: e.target.value }))} />
          </Field>
          <Field label="Flags">
            <label className="checkbox" style={{ marginTop: 8 }}>
              <input type="checkbox" checked={!!courseModal?.is_carryover}
                     onChange={(e) => setCourseModal((c) => ({ ...c, is_carryover: e.target.checked }))} />
              This is a carryover / retake
            </label>
          </Field>
        </div>
      </Modal>

      <Modal open={!!bulkModal} onClose={() => setBulkModal(null)} wide title="Paste multiple courses"
             description="One course per line: CODE, TITLE, UNITS, GRADE. Leave the grade off for ongoing courses."
             footer={<>
               <Button variant="ghost" onClick={() => setBulkModal(null)}>Cancel</Button>
               <Button variant="primary" onClick={saveBulk} loading={busy}>Add courses</Button>
             </>}>
        {error && <div className="alert danger">{error}</div>}
        <Field label="Courses">
          <textarea className="input" rows={9} style={{ fontFamily: 'var(--mono)', fontSize: '.83rem' }}
                    value={bulkModal?.text || ''} autoFocus
                    placeholder={'CSC 201, Data Structures, 3, A\nMTH 205, Linear Algebra, 3, B\nGST 212, Philosophy and Logic, 2, C\nCSC 299, Industrial Training, 4'}
                    onChange={(e) => setBulkModal((b) => ({ ...b, text: e.target.value }))} />
        </Field>
        <p className="muted small">
          Valid grades on your scale: {gradePoints.map((g) => g.letter).join(', ')}
        </p>
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        busy={busy}
        title={`Delete ${confirm?.kind}?`}
        message={confirm?.kind === 'course'
          ? `"${confirm?.name}" will be permanently removed and your GPA recalculated.`
          : `"${confirm?.name}" and everything inside it will be permanently deleted. This cannot be undone.`}
        onCancel={() => setConfirm(null)}
        onConfirm={doDelete}
      />
    </>
  );
}
