import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The APK ships only the launcher page. Once it knows your server's address the
 * WebView navigates there, so the phone runs the same site the browser does,
 * on the same origin, with sessions and cookies working normally.
 */
const config: CapacitorConfig = {
  appId: 'net.melodle.client',
  appName: 'Melodle',
  webDir: 'android-shell',
  android: {
    backgroundColor: '#150b26',
  },
  server: {
    // Plain http, so reaching a LAN server is not blocked as mixed content.
    androidScheme: 'http',
    cleartext: true,
    // The server address is chosen at runtime, so navigation cannot be pinned
    // to one host at build time.
    allowNavigation: ['*'],
  },
};

export default config;
