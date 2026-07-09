import { useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, GoogleAuthProvider } from 'firebase/auth';
import { auth, isFirebaseConfigured } from './firebase';
import { GOLD } from './theme';

const centered = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '14px',
  padding: '24px',
  textAlign: 'center',
};

function Mark({ size = 64 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="22" fill="none" stroke={GOLD} strokeWidth="2" />
      <ellipse cx="32" cy="32" rx="10" ry="22" fill="none" stroke={GOLD} strokeWidth="1.4" opacity="0.75" />
      <line x1="32" y1="10" x2="32" y2="54" stroke={GOLD} strokeWidth="2" />
      <line x1="10" y1="32" x2="54" y2="32" stroke={GOLD} strokeWidth="1" opacity="0.45" />
      <circle cx="32" cy="32" r="2.6" fill="#e8e8e8" />
    </svg>
  );
}

export function AuthGate({ children }) {
  const [user, setUser] = useState('loading');

  useEffect(() => {
    if (!auth) { setUser(null); return; }
    return onAuthStateChanged(auth, u => setUser(u));
  }, []);

  async function signIn() {
    if (!auth) return;
    await signInWithPopup(auth, new GoogleAuthProvider());
  }

  async function handleSignOut() {
    if (!auth) return;
    await signOut(auth);
  }

  if (!isFirebaseConfigured) {
    return (
      <div style={centered}>
        <Mark />
        <h1 style={{ fontWeight: 400, letterSpacing: '0.04em' }}>Longitude</h1>
        <p style={{ color: '#888', maxWidth: '420px', lineHeight: 1.6, fontSize: '14px' }}>
          Firebase setup required. Create a free project at{' '}
          <code style={{ color: GOLD }}>console.firebase.google.com</code>, enable
          Firestore and Google sign-in, then copy the web config into{' '}
          <code style={{ color: GOLD }}>.env.local</code> (see the README).
        </p>
      </div>
    );
  }

  if (user === 'loading') {
    return (
      <div style={centered}>
        <Mark />
        <p style={{ color: '#666', fontSize: '13px' }}>Finding your position…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={centered}>
        <Mark size={80} />
        <h1 style={{ fontWeight: 400, fontSize: '30px', letterSpacing: '0.06em' }}>Longitude</h1>
        <p style={{ color: '#888', fontSize: '14px', fontStyle: 'italic' }}>
          Marking where you are on a long trajectory.
        </p>
        <button
          onClick={signIn}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginTop: '10px',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '8px',
            color: '#e8e8e8',
            cursor: 'pointer',
            fontSize: '14px',
            padding: '11px 22px',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 002.38-5.88c0-.57-.05-.66-.15-1.18z"/>
            <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 01-7.18-2.54H1.83v2.07A8 8 0 008.98 17z"/>
            <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 010-3.04V5.41H1.83a8 8 0 000 7.18l2.67-2.07z"/>
            <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 001.83 5.4L4.5 7.49a4.77 4.77 0 014.48-3.3z"/>
          </svg>
          Sign in with Google
        </button>
      </div>
    );
  }

  return children(user, handleSignOut);
}
