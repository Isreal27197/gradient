import { useState, useEffect } from 'react';
import { useAuth, useData, useTheme } from '../lib/store.jsx';
import { api } from '../lib/api.js';
import { Card, Button, Badge, Field, Input, Select, useToast } from '../components/UI.jsx';
import Icon from '../components/Icons.jsx';

const LEVELS = ['100 Level', '200 Level', '300 Level', '400 Level', '500 Level', '600 Level', 'Graduated'];

export default function Settings() {
  const { profile, refreshUser, user } = useAuth();
  const { refresh } = useData();
  const { theme, toggle } = useTheme();
  const toast = useToast();

  const [form, setForm] = useState({});
  const [scales, setScales] = useState([]);
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => {
    setForm({
      full_name: profile?.full_name || '',
      matric_number: profile?.matric_number || '',
      university: profile?.university || '',
      faculty: profile?.faculty || '',
      department: profile?.department || '',
      programme: profile?.programme || '',
      level: profile?.level || '',
      entry_year: profile?.entry_year || '',
      scale_id: profile?.scale_id || '',
    });
  }, [profile]);

  useEffect(() => { api.scales().then((r) => setScales(r.scales)).catch(() => {}); }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form };
      payload.entry_year = payload.entry_year === '' ? null : Number(payload.entry_year);
      if (!payload.scale_id) delete payload.scale_id;
      await api.saveProfile(payload);
      await refreshUser();
      await refresh();
      toast.success('Profile saved');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setPwBusy(true);
    try {
      await api.changePassword(pw);
      setPw({ currentPassword: '', newPassword: '' });
      toast.success('Password updated');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPwBusy(false);
    }
  };

  const activeScale = scales.find((s) => String(s.id) === String(form.scale_id)) || scales[0];

  return (
    <div className="grid dash">
      <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
        <Card>
          <div className="card-head">
            <div style={{ flex: 1 }}>
              <h3>Student profile</h3>
              <p>These details appear on your generated transcript.</p>
            </div>
          </div>
          <form onSubmit={save}>
            <div className="field-row">
              <Field label="Full name"><Input value={form.full_name || ''} onChange={set('full_name')} placeholder="Ada Chukwu" /></Field>
              <Field label="Matriculation number"><Input value={form.matric_number || ''} onChange={set('matric_number')} placeholder="U2021/5570099" /></Field>
            </div>
            <Field label="University"><Input value={form.university || ''} onChange={set('university')} placeholder="University of Lagos" /></Field>
            <div className="field-row">
              <Field label="Faculty"><Input value={form.faculty || ''} onChange={set('faculty')} placeholder="Faculty of Science" /></Field>
              <Field label="Department"><Input value={form.department || ''} onChange={set('department')} placeholder="Computer Science" /></Field>
            </div>
            <Field label="Programme"><Input value={form.programme || ''} onChange={set('programme')} placeholder="B.Sc. Computer Science" /></Field>
            <div className="field-row">
              <Field label="Current level">
                <Select value={form.level || ''} onChange={set('level')}>
                  <option value="">Not specified</option>
                  {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </Select>
              </Field>
              <Field label="Year of entry">
                <Input type="number" min="1900" max="2200" value={form.entry_year || ''} onChange={set('entry_year')} placeholder="2021" />
              </Field>
            </div>
            <Button type="submit" variant="primary" loading={saving}>Save profile</Button>
          </form>
        </Card>

        <Card>
          <div className="card-head">
            <div style={{ flex: 1 }}>
              <h3>Grading scale</h3>
              <p>All GPA calculations and grade validation follow this scale.</p>
            </div>
          </div>
          <Field label="Active scale">
            <Select value={form.scale_id || ''} onChange={(e) => setForm((f) => ({ ...f, scale_id: e.target.value }))}>
              {scales.map((s) => <option key={s.id} value={s.id}>{s.name} (max {Number(s.max_point).toFixed(1)})</option>)}
            </Select>
          </Field>

          {activeScale && (
            <div className="table-wrap mt-3">
              <table className="data">
                <thead><tr><th>Grade</th><th className="num">Points</th><th className="num">Score range</th><th>Outcome</th></tr></thead>
                <tbody>
                  {activeScale.grades.map((g) => (
                    <tr key={g.id}>
                      <td><span className="grade-pill g-mid">{g.letter}</span></td>
                      <td className="num tabular">{Number(g.points).toFixed(1)}</td>
                      <td className="num tabular muted">{g.min_score != null ? `${g.min_score} – ${g.max_score}` : '—'}</td>
                      <td>{g.is_pass ? <Badge tone="success">Pass</Badge> : <Badge tone="danger">Fail</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Button variant="primary" onClick={save} loading={saving} style={{ marginTop: 14 }}>
            Apply grading scale
          </Button>
          <p className="muted small mt-3">
            Changing scale recalculates every GPA. Grades that do not exist on the new scale will need correcting in Records.
          </p>
        </Card>
      </div>

      <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
        <Card>
          <div className="card-head">
            <div style={{ flex: 1 }}>
              <h3>Appearance</h3>
              <p>Theme preference is remembered on this device.</p>
            </div>
          </div>
          <div className="flex between" style={{
            padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--panel-2)',
          }}>
            <div className="flex" style={{ gap: 10 }}>
              {theme === 'dark' ? <Icon.Moon size={17} /> : <Icon.Sun size={17} />}
              <div>
                <div style={{ fontWeight: 600, fontSize: '.88rem' }}>{theme === 'dark' ? 'Dark' : 'Light'} mode</div>
                <div className="muted small">Switch the interface theme</div>
              </div>
            </div>
            <Button size="sm" onClick={toggle}>Switch</Button>
          </div>
        </Card>

        <Card>
          <div className="card-head">
            <div style={{ flex: 1 }}>
              <h3>Account security</h3>
              <p>Signed in as {user?.email}</p>
            </div>
          </div>
          <form onSubmit={changePassword}>
            <Field label="Current password">
              <Input type="password" value={pw.currentPassword} autoComplete="current-password"
                     onChange={(e) => setPw((p) => ({ ...p, currentPassword: e.target.value }))} required />
            </Field>
            <Field label="New password" hint="Minimum 8 characters.">
              <Input type="password" value={pw.newPassword} autoComplete="new-password" minLength={8}
                     onChange={(e) => setPw((p) => ({ ...p, newPassword: e.target.value }))} required />
            </Field>
            <Button type="submit" loading={pwBusy}><Icon.Lock size={15} /> Update password</Button>
          </form>
          <div className="divider" />
          <div className="flex" style={{ gap: 9, alignItems: 'flex-start' }}>
            <Icon.Shield size={16} style={{ color: 'var(--success)', flexShrink: 0, marginTop: 2 }} />
            <p className="muted small">
              Passwords are stored as bcrypt hashes with a per-password salt. Sessions use a signed,
              http-only cookie that JavaScript cannot read, and every API request is scoped to your user id.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
