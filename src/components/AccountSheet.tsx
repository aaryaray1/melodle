import { useState } from 'react';
import type { AccountApi } from '../game/useAccount.ts';

interface Props {
  account: AccountApi;
  onDone: () => void;
}

export function AccountSheet({ account, onDone }: Props) {
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [invite, setInvite] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = account.me?.account;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'register') await account.register(username.trim(), password, invite.trim());
      else await account.signIn(username.trim(), password);
      setUsername('');
      setPassword('');
      setInvite('');
      onDone();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That did not work');
    } finally {
      setBusy(false);
    }
  };

  if (current) {
    return (
      <div className="account">
        <p className="account-who">
          Signed in as <strong>{current.username}</strong>
        </p>
        <p className="muted">
          Your stats, your liked and disliked songs, and your linked services all live on this account, so they
          follow you to any browser.
        </p>
        <button
          type="button"
          className="button"
          onClick={async () => {
            await account.signOut();
            onDone();
          }}
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="account">
      <div className="modes" role="group" aria-label="Account action">
        <button
          type="button"
          className={mode === 'signin' ? 'mode mode-active' : 'mode'}
          aria-pressed={mode === 'signin'}
          onClick={() => setMode('signin')}
        >
          Sign in
        </button>
        <button
          type="button"
          className={mode === 'register' ? 'mode mode-active' : 'mode'}
          aria-pressed={mode === 'register'}
          onClick={() => setMode('register')}
        >
          Make an account
        </button>
      </div>

      <p className="muted">
        {mode === 'register'
          ? 'An account keeps your stats and lets you link Spotify, YouTube Music or Last.fm.'
          : 'Welcome back. Your stats and linked services are waiting.'}
      </p>

      <form
        className="account-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (username.trim() && password) void submit();
        }}
      >
        <label className="setup-field">
          <span className="setup-label">Username</span>
          <input
            className="source-input"
            type="text"
            autoComplete="username"
            spellCheck={false}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        <label className="setup-field">
          <span className="setup-label">Password</span>
          <input
            className="source-input"
            type="password"
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {mode === 'register' && account.me?.invitesRequired ? (
          <label className="setup-field">
            <span className="setup-label">Invite code</span>
            <input
              className="source-input"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={invite}
              onChange={(event) => setInvite(event.target.value)}
            />
          </label>
        ) : null}
        <button type="submit" className="button button-primary" disabled={busy || !username.trim() || !password}>
          {busy ? 'One moment…' : mode === 'register' ? 'Create account' : 'Sign in'}
        </button>
      </form>

      {error ? <p className="form-error">{error}</p> : null}
      <p className="setup-note">
        Accounts are stored in Melodle&apos;s own database on this machine. Passwords are hashed with scrypt.
      </p>
    </div>
  );
}
