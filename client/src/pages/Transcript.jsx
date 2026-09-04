import { useData, useAuth } from '../lib/store.jsx';
import { downloadExport, fmt, fmtUnit, gradeClass } from '../lib/api.js';
import { Card, Button, Badge, Empty } from '../components/UI.jsx';
import Icon from '../components/Icons.jsx';
import { Link } from 'react-router-dom';

export default function Transcript() {
  const { data, loading } = useData();
  const { profile } = useAuth();

  if (loading) return <div className="skeleton" style={{ height: 420 }} />;
  if (!data) return null;

  const { sessions, timeline, cgpa, maxPoint, totalUnits, classification, gradePoints, scale, counts } = data;

  const missing = ['full_name', 'matric_number', 'university', 'department', 'programme']
    .filter((k) => !profile?.[k]);

  if (counts.courses === 0) {
    return <Empty icon="📄" title="Nothing to put on a transcript yet"
                  action={<Link to="/records"><Button variant="primary">Add records</Button></Link>}>
      Add your sessions, semesters and courses and a full transcript will be generated from them.
    </Empty>;
  }

  return (
    <>
      <div className="grid cols-3 mb-4">
        <Card>
          <div className="flex" style={{ gap: 12, marginBottom: 12 }}>
            <div className="auth-feature-icon"><Icon.Doc size={17} /></div>
            <div><h3>PDF transcript</h3><p className="muted small">Formatted, paginated, print-ready.</p></div>
          </div>
          <p className="muted small mb-4">
            Student details, every session and semester, per-course grade points, semester GPA,
            running CGPA and a cumulative summary with your grading key.
          </p>
          <Button variant="primary" onClick={() => downloadExport('pdf')} style={{ width: '100%' }}>
            <Icon.Download size={15} /> Generate PDF
          </Button>
        </Card>

        <Card>
          <div className="flex" style={{ gap: 12, marginBottom: 12 }}>
            <div className="auth-feature-icon"><Icon.Records size={17} /></div>
            <div><h3>CSV export</h3><p className="muted small">Every row, for spreadsheets.</p></div>
          </div>
          <p className="muted small mb-4">
            One row per course with units, grades, grade points and quality points, plus a semester
            summary block. Opens cleanly in Excel or Sheets.
          </p>
          <Button onClick={() => downloadExport('csv')} style={{ width: '100%' }}>
            <Icon.Download size={15} /> Download CSV
          </Button>
        </Card>

        <Card>
          <div className="flex" style={{ gap: 12, marginBottom: 12 }}>
            <div className="auth-feature-icon"><Icon.Shield size={17} /></div>
            <div><h3>JSON backup</h3><p className="muted small">Complete, portable copy.</p></div>
          </div>
          <p className="muted small mb-4">
            The full structured record including profile, grading scale, all sessions and goals —
            useful as a personal backup.
          </p>
          <Button onClick={() => downloadExport('json')} style={{ width: '100%' }}>
            <Icon.Download size={15} /> Download JSON
          </Button>
        </Card>
      </div>

      {missing.length > 0 && (
        <div className="alert warn">
          <Icon.Warn size={16} />
          <span>
            Your transcript will show dashes for: <b>{missing.map((m) => m.replace('_', ' ')).join(', ')}</b>.{' '}
            <Link to="/settings">Complete your profile</Link> for a finished document.
          </span>
        </div>
      )}

      <Card className="flush">
        <div style={{ padding: '20px 22px', borderBottom: '1px solid var(--border)', background: 'var(--panel-2)' }}>
          <div className="flex between wrap" style={{ gap: 12 }}>
            <div>
              <div className="stat-label">Transcript preview</div>
              <h2 style={{ marginTop: 4 }}>{profile?.full_name || 'Unnamed student'}</h2>
              <p className="muted small">
                {[profile?.matric_number, profile?.programme, profile?.department, profile?.university]
                  .filter(Boolean).join(' · ') || 'Profile details not set'}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="stat-label">Cumulative GPA</div>
              <div style={{ fontSize: '2rem', fontWeight: 740, letterSpacing: '-.04em' }} className="tabular">{fmt(cgpa)}</div>
              <Badge tone={classification.tone}>{classification.label}</Badge>
            </div>
          </div>
          <div className="flex wrap mt-4" style={{ gap: 20 }}>
            <span className="metric-inline">Total units <b>{totalUnits}</b></span>
            <span className="metric-inline">Quality points <b>{fmt(data.totalQualityPoints)}</b></span>
            <span className="metric-inline">Semesters <b>{timeline.semesters.length}</b></span>
            <span className="metric-inline">Scale <b>{scale.name}</b></span>
          </div>
        </div>

        <div style={{ padding: '4px 6px 18px' }}>
          {sessions.map((session) => (
            <div key={session.id} style={{ padding: '14px 16px 0' }}>
              <div style={{
                background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 10,
                padding: '8px 14px', marginBottom: 10, fontWeight: 650, fontSize: '.9rem',
              }}>
                Academic session {session.name}
              </div>

              {session.semesters.map((sem) => {
                const stats = timeline.semesters.find((s) => s.semesterId === sem.id);
                return (
                  <div key={sem.id} style={{ marginBottom: 18 }}>
                    <div className="flex between wrap mb-3" style={{ gap: 10, padding: '0 2px' }}>
                      <b style={{ fontSize: '.88rem' }}>{sem.name}{sem.level ? ` · ${sem.level}` : ''}</b>
                      <span className="muted small tabular">
                        GPA {stats ? fmt(stats.gpa) : '—'} · CGPA {stats ? fmt(stats.cgpa) : '—'}
                      </span>
                    </div>
                    <div className="table-wrap">
                      <table className="data">
                        <thead>
                          <tr>
                            <th>Code</th><th>Title</th><th className="num">Units</th>
                            <th className="center">Grade</th><th className="num">Point</th><th className="num">QP</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sem.courses.map((c) => {
                            const gp = gradePoints.find((g) => g.letter.toUpperCase() === String(c.grade || '').toUpperCase());
                            const pts = c.status === 'completed' && gp ? Number(gp.points) : null;
                            return (
                              <tr key={c.id}>
                                <td className="code-cell">{c.code}</td>
                                <td>{c.title || <span className="muted">—</span>}</td>
                                <td className="num tabular">{fmtUnit(c.unit)}</td>
                                <td className="center">
                                  <span className={`grade-pill ${gradeClass(c.grade, pts, maxPoint)}`}>
                                    {c.grade || (c.status === 'ongoing' ? 'IP' : 'PL')}
                                  </span>
                                </td>
                                <td className="num tabular muted">{pts != null ? fmt(pts) : '—'}</td>
                                <td className="num tabular">{pts != null ? fmt(pts * Number(c.unit)) : '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
