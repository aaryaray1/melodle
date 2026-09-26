import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { hashPassword, seal, unseal, verifyPassword } from '../server/lib/secrets.ts';

test('a password verifies against its own hash and nothing else', () => {
  const { hash, salt } = hashPassword('correcthorse1');
  assert.ok(verifyPassword('correcthorse1', salt, hash));
  assert.equal(verifyPassword('correcthorse2', salt, hash), false);
  assert.equal(verifyPassword('', salt, hash), false);
});

test('the same password hashes differently for two accounts', () => {
  const a = hashPassword('correcthorse1');
  const b = hashPassword('correcthorse1');
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash, 'equal hashes would mean the salt is not being used');
  assert.ok(verifyPassword('correcthorse1', b.salt, b.hash));
  assert.equal(verifyPassword('correcthorse1', a.salt, b.hash), false);
});

test('passwords are compared after unicode normalisation', () => {
  const { hash, salt } = hashPassword('caféwordpass');
  assert.ok(verifyPassword('caféwordpass', salt, hash));
});

test('a sealed token round-trips and is unreadable as plain text', () => {
  const tokens = { accessToken: 'BQD-secret-value', refreshToken: 'AQC-refresh', expiresAt: 123 };
  const sealed = seal(tokens);
  assert.equal(sealed.includes('BQD-secret-value'), false, 'the token must not survive in the clear');
  assert.deepEqual(unseal<typeof tokens>(sealed), tokens);
});

test('a tampered or malformed token is rejected rather than trusted', () => {
  const sealed = seal({ accessToken: 'real' });
  const [iv, tag, body] = sealed.split('.');
  const flipped = (body as string).slice(0, -2) + (body?.endsWith('A') ? 'BB' : 'AA');
  assert.equal(unseal(`${iv}.${tag}.${flipped}`), null);
  assert.equal(unseal('nonsense'), null);
  assert.equal(unseal(''), null);
  assert.equal(unseal('a.b.c'), null);
});

test('two different payloads never seal to the same string', () => {
  assert.notEqual(seal({ a: 1 }), seal({ a: 1 }), 'a fresh nonce should make every seal unique');
});
