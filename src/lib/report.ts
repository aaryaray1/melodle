/**
 * Sends a crash or an unhandled error to the server log. Nobody can watch a
 * phone's console, so this is how a blank page gets explained afterwards. A few
 * per page load is plenty; a loop of errors must not become a flood.
 */
const LIMIT = 5;
let sent = 0;

export function reportProblem(kind: string, problem: unknown, extra: Record<string, string> = {}): void {
  if (sent >= LIMIT) return;
  sent += 1;
  const error = problem instanceof Error ? problem : new Error(String(problem));
  const body = JSON.stringify({
    kind,
    message: error.message.slice(0, 500),
    stack: (error.stack ?? '').slice(0, 1500),
    url: location.pathname + location.search,
    ...extra,
  });
  try {
    if (!navigator.sendBeacon?.('/api/client-log', new Blob([body], { type: 'application/json' }))) {
      void fetch('/api/client-log', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(
        () => undefined,
      );
    }
  } catch {
    // Reporting must never itself be a problem.
  }
}

export function watchForProblems(): void {
  window.addEventListener('error', (event) => reportProblem('error', event.error ?? event.message));
  window.addEventListener('unhandledrejection', (event) => reportProblem('rejection', event.reason));
}
