import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

const dir = mkdtempSync(path.join(tmpdir(), 'melodle-cache-'));
process.env.DATA_FILE = path.join(dir, 'cache.db');
const { DiskCache } = await import('../server/lib/diskcache.ts');
after(() => rmSync(dir, { recursive: true, force: true }));

test('a value outlives the process that cached it', async () => {
  let loads = 0;
  const load = async () => {
    loads += 1;
    return ['song'];
  };
  await new DiskCache<string[]>('pools', 60_000).wrap('rock|2010s', load);
  // A new instance is what a restart looks like: memory empty, database not.
  const after = await new DiskCache<string[]>('pools', 60_000).wrap('rock|2010s', load);
  assert.deepEqual(after, ['song']);
  assert.equal(loads, 1);
});

test('an expired value is loaded again', async () => {
  let loads = 0;
  const cache = new DiskCache<number>('short', 1);
  await cache.wrap('k', async () => ++loads);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(await new DiskCache<number>('short', 1).wrap('k', async () => ++loads), 2);
});

test('a result the caller rejects is returned but not kept', async () => {
  let loads = 0;
  const keepNonEmpty = (value: string[]) => value.length > 0;
  const cache = new DiskCache<string[]>('maybe-empty', 60_000, keepNonEmpty);
  await cache.wrap('k', async () => (++loads, []));
  await cache.wrap('k', async () => (++loads, []));
  assert.equal(loads, 2, 'an empty list, say from a rate limit, is tried again next time');
});

test('namespaces do not collide', async () => {
  await new DiskCache<string>('a', 60_000).wrap('same', async () => 'from a');
  assert.equal(await new DiskCache<string>('b', 60_000).wrap('same', async () => 'from b'), 'from b');
});
