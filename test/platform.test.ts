import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { installHint } from '../src/lib/platform.ts';

const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
const APK_WEBVIEW =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36';
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const DESKTOP = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';

test('an Android browser is offered the APK, the APK itself is not', () => {
  assert.equal(installHint(CHROME_ANDROID, false), 'android');
  assert.equal(installHint(APK_WEBVIEW, false), null);
});

test('an iPhone is told to add to home screen, unless it already did', () => {
  assert.equal(installHint(IPHONE_SAFARI, false), 'ios');
  assert.equal(installHint(IPHONE_SAFARI, true), null);
});

test('a desktop browser is offered nothing', () => {
  assert.equal(installHint(DESKTOP, false), null);
});
