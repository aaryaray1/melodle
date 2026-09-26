import { networkInterfaces } from 'node:os';
import { env, hasEphemeralSecret } from './lib/env.ts';
import { app } from './app.ts';

function lanAddresses(): string[] {
  const found: string[] = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) found.push(entry.address);
    }
  }
  return found;
}

// One bad preview download must never take the whole game offline again.
process.on('uncaughtException', (problem) => console.error('[melodle] uncaught', problem));
process.on('unhandledRejection', (problem) => console.error('[melodle] unhandled rejection', problem));

app.listen(env.port, env.host, () => {
  console.log(`[melodle] api on http://127.0.0.1:${env.port}`);
  if (env.host === '0.0.0.0') {
    for (const address of lanAddresses()) {
      console.log(`[melodle] reachable on this network at http://${address}:${env.port}`);
    }
  }
  if (env.isProduction) console.log('[melodle] serving the built app on the same port');
  if (hasEphemeralSecret) {
    console.log('[melodle] SESSION_SECRET is unset, so connections drop on restart');
  }
});
