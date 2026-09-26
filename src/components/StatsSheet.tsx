import { STAGE_DURATIONS, type Stats } from '../../shared/types.ts';

interface Props {
  stats: Stats;
  highlight: number | null;
  signedIn: boolean;
}

export function StatsSheet({ stats, highlight, signedIn }: Props) {
  const winRate = stats.played ? Math.round((stats.won / stats.played) * 100) : 0;
  const most = Math.max(1, ...stats.byStage);

  return (
    <div className="stats">
      <div className="tiles">
        <div className="tile">
          <span className="tile-value">{stats.played}</span>
          <span className="tile-label">played</span>
        </div>
        <div className="tile">
          <span className="tile-value">{winRate}%</span>
          <span className="tile-label">spotted</span>
        </div>
        <div className="tile">
          <span className="tile-value">{stats.streak}</span>
          <span className="tile-label">streak</span>
        </div>
        <div className="tile">
          <span className="tile-value">{stats.bestStreak}</span>
          <span className="tile-label">best streak</span>
        </div>
      </div>

      <table className="dist">
        <caption className="dist-caption">Where you spotted the song</caption>
        <tbody>
          {STAGE_DURATIONS.map((seconds, index) => {
            const count = stats.byStage[index] ?? 0;
            const share = stats.won ? Math.round((count / stats.won) * 100) : 0;
            return (
              <tr key={seconds} className={highlight === index ? 'dist-row dist-row-live' : 'dist-row'}>
                <th scope="row" className="dist-stage">
                  {seconds}s
                </th>
                <td className="dist-cell">
                  <span
                    className="dist-bar"
                    style={{ width: `${(count / most) * 100}%` }}
                    title={`${count} of ${stats.won} wins (${share}%)`}
                  />
                </td>
                <td className="dist-count">{count}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {stats.played === 0 ? <p className="muted">Nothing here yet. Play a round and this fills in.</p> : null}
      <p className="setup-note">
        {signedIn
          ? 'Saved to your account, so it follows you to any browser.'
          : 'Kept in this browser only. Make an account to keep it anywhere.'}
      </p>
    </div>
  );
}
