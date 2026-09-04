import { useState, useEffect, useCallback } from 'react';
import { useData } from '../lib/store.jsx';
import { api, fmt } from '../lib/api.js';
import { Card, Button, Badge, Field, Input, Select, Empty } from '../components/UI.jsx';
import Icon from '../components/Icons.jsx';

/**
 * Two complementary tools:
 *  1. Forward simulation — "if I score these grades, where do I land?"
 *  2. Reverse solving   — "to land on 4.00, what must I average?"
 */
export default function Simulator() {
  const { data, loading } = useData();
  const [rows, setRows] = useState([]);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [target, setTarget] = useState(4);
  const [remaining, setRemaining] = useState(24);
  const [targetResult, setTargetResult] = useState(null);

  const gradePoints = data?.gradePoints || [];
  const maxPoint = data?.maxPoint || 5;

  // Seed the simulator with any outstanding courses already on record.
  useEffect(() => {
    if (!data) return;
    const seed = data.outstanding.length
      ? data.outstanding.map((c) => ({ code: c.code, unit: c.unit, grade: gradePoints[0]?.letter || 'A' }))
      : [{ code: '', unit: 3, grade: gradePoints[0]?.letter || 'A' },
         { code: '', unit: 3, grade: gradePoints[1]?.letter || 'B' }];
    setRows(seed);
    const seededRemaining = data.projectedRemaining || 24;
    const seededTarget = data.nextClassification ? data.nextClassification.required : Math.min(data.maxPoint, 4);
    setRemaining(seededRemaining);
    setTarget(seededTarget);
    solveTarget(seededTarget, seededRemaining);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const simulate = useCallback(async (payloadRows) => {
    const valid = (payloadRows || []).filter((r) => Number(r.unit) > 0 && r.grade);
    if (!valid.length) { setResult(null); return; }
    setBusy(true);
    setError('');
    try {
      const res = await api.simulate({
        hypothetical: valid.map((r) => ({ code: r.code || undefined, unit: Number(r.unit), grade: r.grade })),
      });
      setResult(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { if (rows.length) simulate(rows); }, [rows, simulate]);

  // Accepts explicit values so the seeding effect can solve with the freshly
  // derived numbers instead of the previous render's state.
  const solveTarget = useCallback(async (t, r) => {
    try {
      setError('');
      const res = await api.target({
        target: Number(t ?? target),
        remainingUnits: Number(r ?? remaining),
      });
      setTargetResult(res);
    } catch (e) {
      setError(e.message);
    }
  }, [target, remaining]);

  if (loading) return <div className="skeleton" style={{ height: 420 }} />;
  if (!data) return null;

  if (data.counts.graded === 0) {
    return <Empty icon="🔮" title="Add some results first">
      The simulator projects forward from your existing record. Add at least one graded semester in Records.
    </Empty>;
  }

  const setRow = (i, patch) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const addRow = () => setRows((r) => [...r, { code: '', unit: 3, grade: gradePoints[0]?.letter || 'A' }]);
  const removeRow = (i) => setRows((r) => r.filter((_, idx) => idx !== i));

  const fillAll = (letter) => setRows((r) => r.map((row) => ({ ...row, grade: letter })));
  const simUnits = rows.reduce((s, r) => s + (Number(r.unit) || 0), 0);

  const delta = result?.delta ?? 0;

  return (
    <>
      <div className="grid dash">
        <Card>
          <div className="card-head">
            <div style={{ flex: 1 }}>
              <h3>Hypothetical semester</h3>
              <p>Enter the courses you are about to take and the grades you expect.</p>
            </div>
            <Button size="sm" onClick={addRow}><Icon.Plus size={14} /> Course</Button>
          </div>

          {error && <div className="alert danger">{error}</div>}

          <div className="chip-row mb-4">
            <span className="muted small" style={{ alignSelf: 'center', marginRight: 4 }}>Fill all with:</span>
            {gradePoints.map((g) => (
              <button key={g.letter} className="chip" onClick={() => fillAll(g.letter)}>{g.letter}</button>
            ))}
          </div>

          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Course (optional)</th><th style={{ width: 110 }}>Units</th><th style={{ width: 150 }}>Expected grade</th><th style={{ width: 44 }}></th></tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    <td><Input value={row.code} placeholder={`Course ${i + 1}`} onChange={(e) => setRow(i, { code: e.target.value })} /></td>
                    <td><Input type="number" min="0.5" step="0.5" value={row.unit} onChange={(e) => setRow(i, { unit: e.target.value })} /></td>
                    <td>
                      <Select value={row.grade} onChange={(e) => setRow(i, { grade: e.target.value })}>
                        {gradePoints.map((g) => <option key={g.letter} value={g.letter}>{g.letter} — {Number(g.points).toFixed(1)}</option>)}
                      </Select>
                    </td>
                    <td>
                      <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => removeRow(i)} title="Remove">
                        <Icon.Close size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="muted small mt-3">
            {rows.length} course{rows.length !== 1 ? 's' : ''} · {simUnits} units in this simulation.
            {data.outstanding.length > 0 && ' Pre-filled from your outstanding courses.'}
          </p>
        </Card>

        <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <Card>
            <div className="card-head">
              <div style={{ flex: 1 }}>
                <h3>Projected outcome</h3>
                <p>Where this scenario leaves your CGPA.</p>
              </div>
              {busy && <span className="spinner" style={{ color: 'var(--accent)' }} />}
            </div>

            {result ? (
              <>
                <div className="flex" style={{ gap: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div>
                    <div className="stat-label">Current</div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-.03em' }} className="tabular muted">
                      {fmt(result.baseline.cgpa)}
                    </div>
                  </div>
                  <Icon.Chevron size={20} style={{ color: 'var(--muted)', marginBottom: 10 }} />
                  <div>
                    <div className="stat-label">Projected</div>
                    <div style={{
                      fontSize: '2.6rem', fontWeight: 760, letterSpacing: '-.04em', lineHeight: 1,
                      color: delta >= 0 ? 'var(--success)' : 'var(--danger)',
                    }} className="tabular">{fmt(result.projected.cgpa)}</div>
                  </div>
                  <Badge tone={delta > 0 ? 'success' : delta < 0 ? 'danger' : 'plain'}>
                    {delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : ''}{fmt(Math.abs(delta))}
                  </Badge>
                </div>

                <div className="divider" />

                <div style={{ display: 'grid', gap: 10 }}>
                  <div className="flex between"><span className="muted small">Simulated semester GPA</span><b className="tabular">{fmt(result.projected.semesterGpa)}</b></div>
                  <div className="flex between"><span className="muted small">Units after this semester</span><b className="tabular">{result.projected.units}</b></div>
                  <div className="flex between"><span className="muted small">Classification</span><Badge tone={result.projected.classification.tone}>{result.projected.classification.label}</Badge></div>
                  {result.baseline.classification.label !== result.projected.classification.label && (
                    <div className={`alert ${delta >= 0 ? 'success' : 'danger'}`} style={{ marginTop: 6, marginBottom: 0 }}>
                      <Icon.Trend size={15} />
                      <span>This scenario moves you from <b>{result.baseline.classification.label}</b> to <b>{result.projected.classification.label}</b>.</span>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className="muted small">Add at least one course with units and a grade to see a projection.</p>
            )}
          </Card>

          <Card>
            <div className="card-head">
              <div style={{ flex: 1 }}>
                <h3>Reverse solver</h3>
                <p>Work backwards from the CGPA you want.</p>
              </div>
            </div>
            <div className="field-row">
              <Field label="Target CGPA">
                <Input type="number" min="0" max={maxPoint} step="0.05" value={target}
                       onChange={(e) => setTarget(e.target.value)} onBlur={() => solveTarget()} />
              </Field>
              <Field label="Units remaining">
                <Input type="number" min="1" max="400" step="1" value={remaining}
                       onChange={(e) => setRemaining(e.target.value)} onBlur={() => solveTarget()} />
              </Field>
            </div>
            <Button variant="primary" onClick={() => solveTarget()} style={{ width: '100%' }}>
              <Icon.Target size={15} /> Calculate requirement
            </Button>

            {targetResult && (
              <div className="mt-4">
                {targetResult.reached ? (
                  <div className="alert success" style={{ marginBottom: 0 }}>
                    <Icon.Check size={15} />
                    <span>You are already at or above {Number(targetResult.target).toFixed(2)}.</span>
                  </div>
                ) : targetResult.possible ? (
                  <>
                    <div style={{
                      textAlign: 'center', padding: '16px 10px', borderRadius: 12,
                      background: 'var(--accent-soft)', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
                    }}>
                      <div className="stat-label">Required average per unit</div>
                      <div style={{ fontSize: '2.4rem', fontWeight: 760, letterSpacing: '-.04em', color: 'var(--accent)' }} className="tabular">
                        {fmt(targetResult.required)}
                      </div>
                      {targetResult.equivalent && (
                        <div className="muted small">
                          roughly a straight <b style={{ color: 'var(--text)' }}>{targetResult.equivalent.letter}</b> average
                          across {targetResult.remainingUnits} units
                        </div>
                      )}
                    </div>
                    {targetResult.required >= maxPoint * 0.95 && (
                      <div className="alert warn mt-3" style={{ marginBottom: 0 }}>
                        <Icon.Warn size={15} />
                        <span>That leaves almost no margin for error — a single B could put it out of reach.</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="alert danger" style={{ marginBottom: 0 }}>
                    <Icon.Warn size={15} />
                    <span>
                      Not reachable in {targetResult.remainingUnits} units — it would require a {fmt(targetResult.required)} average
                      on a {fmt(maxPoint, 1)} scale.
                      {targetResult.shortfallUnits ? ` You would need about ${targetResult.shortfallUnits} units at maximum grade instead.` : ''}
                    </span>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
