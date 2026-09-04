import { NavLink, useLocation } from 'react-router-dom';
import Icon from './Icons.jsx';
import { useAuth, useTheme } from '../lib/store.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', icon: Icon.Dashboard, end: true, group: 'Overview' },
  { to: '/records', label: 'Records', icon: Icon.Records, group: 'Overview' },
  { to: '/insights', label: 'Insights', icon: Icon.Insights, group: 'Intelligence' },
  { to: '/simulator', label: 'Simulator', icon: Icon.Simulator, group: 'Intelligence' },
  { to: '/goals', label: 'Goals', icon: Icon.Target, group: 'Intelligence' },
  { to: '/transcript', label: 'Transcript', icon: Icon.Doc, group: 'Documents' },
  { to: '/settings', label: 'Settings', icon: Icon.Settings, group: 'Documents' },
];

const MOBILE = ['/', '/records', '/insights', '/simulator', '/transcript'];

const TITLES = {
  '/': ['Dashboard', 'Your academic standing at a glance'],
  '/records': ['Academic Records', 'Sessions, semesters, courses and grades'],
  '/insights': ['Academic Insights', 'What is helping and what is hurting your CGPA'],
  '/simulator': ['What-If Simulator', 'Model future grades before you sit the exams'],
  '/goals': ['Goals', 'Targets and the grades required to reach them'],
  '/transcript': ['Transcript & Exports', 'Generate a formatted transcript or export raw data'],
  '/settings': ['Settings', 'Profile, grading scale and account security'],
};

export default function Layout({ children }) {
  const { user, profile, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { pathname } = useLocation();
  const [title, subtitle] = TITLES[pathname] || ['Gradient', ''];

  const groups = NAV.reduce((acc, item) => {
    (acc[item.group] ||= []).push(item);
    return acc;
  }, {});

  const initials = (profile?.full_name || user?.email || '?')
    .split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join('');

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">G</div>
          <div>
            <div className="brand-name">Gradient</div>
            <div className="brand-sub">Academic Tracker</div>
          </div>
        </div>

        {Object.entries(groups).map(([group, items]) => (
          <div key={group}>
            <div className="nav-group-label">{group}</div>
            {items.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end}
                       className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <item.icon size={17} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}

        <div style={{ flex: 1 }} />
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12 }}>
          <div className="flex" style={{ gap: 10, padding: '4px 6px 10px' }}>
            <div style={{
              width: 32, height: 32, borderRadius: 9, flexShrink: 0, display: 'grid', placeItems: 'center',
              background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 700, fontSize: '.78rem',
            }}>{initials}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '.82rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {profile?.full_name || 'Student'}
              </div>
              <div className="muted" style={{ fontSize: '.7rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.email}
              </div>
            </div>
          </div>
          <button className="nav-item" onClick={logout} style={{ width: '100%' }}>
            <Icon.Logout size={17} /><span>Sign out</span>
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div>
            <div className="topbar-title">{title}</div>
            {subtitle && <div className="topbar-sub">{subtitle}</div>}
          </div>
          <div className="spacer" />
          <button className="icon-btn" onClick={toggle} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
            {theme === 'dark' ? <Icon.Sun size={16} /> : <Icon.Moon size={16} />}
          </button>
        </header>

        <div className="page">{children}</div>
      </div>

      <nav className="mobile-nav">
        {NAV.filter((n) => MOBILE.includes(n.to)).map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end}
                   className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <item.icon size={19} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
