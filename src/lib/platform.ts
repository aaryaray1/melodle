export type InstallHint = 'android' | 'ios' | null;

/**
 * What to offer a visitor: the APK on an Android browser, Add to Home Screen on
 * an iPhone, nothing on a desktop or once they are already in the app. Android
 * WebViews (the APK itself) mark their user agent with "; wv)".
 */
export function installHint(userAgent: string, standalone: boolean): InstallHint {
  if (standalone) return null;
  if (/Android/i.test(userAgent)) return /;\s*wv\)/.test(userAgent) ? null : 'android';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  return null;
}
