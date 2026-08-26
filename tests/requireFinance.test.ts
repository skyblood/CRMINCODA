// tests/requireFinance.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { requireFinance } from '../server/middleware/requireAuth.js';

function buildApp(sessionUser?: any) {
  const app = express();
  app.use((req: any, _res, next) => { req.session = sessionUser ? { user: sessionUser } : undefined; next(); });
  app.get('/protected', requireFinance, (_req, res) => res.json({ ok: true }));
  return app;
}

describe('requireFinance', () => {
  it('returns 401 when there is no session', async () => {
    const res = await request(buildApp(undefined)).get('/protected');
    assert.equal(res.status, 401);
  });

  it('returns 403 for a logged-in user with neither finance nor admin permission', async () => {
    const res = await request(buildApp({ permissions: { finance: false, admin: false } })).get('/protected');
    assert.equal(res.status, 403);
  });

  it('allows a user with permissions.finance === true', async () => {
    const res = await request(buildApp({ permissions: { finance: true } })).get('/protected');
    assert.equal(res.status, 200);
  });

  it('allows a user with permissions.admin === true even without the finance flag', async () => {
    const res = await request(buildApp({ permissions: { admin: true } })).get('/protected');
    assert.equal(res.status, 200);
  });

  it('returns 403 when permissions is entirely missing', async () => {
    const res = await request(buildApp({})).get('/protected');
    assert.equal(res.status, 403);
  });
});
