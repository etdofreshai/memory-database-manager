import React, { useState, useEffect } from 'react';

export default function LoginGate({ children }: { children: React.ReactNode }) {
  const [authRequired, setAuthRequired] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/auth/status')
      .then(r => r.json())
      .then(data => {
        if (!data.required) {
          setAuthenticated(true);
        } else {
          // Check if we already have a valid session cookie
          setAuthRequired(true);
          // Try a lightweight API call to see if cookie is still valid
          fetch('/service-config').then(r => {
            if (r.ok) {
              setAuthenticated(true);
            }
            setLoading(false);
          }).catch(() => setLoading(false));
        }
        if (!data.required) setLoading(false);
      })
      .catch(() => {
        // If we can't reach auth status, assume no auth needed
        setAuthenticated(true);
        setLoading(false);
      });
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.ok) {
        setAuthenticated(true);
        setPassword('');
      } else {
        setError(data.error || 'Invalid password');
      }
    } catch {
      setError('Login request failed');
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#1a1a2e', color: '#eee' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>🧠</div>
          <div>Loading...</div>
        </div>
      </div>
    );
  }

  if (!authRequired || authenticated) {
    return <>{children}</>;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#1a1a2e' }}>
      <form onSubmit={handleLogin} style={{
        background: '#16213e',
        padding: 40,
        borderRadius: 12,
        width: 340,
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🧠</div>
          <h2 style={{ margin: 0, color: '#eee', fontWeight: 600 }}>Data Hub</h2>
          <p style={{ margin: '8px 0 0', color: '#888', fontSize: 14 }}>Enter password to continue</p>
        </div>

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoFocus
          style={{
            width: '100%',
            padding: '12px 16px',
            border: '1px solid #333',
            borderRadius: 8,
            background: '#0f3460',
            color: '#eee',
            fontSize: 15,
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />

        {error && (
          <div style={{ color: '#e74c3c', fontSize: 13, marginTop: 8, textAlign: 'center' }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          style={{
            width: '100%',
            padding: 12,
            marginTop: 16,
            background: '#0f3460',
            color: '#eee',
            border: '1px solid #1a5276',
            borderRadius: 8,
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Sign In
        </button>
      </form>
    </div>
  );
}
