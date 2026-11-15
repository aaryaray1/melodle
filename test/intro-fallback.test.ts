import { strict as assert } from 'node:assert';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

// A stand-in for yt-dlp that fails the way it is told to, and logs every call.
const dir = mkdtempSync(path.join(tmpdir(), 'melodle-yt-'));
const calls = path.join(dir, 'calls.log');
const mode = path.join(dir, 'mode');
writeFileSync(calls, '');
writeFileSync(mode, 'flaky');
const ytdlp = path.join(dir, 'yt-dlp');
writeFileSync(
  ytdlp,
  `#!/bin/sh
echo "$@" >> ${calls}
if grep -q bot ${mode}; then
  echo "ERROR: [youtube] abc: Sign in to confirm you're not a bot. Use --cookies-from-browser" >&2; exit 1
fi
echo "ERROR: HTTP Error 500: Internal Server Error" >&2; exit 1
`,
);
chmodSync(ytdlp, 0o755);
process.env.YT_DLP_PATH = ytdlp;
process.env.DATA_FILE = path.join(dir, 'intro.db');
const { introFile, IntroUnavailable } = await import('../server/lib/intro.ts');
after(() => rmSync(dir, { recursive: true, force: true }));

const song = { title: 'Song', artist: 'Artist', duration: 200 };

test('an ordinary failure does not stop the next song from trying', async () => {
  await assert.rejects(introFile('201', song), IntroUnavailable);
  writeFileSync(calls, '');
  await assert.rejects(introFile('202', song), IntroUnavailable);
  assert.notEqual(readFileSync(calls, 'utf8'), '', 'YouTube was asked again');
});

test("once YouTube refuses as a bot, song starts pause: the next song is refused at once, without asking", async () => {
  writeFileSync(mode, 'bot');
  await assert.rejects(introFile('203', song), IntroUnavailable);
  writeFileSync(calls, '');
  const started = Date.now();
  await assert.rejects(introFile('204', song), IntroUnavailable);
  assert.equal(readFileSync(calls, 'utf8'), '', 'YouTube was not asked');
  assert.ok(Date.now() - started < 200, 'the refusal is immediate, so the preview plays straight away');
});

test('an opening already stored still plays while song starts are paused', async () => {
  const intros = path.join(dir, 'intros');
  mkdirSync(intros, { recursive: true });
  writeFileSync(path.join(intros, '205.mp3'), 'mp3');
  const file = await introFile('205', song);
  assert.ok(file && existsSync(file));
});
