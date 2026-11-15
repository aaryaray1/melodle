import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportProblem } from '../lib/report.ts';

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

/**
 * Without this, one error while drawing the page leaves it blank, with nothing
 * to tap. The round is saved as it goes, so a reload picks the song straight
 * back up.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportProblem('render', error, { component: (info.componentStack ?? '').slice(0, 600) });
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="crash" role="alert">
        <h1 className="wordmark">Melodle</h1>
        <p className="crash-text">Something went wrong on this screen. Your song is saved: reload and carry on.</p>
        <button type="button" className="button button-primary" onClick={() => location.reload()}>
          Reload
        </button>
      </main>
    );
  }
}
