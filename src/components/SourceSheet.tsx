import { useEffect, useState } from 'react';
import type { Me, ProviderId, VariantOption } from '../../shared/types.ts';
import { api } from '../lib/api.ts';
import { PartyPanel } from './PartyPanel.tsx';

interface Props {
  me: Me | null;
  source: ProviderId;
  variant: string;
  signedIn: boolean;
  onChoose: (source: ProviderId, variant: string) => void;
  onConnectLastfm: (user: string) => Promise<void>;
  onDisconnect: (provider: ProviderId) => Promise<void>;
  onSaved: () => Promise<void>;
  onOpenAccount: () => void;
}

interface Field {
  name: string;
  label: string;
  secret?: boolean;
}

interface HistoryProvider {
  id: ProviderId;
  name: string;
  blurb: string;
  fields: Field[];
  help: { href: string; label: string };
  redirect?: 'spotify' | 'youtube';
}

const HISTORY: HistoryProvider[] = [
  {
    id: 'lastfm',
    name: 'Last.fm',
    blurb: 'Everything you have scrobbled',
    fields: [{ name: 'LASTFM_API_KEY', label: 'API key' }],
    help: { href: 'https://www.last.fm/api/account/create', label: 'Create a Last.fm API account' },
  },
  {
    id: 'spotify',
    name: 'Spotify',
    blurb: 'Your top tracks, recent plays and liked songs',
    fields: [
      { name: 'SPOTIFY_CLIENT_ID', label: 'Client ID' },
      { name: 'SPOTIFY_CLIENT_SECRET', label: 'Client secret', secret: true },
    ],
    help: { href: 'https://developer.spotify.com/dashboard', label: 'Open the Spotify dashboard' },
    redirect: 'spotify',
  },
  {
    id: 'youtube',
    name: 'YouTube Music',
    blurb: 'Your likes and playlists',
    fields: [
      { name: 'GOOGLE_CLIENT_ID', label: 'Client ID' },
      { name: 'GOOGLE_CLIENT_SECRET', label: 'Client secret', secret: true },
    ],
    help: { href: 'https://console.cloud.google.com/apis/credentials', label: 'Open Google Cloud credentials' },
    redirect: 'youtube',
  },
];

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copyrow">
      <span className="copyrow-label">{label}</span>
      <code className="copyrow-value">{value}</code>
      <button
        type="button"
        className="copyrow-button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
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
  );
}

function SetupForm({
  provider,
  redirectUri,
  onSaved,
}: {
  provider: HistoryProvider;
  redirectUri: string | null;
  onSaved: () => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const complete = provider.fields.every((field) => (values[field.name] ?? '').trim().length > 0);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.saveKeys(provider.id, values);
      setValues({});
      await onSaved();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Those keys were not accepted');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="setup">
      <p className="setup-step">
        1. <a href={provider.help.href} target="_blank" rel="noreferrer noopener">{provider.help.label}</a>
      </p>
      {provider.redirect && redirectUri ? (
        <>
          <p className="setup-step">2. Add this redirect URI to the app you just made:</p>
          <CopyRow label="Redirect URI" value={redirectUri} />
        </>
      ) : null}
      <p className="setup-step">{provider.redirect ? '3.' : '2.'} Paste the keys here:</p>
      {provider.fields.map((field) => (
        <label key={field.name} className="setup-field">
          <span className="setup-label">{field.label}</span>
          <input
            className="source-input"
            type={field.secret ? 'password' : 'text'}
            autoComplete="off"
            spellCheck={false}
            value={values[field.name] ?? ''}
            onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
          />
        </label>
      ))}
      <button type="button" className="button button-primary" disabled={busy || !complete} onClick={() => void save()}>
        {busy ? 'Saving…' : 'Save keys'}
      </button>
      {error ? <p className="form-error">{error}</p> : null}
      <p className="setup-note">These are the server&apos;s keys, shared by everyone playing on it.</p>
    </div>
  );
}

