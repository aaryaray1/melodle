import { createHash, randomBytes } from 'node:crypto';

export function createVerifier(): string {
  return randomBytes(48).toString('base64url');
}

export function challengeFor(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function createState(): string {
  return randomBytes(16).toString('base64url');
}
