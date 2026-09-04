import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth, DataProvider } from './lib/store.jsx';
import Layout from './components/Layout.jsx';
import AuthPage from './pages/Auth.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Records from './pages/Records.jsx';
import Insights from './pages/Insights.jsx';
import Simulator from './pages/Simulator.jsx';
import Goals from './pages/Goals.jsx';
import Transcript from './pages/Transcript.jsx';
import Settings from './pages/Settings.jsx';

function Booting() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div className="brand-mark" style={{ margin: '0 auto 14px', width: 44, height: 44, fontSize: 19 }}>G</div>
        <div className="muted small">Loading your records…</div>
      </div>
    </div>
  );
}

export default function App() {
  const { user, booting } = useAuth();

  if (booting) return <Booting />;
  if (!user) return <AuthPage />;

  return (
    <DataProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/records" element={<Records />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/simulator" element={<Simulator />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/transcript" element={<Transcript />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </DataProvider>
  );
}
