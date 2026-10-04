// Writes .br and .gz beside each built asset, once, so the server never
// compresses on a request. Run by `npm run build` after vite.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const assets = path.join(import.meta.dirname, '..', 'dist', 'assets');
const COMPRESSIBLE = /\.(js|css|svg|json|html)$/;

let before = 0;
let after = 0;
for (const name of readdirSync(assets)) {
  if (!COMPRESSIBLE.test(name)) continue;
  const file = path.join(assets, name);
  const source = readFileSync(file);
  if (source.length < 1024) continue;
  const brotli = brotliCompressSync(source, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } });
  writeFileSync(`${file}.br`, brotli);
  writeFileSync(`${file}.gz`, gzipSync(source, { level: 9 }));
  before += source.length;
  after += brotli.length;
}
console.log(`[compress] ${(before / 1024).toFixed(0)} kB of assets, ${(after / 1024).toFixed(0)} kB as brotli`);