function Chips({
  options,
  provider,
  source,
  variant,
  onChoose,
}: {
  options: VariantOption[];
  provider: ProviderId;
  source: ProviderId;
  variant: string;
  onChoose: (source: ProviderId, variant: string) => void;
}) {
  return (
    <div className="chips" role="group">
      {options.map((option) => {
        const active = source === provider && variant === option.id;
        return (
          <button
            key={option.id}
            type="button"
            className={active ? 'chip chip-active' : 'chip'}
            aria-pressed={active}
            onClick={() => onChoose(provider, option.id)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function SourceSheet({
  me,
  source,
  variant,
  signedIn,
  onChoose,
  onConnectLastfm,
  onDisconnect,
  onSaved,
  onOpenAccount,
}: Props) {
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openSetup, setOpenSetup] = useState<ProviderId | null>(null);
  const [redirects, setRedirects] = useState<{ spotify: string; youtube: string } | null>(null);

  useEffect(() => {
    api.redirects().then(setRedirects).catch(() => setRedirects(null));
  }, []);

  if (!me) return <p className="muted">Loading your music sources…</p>;

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConnectLastfm(username.trim());
      setUsername('');
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That did not work');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sources">
      <section className="source">
        <header className="source-head">
          <div>
            <h3 className="source-name">Popular now</h3>
            <p className="source-blurb">What the charts are playing today, overall or by genre</p>
          </div>
        </header>
        <Chips options={me.variants.charts} provider="charts" source={source} variant={variant} onChoose={onChoose} />
      </section>

      <section className="source">
        <header className="source-head">
          <div>
            <h3 className="source-name">By decade</h3>
            <p className="source-blurb">The songs that defined each decade</p>
          </div>
        </header>
        <Chips options={me.variants.decades} provider="decades" source={source} variant={variant} onChoose={onChoose} />
      </section>

      <section className="source">
        <header className="source-head">
          <div>
            <h3 className="source-name">Party</h3>
            <p className="source-blurb">Everyone who joins adds their listening to the pool</p>
          </div>
        </header>
        <PartyPanel
          party={me.party}
          signedIn={signedIn}
          source={source}
          onChanged={onSaved}
          onOpenAccount={onOpenAccount}
          onPlay={() => onChoose('party', 'all')}
        />
      </section>

      <section className="source source-history">
        <header className="source-head">
          <div>
            <h3 className="source-name">From your history</h3>
            <p className="source-blurb">Only songs you actually listen to</p>
          </div>
        </header>

        {!signedIn ? (
          <div className="gate">
            <p className="gate-text">Linking a music service needs an account, so your connection is remembered.</p>
            <button type="button" className="button button-primary" onClick={onOpenAccount}>
              Make an account
            </button>
          </div>
        ) : null}

        {HISTORY.map((provider) => {
          const state = me.connections[provider.id];
          const options = me.variants[provider.id] ?? [];
          const showSetup = openSetup === provider.id;

          return (
            <div key={provider.id} className="linked">
              <div className="linked-head">
                <div>
                  <h4 className="linked-name">{provider.name}</h4>
                  <p className="source-blurb">{provider.blurb}</p>
                </div>
                <span className={state.connected ? 'source-state source-state-on' : 'source-state'}>
                  {state.connected ? (state.account ?? 'Connected') : state.configured ? 'Not linked' : 'Needs keys'}
                </span>
              </div>

              {signedIn && state.configured && state.connected ? (
                <Chips
                  options={options}
                  provider={provider.id}
                  source={source}
                  variant={variant}
                  onChoose={onChoose}
                />
              ) : null}

              {signedIn && state.configured && !state.connected && provider.id === 'lastfm' ? (
                <div className="source-connect">
                  <input
                    className="source-input"
                    type="text"
                    value={username}
                    placeholder="Your Last.fm username"
                    onChange={(event) => setUsername(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && username.trim()) void connect();
                    }}
                  />
                  <button
                    type="button"
                    className="button button-primary"
                    disabled={busy || !username.trim()}
                    onClick={() => void connect()}
                  >
                    {busy ? 'Checking…' : 'Link'}
                  </button>
                </div>
              ) : null}

              {signedIn && state.configured && !state.connected && provider.id !== 'lastfm' ? (
                <a className="button button-primary source-oauth" href={`/api/auth/${provider.id}/start`}>
                  Link {provider.name}
                </a>
              ) : null}

              <div className="linked-actions">
                <button
                  type="button"
                  className="source-unlink"
                  aria-expanded={showSetup}
                  onClick={() => setOpenSetup(showSetup ? null : provider.id)}
                >
                  {state.configured ? 'Replace server keys' : `Add ${provider.name} keys`}
                </button>
                {state.connected ? (
                  <button type="button" className="source-unlink" onClick={() => void onDisconnect(provider.id)}>
                    Unlink
                  </button>
                ) : null}
              </div>

              {showSetup ? (
                <SetupForm
                  provider={provider}
                  redirectUri={provider.redirect && redirects ? redirects[provider.redirect] : null}
                  onSaved={async () => {
                    await onSaved();
                    setOpenSetup(null);
                  }}
                />
              ) : null}
            </div>
          );
        })}
        {error ? <p className="form-error">{error}</p> : null}
      </section>

      <p className="sources-note">
        Songs come from the list you pick here. The audio is a 30 second preview matched from Deezer or Apple Music.
        Those previews are cut from the middle of a track, not its beginning, so &ldquo;clip start&rdquo; means the
        start of that excerpt rather than the song&apos;s intro.
      </p>
    </div>
  );
}
