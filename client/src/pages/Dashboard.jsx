import { Link } from 'react-router-dom';
import { useData, useAuth } from '../lib/store.jsx';
import { Card, Badge, Empty, Button, Progress } from '../components/UI.jsx';
import { TrendChart, DonutChart, Gauge } from '../components/Charts.jsx';
import Icon from '../components/Icons.jsx';
import { fmt, gradeClass, toneFor } from '../lib/api.js';

function StatCard({ label, value, unit, foot, tone }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}{unit && <small> {unit}</small>}</div>
      {foot && <div className="stat-foot">{tone && <span className={`dot`} style={{ color: `var(--${tone})` }} />}{foot}</div>}
    </div>
  );
}

export default function Dashboard() {
  const { data, loading } = useData();
  const { profile } = useAuth();

  if (loading) {
    return (
      <div className="grid cols-4">
        {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 118 }} />)}
        <div className="skeleton" style={{ height: 330, gridColumn: '1 / -1' }} />
      </div>
    );
  }
  if (!data) return null;

  const {
    cgpa, maxPoint, totalUnits, classification, nextClassification, timeline,
    counts, distribution, insights, trend, failures, carryovers, outstandingUnits, targets,
  } = data;

  const hasData = timeline.semesters.length > 0;
  const firstName = (profile?.full_name || '').split(' ')[0];

  if (!hasData) {
    return (
      <>
        <div className="page-head">
          <h1>Welcome{firstName ? `, ${firstName}` : ''} 👋</h1>
          <p>Let's build your academic record. Start by adding an academic session, then a semester, then your courses.</p>
        </div>
        <Empty icon="🎓" title="No academic records yet"
               action={<Link to="/records"><Button variant="primary"><Icon.Plus size={16} /> Add your first session</Button></Link>}>
          Once you add courses with grades, Gradient calculates your GPA and CGPA, charts your progress,
          and tells you exactly what you need to reach your target.
        </Empty>
      </>
    );
  }

  const chartData = timeline.semesters.filter((s) => s.gradedCount > 0).map((s) => ({
    label: s.label, shortLabel: s.shortLabel, gpa: s.gpa, cgpa: s.cgpa, units: s.units,
  }));

  const gradeColors = { A: '#34D399', B: '#7C8CFF', C: '#A78BFA', D: '#FBBF24', E: '#FB923C', F: '#FB7185' };
  const donutData = distribution.map((d) => ({
    label: d.letter, value: d.count, color: gradeColors[d.letter] || '#94A3B8',
  }));

  const latest = timeline.semesters.filter((s) => s.gradedCount > 0).at(-1);
  const progressToNext = nextClassification
    ? Math.min(100, (cgpa / nextClassification.required) * 100)
    : 100;

  const warnings = [];
  if (failures.length) warnings.push({ tone: 'bad', text: `${failures.length} failed course${failures.length > 1 ? 's' : ''}: ${failures.map((f) => f.code).join(', ')}` });
  if (carryovers.length) warnings.push({ tone: 'warn', text: `${carryovers.length} carryover${carryovers.length > 1 ? 's' : ''} flagged: ${carryovers.map((c) => c.code).join(', ')}` });
  if (trend.lastDelta != null && trend.lastDelta <= -0.3) warnings.push({ tone: 'bad', text: `GPA dropped ${Math.abs(trend.lastDelta).toFixed(2)} points last semester` });
  if (trend.slope < -0.1 && trend.series.length >= 3) warnings.push({ tone: 'warn', text: 'Multi-semester downward trend detected' });
  if (cgpa < maxPoint * 0.4) warnings.push({ tone: 'bad', text: 'CGPA is below the typical graduation threshold' });

  return (
    <>
      <div className="hero-cgpa mb-4">
        <Gauge value={cgpa} max={maxPoint} tone={toneFor(cgpa, maxPoint) === 'excellent' ? 'success' : toneFor(cgpa, maxPoint) === 'warn' ? 'warn' : 'accent'} />
        <div style={{ flex: 1, minWidth: 240 }}>
          <div className="flex wrap" style={{ gap: 10, marginBottom: 8 }}>
            <Badge tone={classification.tone}>{classification.label}</Badge>
            {latest && <Badge tone="plain">Latest semester GPA {fmt(latest.gpa)}</Badge>}
            {trend.lastDelta != null && (
              <Badge tone={trend.lastDelta >= 0 ? 'success' : 'danger'}>
                {trend.lastDelta >= 0 ? '▲' : '▼'} {Math.abs(trend.lastDelta).toFixed(2)} vs previous
              </Badge>
            )}
          </div>
          <h2 style={{ fontSize: '1.32rem', marginBottom: 6 }}>
            {totalUnits} units earned across {counts.semesters} semester{counts.semesters > 1 ? 's' : ''}
          </h2>
          {nextClassification ? (
            <>
              <p className="muted small" style={{ marginBottom: 9 }}>
                {(nextClassification.required - cgpa).toFixed(2)} points from <b style={{ color: 'var(--text)' }}>{nextClassification.label}</b> ({nextClassification.required.toFixed(2)})
              </p>
              <Progress value={progressToNext} tone={progressToNext > 85 ? 'success' : ''} />
            </>
          ) : (
            <p className="muted small">You are in the top classification band. Hold the line.</p>
          )}
          <div className="flex wrap mt-4" style={{ gap: 8 }}>
            <Link to="/records"><Button size="sm" variant="primary"><Icon.Plus size={15} /> Add results</Button></Link>
            <Link to="/simulator"><Button size="sm"><Icon.Simulator size={15} /> Run a forecast</Button></Link>
            <Link to="/transcript"><Button size="sm"><Icon.Download size={15} /> Transcript</Button></Link>
          </div>
        </div>
      </div>

      <div className="grid cols-4 mb-4">
        <StatCard label="Cumulative GPA" value={fmt(cgpa)} unit={`/ ${fmt(maxPoint, 1)}`} foot={classification.label} tone={classification.tone === 'bad' ? 'danger' : classification.tone === 'warn' ? 'warn' : 'success'} />
        <StatCard label="Total units" value={totalUnits} foot={`${counts.graded} graded courses`} />
        <StatCard label="Completed" value={counts.completed} foot={`${counts.courses} courses recorded`} />
        <StatCard label="Outstanding" value={counts.outstanding} foot={`${outstandingUnits} units in progress or planned`} tone={counts.outstanding ? 'warn' : undefined} />
      </div>

      {warnings.length > 0 && (
        <Card className="mb-4">
          <div className="card-head">
            <div style={{ flex: 1 }}>
              <h3>Attention required</h3>
              <p>Issues that are actively costing you CGPA.</p>
            </div>
            <Badge tone="danger">{warnings.length}</Badge>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {warnings.map((w, i) => (
              <div key={i} className={`alert ${w.tone === 'bad' ? 'danger' : 'warn'}`} style={{ marginBottom: 0 }}>
                <Icon.Warn size={15} /><span>{w.text}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid dash mb-4">
        <Card>
          <div className="card-head">
            <div style={{ flex: 1 }}>
              <h3>Performance trend</h3>
              <p>Semester GPA against your running cumulative average.</p>
            </div>
            {trend.slope !== 0 && (
              <Badge tone={trend.slope > 0 ? 'success' : 'danger'}>
                {trend.slope > 0 ? 'Improving' : 'Declining'} {Math.abs(trend.slope).toFixed(2)}/sem
              </Badge>
            )}
          </div>
          <TrendChart data={chartData} maxPoint={maxPoint} />
        </Card>

        <Card>
          <div className="card-head">
            <div style={{ flex: 1 }}>
              <h3>Grade distribution</h3>
              <p>Across {counts.graded} graded courses.</p>
            </div>
          </div>
          <DonutChart data={donutData} centerLabel="courses" centerValue={counts.graded} />
        </Card>
      </div>

      <div className="grid dash">
        <Card>
          <div className="card-head">
            <div style={{ flex: 1 }}>
              <h3>Semester breakdown</h3>
              <p>Every semester on record with its cumulative position.</p>
            </div>
            <Link to="/records"><Button size="sm" variant="ghost">Manage</Button></Link>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Session</th><th>Semester</th>
                  <th className="num">Units</th><th className="num">GPA</th>
                  <th className="num">Cum. units</th><th className="num">CGPA</th>
                </tr>
              </thead>
              <tbody>
                {timeline.semesters.map((s) => (
                  <tr key={s.semesterId}>
                    <td>{s.sessionName}</td>
                    <td>{s.semesterName}</td>
                    <td className="num tabular">{s.units}</td>
                    <td className="num tabular">
                      <span className={`grade-pill ${gradeClass('x', s.gpa, maxPoint)}`}>{fmt(s.gpa)}</span>
                    </td>
                    <td className="num tabular muted">{s.cumulativeUnits}</td>
                    <td className="num tabular"><b>{fmt(s.cgpa)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <Card>
            <div className="card-head">
              <div style={{ flex: 1 }}>
                <h3>Key insights</h3>
                <p>Top findings from your record.</p>
              </div>
              <Link to="/insights"><Button size="sm" variant="ghost">All</Button></Link>
            </div>
            {insights.slice(0, 3).map((ins, i) => (
              <div key={i} className={`insight ${ins.tone}`}>
                <div className="insight-icon">
                  {ins.tone === 'bad' ? <Icon.Warn size={15} /> : ins.tone === 'warn' ? <Icon.Warn size={15} />
                    : ins.tone === 'excellent' || ins.tone === 'good' ? <Icon.Check size={15} /> : <Icon.Spark size={15} />}
                </div>
                <div>
                  <h4>{ins.title}</h4>
                  <p>{ins.body}</p>
                </div>
              </div>
            ))}
          </Card>

          <Card>
            <div className="card-head">
              <div style={{ flex: 1 }}>
                <h3>Target checkpoints</h3>
                <p>Average needed over your next {data.projectedRemaining} units.</p>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 9 }}>
              {targets.map((t) => (
                <div key={t.target} className="flex between" style={{
                  padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--panel-2)',
                }}>
                  <div className="flex" style={{ gap: 9 }}>
                    <b className="tabular">{t.target.toFixed(1)}</b>
                    <span className="muted small">CGPA</span>
                  </div>
                  {t.reached ? <Badge tone="success">Achieved</Badge>
                    : t.possible ? <Badge tone={t.required > maxPoint * 0.9 ? 'warn' : 'accent'}>Need {fmt(t.required)} avg</Badge>
                    : <Badge tone="danger">Not reachable</Badge>}
                </div>
              ))}
            </div>
            <Link to="/goals"><Button size="sm" variant="ghost" style={{ marginTop: 12 }}>Set a personal goal →</Button></Link>
          </Card>
        </div>
      </div>
    </>
  );
}
