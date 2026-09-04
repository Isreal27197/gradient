import { useState } from 'react';
import { useAuth } from '../lib/store.jsx';
import { Field, Input, Button, Card } from '../components/UI.jsx';
import Icon from '../components/Icons.jsx';

const FEATURES = [
  { icon: Icon.Trend, title: 'Live GPA & CGPA', body: 'Every course you enter recalculates your semester GPA and cumulative CGPA instantly on a configurable 5.0 scale.' },
  { icon: Icon.Insights, title: 'Academic intelligence', body: 'See exactly which courses are dragging your CGPA down and what average you need to hit First Class.' },
  { icon: Icon.Simulator, title: 'What-if forecasting', body: 'Test hypothetical grades before results are released and know your ceiling ahead of time.' },
  { icon: Icon.Doc, title: 'Transcript generation', body: 'Produce a clean, printable PDF transcript of your full academic history in one click.' },
];

export default function AuthPage() {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ fullName: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') await login({ email: form.email, password: form.password });
      else await signup(form);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <aside className="auth-aside">
        <div>
          <div className="brand" style={{ padding: 0, marginBottom: 34 }}>
            <div className="brand-mark">G</div>
            <div>
              <div className="brand-name">Gradient</div>
              <div className="brand-sub">Academic Tracker</div>
            </div>
          </div>
          <h1 style={{ fontSize: '2.05rem', maxWidth: '15ch', lineHeight: 1.15 }}>
            Know your CGPA before your school does.
          </h1>
          <p className="muted" style={{ marginTop: 12, maxWidth: '46ch', fontSize: '.94rem' }}>
            A complete record of every session, semester and course — with the analysis
            that tells you what to do next.
          </p>

          <div style={{ marginTop: 30 }}>
            {FEATURES.map((f) => (
              <div className="auth-feature" key={f.title}>
                <div className="auth-feature-icon"><f.icon size={17} /></div>
                <div>
                  <h4>{f.title}</h4>
                  <p>{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="muted" style={{ fontSize: '.76rem' }}>
          Your records are stored privately in your own account and never shared.
        </p>
      </aside>

      <main className="auth-form-side">
        <div className="auth-card">
          <div className="tabs">
            <button className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>Sign in</button>
            <button className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setError(''); }}>Create account</button>
          </div>

          <Card>
            <h2 style={{ marginBottom: 4 }}>{mode === 'login' ? 'Welcome back' : 'Get started'}</h2>
            <p className="muted small" style={{ marginBottom: 20 }}>
              {mode === 'login'
                ? 'Sign in to continue tracking your academic performance.'
                : 'Create an account to start recording your results.'}
            </p>

            {error && <div className="alert danger"><Icon.Warn size={15} /><span>{error}</span></div>}

            <form onSubmit={submit}>
              {mode === 'signup' && (
                <Field label="Full name">
                  <Input value={form.fullName} onChange={set('fullName')} placeholder="Ada Chukwu" required autoComplete="name" />
                </Field>
              )}
              <Field label="Email address">
                <Input type="email" value={form.email} onChange={set('email')} placeholder="you@university.edu" required autoComplete="email" />
              </Field>
              <Field label="Password" hint={mode === 'signup' ? 'At least 8 characters.' : undefined}>
                <Input type="password" value={form.password} onChange={set('password')} placeholder="••••••••" required
                       minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
              </Field>

              <Button type="submit" variant="primary" className="block" loading={busy} style={{ width: '100%', marginTop: 4 }}>
                {mode === 'login' ? 'Sign in' : 'Create account'}
              </Button>
            </form>

            <div className="flex" style={{ gap: 7, marginTop: 16, color: 'var(--muted)', fontSize: '.76rem' }}>
              <Icon.Shield size={14} />
              <span>Passwords are hashed with bcrypt. Sessions use signed, http-only cookies.</span>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
