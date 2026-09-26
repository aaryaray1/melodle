import { useState } from 'react';
import type { Party, ProviderId } from '../../shared/types.ts';
import { api } from '../lib/api.ts';

interface Props {
  party: Party | null;
  signedIn: boolean;
  source: ProviderId;
  onChanged: () => Promise<void>;
  onPlay: () => void;
  onOpenAccount: () => void;
}

const SOURCE_NAMES: Record<string, string> = {
  spotify: 'Spotify',
  lastfm: 'Last.fm',
  youtube: 'YouTube Music',
};

export function PartyPanel({ party, signedIn, source, onChanged, onOpenAccount, onPlay }: Props) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
      setName('');
      setCode('');
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That did not work');
    } finally {
      setBusy(false);
    }
  };

  if (!signedIn) {
    return (
      <div className="gate">
        <p className="gate-text">A party needs an account, so everyone knows whose songs are whose.</p>
        <button type="button" className="button button-primary" onClick={onOpenAccount}>
          Make an account
        </button>
      </div>
    );
  }

  if (party) {
    const linked = party.members.filter((member) => member.source).length;
    return (
      <div className="party">
        <div className="party-code">
          <div>
            <span className="party-code-label">Party code</span>
            <strong className="party-code-value">{party.code}</strong>
          </div>
          <button
            type="button"
            className="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(party.code);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1600);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className="muted">Anyone with this code can join and add their listening to the mix.</p>

        <ul className="party-members">
          {party.members.map((member) => (
            <li key={member.username} className="party-member">
              <span className="party-member-name">
                {member.username}
                {member.isHost ? <span className="party-host"> host</span> : null}
              </span>
              <span className={member.source ? 'party-member-source party-member-on' : 'party-member-source'}>
                {member.source ? SOURCE_NAMES[member.source] : 'no music linked'}
              </span>
            </li>
          ))}
        </ul>

        {linked === 0 ? (
          <p className="form-error">Nobody has linked a music service yet, so there is nothing to play.</p>
        ) : (
          <button
            type="button"
            className={source === 'party' ? 'chip chip-active' : 'chip'}
            aria-pressed={source === 'party'}
            onClick={onPlay}
          >
            Play from the party
          </button>
        )}

        <button type="button" className="source-unlink" disabled={busy} onClick={() => void run(api.leaveParty)}>
          {party.youAreHost ? 'End the party' : 'Leave the party'}
        </button>
        {error ? <p className="form-error">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="party">
      <div className="party-start">
        <label className="setup-field">
          <span className="setup-label">Start one</span>
          <div className="source-connect">
            <input
              className="source-input"
              type="text"
              placeholder="Party name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void run(() => api.createParty(name.trim() || 'Listening party'));
              }}
            />
            <button
              type="button"
              className="button button-primary"
              disabled={busy}
              onClick={() => void run(() => api.createParty(name.trim() || 'Listening party'))}
            >
              Create
            </button>
          </div>
        </label>

        <label className="setup-field">
          <span className="setup-label">Or join one</span>
          <div className="source-connect">
            <input
              className="source-input party-input-code"
              type="text"
              placeholder="Party code"
              maxLength={8}
              autoCapitalize="characters"
              spellCheck={false}
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && code.trim()) void run(() => api.joinParty(code.trim()));
              }}
            />
            <button
              type="button"
              className="button"
              disabled={busy || !code.trim()}
              onClick={() => void run(() => api.joinParty(code.trim()))}
            >
              Join
            </button>
          </div>
        </label>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
