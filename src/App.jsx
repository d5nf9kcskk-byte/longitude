import { Routes, Route, NavLink } from 'react-router';
import { AuthGate } from './AuthGate';
import { GOLD } from './theme';
import Home from './Home';
import SeasonPlanner from './modules/SeasonPlanner';
import SchwarzWorkbench from './modules/SchwarzWorkbench';
import SyllabusEssentials from './modules/SyllabusEssentials';
import RecruitmentTracker from './modules/RecruitmentTracker';
import PracticeLog from './modules/PracticeLog';
import IdeaCapture from './modules/IdeaCapture';
import TaskBoard from './modules/TaskBoard';

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/season', label: 'Season' },
  { to: '/workbench', label: 'Workbench' },
  { to: '/syllabi', label: 'Syllabi' },
  { to: '/recruiting', label: 'Recruiting' },
  { to: '/practice', label: 'Study' },
  { to: '/ideas', label: 'Ideas' },
  { to: '/tasks', label: 'Tasks' },
];

export default function App() {
  return (
    <AuthGate>
      {(user, signOutFn) => (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
          <header style={{
            display: 'flex',
            alignItems: 'center',
            gap: '18px',
            padding: '0 20px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            position: 'sticky',
            top: 0,
            background: 'rgba(15,16,20,0.92)',
            backdropFilter: 'blur(6px)',
            zIndex: 10,
          }}>
            <NavLink to="/" style={{
              display: 'flex',
              alignItems: 'center',
              gap: '9px',
              textDecoration: 'none',
              color: '#e8e8e8',
              padding: '12px 0',
              flexShrink: 0,
            }}>
              <svg width="22" height="22" viewBox="0 0 64 64" aria-hidden="true">
                <circle cx="32" cy="32" r="22" fill="none" stroke={GOLD} strokeWidth="3" />
                <ellipse cx="32" cy="32" rx="10" ry="22" fill="none" stroke={GOLD} strokeWidth="2" opacity="0.75" />
                <line x1="32" y1="10" x2="32" y2="54" stroke={GOLD} strokeWidth="3" />
              </svg>
              <span style={{ fontSize: '16px', letterSpacing: '0.08em' }}>LONGITUDE</span>
            </NavLink>

            <nav style={{
              display: 'flex',
              gap: '2px',
              overflowX: 'auto',
              flex: 1,
              scrollbarWidth: 'none',
            }}>
              {NAV.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  style={({ isActive }) => ({
                    color: isActive ? '#e8e8e8' : '#666',
                    borderBottom: isActive ? `2px solid ${GOLD}` : '2px solid transparent',
                    textDecoration: 'none',
                    fontSize: '13px',
                    padding: '14px 12px 12px',
                    whiteSpace: 'nowrap',
                    transition: 'color 0.15s',
                  })}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>

            <button
              onClick={signOutFn}
              title={user.email}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '6px',
                color: '#666',
                cursor: 'pointer',
                fontSize: '11px',
                padding: '5px 10px',
                flexShrink: 0,
              }}
            >
              Sign out
            </button>
          </header>

          <main style={{ flex: 1 }}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/season" element={<SeasonPlanner />} />
              <Route path="/workbench" element={<SchwarzWorkbench />} />
              <Route path="/syllabi" element={<SyllabusEssentials />} />
              <Route path="/recruiting" element={<RecruitmentTracker />} />
              <Route path="/practice" element={<PracticeLog />} />
              <Route path="/ideas" element={<IdeaCapture />} />
              <Route path="/tasks" element={<TaskBoard />} />
            </Routes>
          </main>
        </div>
      )}
    </AuthGate>
  );
}
