import { useData } from '../lib/store.jsx';
import { Card, Badge, Empty } from '../components/UI.jsx';
import { BarChart, ImpactBars } from '../components/Charts.jsx';
import Icon from '../components/Icons.jsx';
import { fmt, gradeClass } from '../lib/api.js';

const TONE_ICON = {
  bad: Icon.Warn, warn: Icon.Warn, excellent: Icon.Check, good: Icon.Check, neutral: Icon.Spark, fair: Icon.Spark,
};

export default function Insights() {
  const { data, loading } = useData();

  if (loading) return <div className="skeleton" style={{ height: 400 }} />;
  if (!data) return null;

  const {
    insights, contributions, subjectAreas, weakCourses, failures, carryovers,
    timeline, maxPoint, targets, projectedRemaining, trend, cgpa, distribution, counts,
  } = data;

  if (counts.graded === 0) {
    return <Empty icon="🧠" title="Nothing to analyse yet">
      Add courses with grades in Records and this page will tell you what is lifting your CGPA,
      what is dragging it down, and what you need going forward.
    </Empty>;
  }

  const semesterBars = timeline.semesters
    .filter((s) => s.gradedCount > 0)
    .map((s) => ({ label: s.label, shortLabel: s.shortLabel, value: s.gpa }));

  const unitBars = timeline.semesters.map((s) => ({ label: s.label, shortLabel: s.shortLabel, value: s.units }));

  return (
    <>
      <div className="grid cols-3 mb-4">
        <div className="stat">
          <div className="stat-label">Trajectory</div>
          <div className="stat-value" style={{ fontSize: '1.5rem' }}>
            {trend.slope > 0.05 ? 'Improving' : trend.slope < -0.05 ? 'Declining' : 'Stable'}
          </div>
          <div className="stat-foot">
            {trend.slope === 0 ? 'Not enough data for a trend line'
              : `${trend.slope > 0 ? '+' : ''}${fmt(trend.slope)} GPA points per semester`}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Consistency</div>
          <div className="stat-value" style={{ fontSize: '1.5rem' }}>
            ±{fmt(trend.consistency)}
          </div>
          <div className="stat-foot">
            {trend.consistency < 0.25 ? 'Very steady results'
              : trend.consistency < 0.5 ? 'Moderate variation' : 'Highly volatile semesters'}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Risk flags</div>
          <div className="stat-value" style={{ fontSize: '1.5rem' }}>{failures.length + carryovers.length}</div>
          <div className="stat-foot">{failures.length} failed · {carryovers.length} carryover</div>
        </div>
      </div>

      <Card className="mb-4">
        <div className="card-head">
          <div style={{ flex: 1 }}>
            <h3>Full analysis</h3>
            <p>Generated from your complete academic record.</p>
          </div>
          <Badge tone="accent">{insights.length} findings</Badge>
        </div>
        {insights.map((ins, i) => {
          const I = TONE_ICON[ins.tone] || Icon.Spark;
          return (
            <div key={i} className={`insight ${ins.tone}`}>
              <div className="insight-icon"><I size={15} /></div>
              <div>
                <h4>{ins.title}</h4>
                <p>{ins.body}</p>
              </div>
            </div>
          );
        })}
      </Card>

      <div className="grid cols-2 mb-4">
        <Card>
          <div className="card-head">
            <div style={{ flex: 1 }}>
              <h3>Costing you the most</h3>
              <p>Weighted quality points lost relative to your own average.</p>
            </div>
          </div>
          {contributions.drags.length
            ? <ImpactBars items={contributions.drags} />
            : <p className="muted small">No course is currently pulling below your average. Excellent.</p>}
        </Card>

        <Card>
          <div className="card-head">
            <div style={{ flex: 1 }}>
              <h3>Carrying you</h3>
              <p>Courses contributing above your cumulative average.</p>
            </div>
          </div>
          {contributions.boosters.length
            ? <ImpactBars items={contributions.boosters} />
            : <p className="muted small">No course is above your average yet.</p>}
        </Card>
      </div>

      <div className="grid cols-2 mb-4">
        <Card>
          <div className="card-head">
            <div style={{ flex: 1 }}>
              <h3>GPA by semester</h3>
              <p>Compare semester performance side by side.</p>
            </div>
          </div>
          <BarChart data={semesterBars} max={maxPoint}
                    colorFor={(d) => d.value >= maxPoint * 0.9 ? 'var(--success)'
                      : d.value >= maxPoint * 0.7 ? 'var(--accent)'
                      : d.value >= maxPoint * 0.48 ? 'var(--warn)' : 'var(--danger)'} />
        </Card>

        <Card>
          <div className="card-head">
            <div style={{ flex: 1 }}>
              <h3>Workload by semester</h3>
              <p>Credit units carried each semester.</p>
            </div>
          </div>
          <BarChart data={unitBars} format={(v) => `${v} units`} />
        </Card>
      </div>

      {subjectAreas.length >= 2 && (
        <Card className="mb-4">
          <div className="card-head">
            <div style={{ flex: 1 }}>
              <h3>Performance by subject area</h3>
              <p>Grouped by course code prefix — where your strengths actually sit.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Area</th><th className="num">Courses</th><th className="num">Units</th><th className="num">Area GPA</th><th>Standing</th></tr>
              </thead>
              <tbody>
                {subjectAreas.map((a) => (
                  <tr key={a.prefix}>
                    <td className="code-cell">{a.prefix}</td>
                    <td className="num tabular">{a.count}</td>
                    <td className="num tabular">{a.units}</td>
                    <td className="num tabular"><b>{fmt(a.gpa)}</b></td>
                    <td>
                      <Badge tone={a.gpa >= cgpa + 0.3 ? 'success' : a.gpa <= cgpa - 0.3 ? 'danger' : 'plain'}>
                        {a.gpa >= cgpa + 0.3 ? 'Above your average' : a.gpa <= cgpa - 0.3 ? 'Below your average' : 'On par'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="grid cols-2 mb-4">
        <Card>
          <div className="card-head">
            <div style={{ flex: 1 }}>
              <h3>Needs attention</h3>
              <p>Low grades, ordered by how much weight they carry.</p>
            </div>
          </div>
          {weakCourses.length === 0 ? (
            <p className="muted small">No weak grades on record. Keep it that way.</p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Course</th><th className="num">Units</th><th className="center">Grade</th><th>When</th></tr></thead>
                <tbody>
                  {weakCourses.map((c, i) => (
                    <tr key={i}>
                      <td><div className="code-cell">{c.code}</div><div className="muted small">{c.title}</div></td>
                      <td className="num tabular">{c.unit}</td>
                      <td className="center"><span className={`grade-pill ${gradeClass(c.grade, c.points, maxPoint)}`}>{c.grade}</span></td>
                      <td className="small muted">{c.session} · {c.semester}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <div className="card-head">
            <div style={{ flex: 1 }}>
              <h3>What each target demands</h3>
              <p>Average grade point needed across your next {projectedRemaining} units.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th className="num">Target CGPA</th><th className="num">Required average</th><th>Verdict</th></tr></thead>
              <tbody>
                {targets.map((t) => (
                  <tr key={t.target}>
                    <td className="num tabular"><b>{t.target.toFixed(2)}</b></td>
                    <td className="num tabular">
                      {t.reached || !t.possible ? '—' : fmt(t.required)}
                    </td>
                    <td>
                      {t.reached ? <Badge tone="success">Already achieved</Badge>
                        : !t.possible ? <Badge tone="danger">Impossible in {projectedRemaining} units</Badge>
                        : t.required >= maxPoint * 0.95 ? <Badge tone="warn">Requires near-perfect grades</Badge>
                        : t.required >= maxPoint * 0.75 ? <Badge tone="accent">Demanding but reachable</Badge>
                        : <Badge tone="success">Comfortably reachable</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {distribution.length > 0 && (
            <p className="muted small mt-4">
              For context, your grade profile so far is {distribution.map((d) => `${d.count}×${d.letter}`).join(', ')}.
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
