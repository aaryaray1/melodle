import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { RateWindow } from '../server/lib/http.ts';

test('requests beyond the window limit wait for the window to roll over', async () => {
  const window = new RateWindow(3, 300);
  const started: number[] = [];
  const t0 = Date.now();
  await Promise.all(
    Array.from({ length: 7 }, async () => {
      await window.take();
      started.push(Date.now() - t0);
    }),
  );
  started.sort((a, b) => a - b);
  assert.ok(started.slice(0, 3).every((ms) => ms < 100), `first three go at once: ${started}`);
  assert.ok((started[3] as number) >= 280, `the fourth waits for the window: ${started}`);
  assert.ok((started[6] as number) >= 580, `the seventh waits for a second window: ${started}`);
});

test('in any window no more than the limit get through', async () => {
  const window = new RateWindow(5, 200);
  const started: number[] = [];
  await Promise.all(
    Array.from({ length: 15 }, async () => {
      await window.take();
      started.push(Date.now());
    }),
  );
  started.sort((a, b) => a - b);
  for (let index = 5; index < started.length; index += 1) {
    assert.ok((started[index] as number) - (started[index - 5] as number) >= 195, `request ${index} came too soon`);
  }
});
