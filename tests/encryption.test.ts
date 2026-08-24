import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { encrypt, decrypt } from '../server/utils/encryption.js';

before(() => {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
});

describe('encrypt/decrypt', () => {
  it('round-trips a plaintext string', () => {
    const ciphertext = encrypt('123-45-6789');
    assert.notEqual(ciphertext, '123-45-6789');
    assert.equal(decrypt(ciphertext), '123-45-6789');
  });

  it('produces different ciphertext for the same plaintext on repeated calls (random IV)', () => {
    const a = encrypt('same-input');
    const b = encrypt('same-input');
    assert.notEqual(a, b);
    assert.equal(decrypt(a), 'same-input');
    assert.equal(decrypt(b), 'same-input');
  });

  it('throws when the ciphertext has been tampered with', () => {
    const ciphertext = encrypt('98-7654321');
    const buf = Buffer.from(ciphertext, 'base64');
    buf[buf.length - 1] ^= 0xff; // flip the last byte of the encrypted payload
    assert.throws(() => decrypt(buf.toString('base64')));
  });

  it('throws a clear error when ENCRYPTION_KEY is missing', () => {
    const saved = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    assert.throws(() => encrypt('x'), /ENCRYPTION_KEY/);
    process.env.ENCRYPTION_KEY = saved;
  });

  it('throws a clear error when ENCRYPTION_KEY is the wrong length', () => {
    const saved = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = Buffer.alloc(16, 1).toString('base64'); // too short
    assert.throws(() => encrypt('x'), /32 bytes/);
    process.env.ENCRYPTION_KEY = saved;
  });
});
