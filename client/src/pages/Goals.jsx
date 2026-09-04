import { useState } from 'react';
import { useData } from '../lib/store.jsx';
import { api, fmt } from '../lib/api.js';
import { Card, Button, Badge, Modal, Field, Input, Select, Textarea, Empty, Progress, useToast, ConfirmDialog } from '../components/UI.jsx';
import Icon from '../components/Icons.jsx';

export default function Goals() {
  const { data, loading, refresh } = useData();
  const toast = useToast();
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (loading) return <div className="skeleton" style={{ height: 340 }} />;
  if (!data) return null;

  const { goalProjections, cgpa, maxPoint, projectedRemaining } = data;

  const run = async (fn, msg) => {
    setBusy(true); setError('');
    try { await fn(); await refresh(); if (msg) toast.success(msg); return true; }
    catch (e) { setError(e.message); toast.error(e.message); return false; }
    finally { setBusy(false); }
  };

  const save = async () => {
    const payload = {
      title: modal.title.trim(),
      target_cgpa: Number(modal.target_cgpa),
      target_date: modal.target_date || null,
      notes: modal.notes || '',
    };
    const ok = modal.id
      ? await run(() => api.updateGoal(modal.id, payload), 'Goal updated')
      : await run(() => api.addGoal(payload), 'Goal created');
    if (ok) setModal(null);
  };

  const toggleAchieved = (g) => run(() => api.updateGoal(g.id, { achieved: !g.achieved }), 'Goal updated');

  return (
    <>
      <div className="flex between wrap mb-4" style={{ gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.35rem' }}>Academic goals</h1>
          <p className="muted small">Current CGPA {fmt(cgpa)} · projections assume {projectedRemaining} remaining units</p>
        </div>
        <Button variant="primary" onClick={() => setModal({ title: '', target_cgpa: Math.min(maxPoint, Math.ceil(cgpa * 2) / 2 + 0.5), target_date: '', notes: '' })}>
          <Icon.Plus size={16} /> New goal
        </Button>
      </div>

      {goalProjections.length === 0 ? (
        <Empty icon="🎯" title="No goals set"
               action={<Button variant="primary" onClick={() => setModal({ title: 'Graduate with Second Class Upper', target_cgpa: 3.5, target_date: '', notes: '' })}><Icon.Plus size={16} /> Create a goal</Button>}>
          Set a target CGPA and Gradient will continuously tell you the average grade you need to get there.
        </Empty>
      ) : (
        <div className="grid cols-2">
          {goalProjections.map((g) => {
            const pct = Math.min(100, (cgpa / g.target_cgpa) * 100);
            const done = g.achieved || g.reached;
            return (
              <Card key={g.id}>
                <div className="card-head">
                  <div style={{ flex: 1 }}>
                    <h3>{g.title}</h3>
                    <p>Target CGPA {Number(g.target_cgpa).toFixed(2)}{g.target_date ? ` · by ${g.target_date}` : ''}</p>
                  </div>
                  {done ? <Badge tone="success">Achieved</Badge>
                    : g.projection.possible ? <Badge tone="accent">In play</Badge>
                    : <Badge tone="danger">At risk</Badge>}
                </div>

                <div className="flex between small mb-3">
                  <span className="muted">Progress</span>
                  <span className="tabular"><b>{fmt(cgpa)}</b> <span className="muted">/ {Number(g.target_cgpa).toFixed(2)}</span></span>
                </div>
                <Progress value={pct} tone={done ? 'success' : pct > 85 ? '' : 'warn'} />

                <div className="mt-4">
                  {done ? (
                    <div className="alert success" style={{ marginBottom: 0 }}>
                      <Icon.Check size={15} /><span>You have reached this target. Maintain a {fmt(g.target_cgpa)} average to hold it.</span>
                    </div>
                  ) : g.projection.possible ? (
                    <div className="alert info" style={{ marginBottom: 0 }}>
                      <Icon.Target size={15} />
                      <span>Average <b>{fmt(g.projection.required)}</b> per unit over your next {projectedRemaining} units to get there.</span>
                    </div>
                  ) : (
                    <div className="alert danger" style={{ marginBottom: 0 }}>
                      <Icon.Warn size={15} />
                      <span>Out of reach within {projectedRemaining} units{g.projection.shortfallUnits ? ` — about ${g.projection.shortfallUnits} units at top grade would be needed` : ''}.</span>
                    </div>
                  )}
                </div>

                {g.notes && <p className="muted small mt-3">{g.notes}</p>}

                <div className="flex mt-4" style={{ gap: 8 }}>
                  <Button size="sm" onClick={() => toggleAchieved(g)}>
                    <Icon.Check size={14} /> {g.achieved ? 'Mark unachieved' : 'Mark achieved'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setModal({ ...g })}><Icon.Edit size={14} /> Edit</Button>
                  <div style={{ flex: 1 }} />
                  <button className="icon-btn" onClick={() => setConfirm(g)} title="Delete goal"><Icon.Trash size={14} /></button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Edit goal' : 'New goal'}
             footer={<>
               <Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
               <Button variant="primary" onClick={save} loading={busy}>{modal?.id ? 'Save' : 'Create goal'}</Button>
             </>}>
        {error && <div className="alert danger">{error}</div>}
        <Field label="Goal">
          <Input value={modal?.title || ''} autoFocus placeholder="Graduate with First Class"
                 onChange={(e) => setModal((m) => ({ ...m, title: e.target.value }))} />
        </Field>
        <div className="field-row">
          <Field label="Target CGPA">
            <Input type="number" min="0" max={maxPoint} step="0.05" value={modal?.target_cgpa ?? ''}
                   onChange={(e) => setModal((m) => ({ ...m, target_cgpa: e.target.value }))} />
          </Field>
          <Field label="By when" hint="Optional">
            <Input value={modal?.target_date || ''} placeholder="e.g. 2026/2027 Second Semester"
                   onChange={(e) => setModal((m) => ({ ...m, target_date: e.target.value }))} />
          </Field>
        </div>
        <Field label="Notes" hint="Optional context for yourself.">
          <Textarea value={modal?.notes || ''} onChange={(e) => setModal((m) => ({ ...m, notes: e.target.value }))} />
        </Field>
      </Modal>

      <ConfirmDialog open={!!confirm} busy={busy} title="Delete goal?"
                     message={`"${confirm?.title}" will be removed.`}
                     onCancel={() => setConfirm(null)}
                     onConfirm={async () => { const ok = await run(() => api.deleteGoal(confirm.id), 'Goal deleted'); if (ok) setConfirm(null); }} />
    </>
  );
}
