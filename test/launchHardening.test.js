const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

process.env.MOCK_DB = 'true';
process.env.EMAIL_PROVIDER_API_KEY = process.env.EMAIL_PROVIDER_API_KEY || 'test_key';

async function withServer(app, run) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  const request = (path, init) => fetch(`http://127.0.0.1:${port}${path}`, init);
  try {
    await run(request);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function jsonApp(router, mountPath) {
  const app = express();
  app.use(express.json());
  app.use(mountPath, router);
  return app;
}

function freshRequire(modulePath) {
  const resolved = require.resolve(modulePath);
  delete require.cache[resolved];
  return require(modulePath);
}

test('production Stripe webhooks fail closed when STRIPE_WEBHOOK_SECRET is missing', async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalStripeKey = process.env.STRIPE_SECRET_KEY;
  const originalWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.NODE_ENV = 'production';
  process.env.STRIPE_SECRET_KEY = 'sk_test_launch_hardening';
  delete process.env.STRIPE_WEBHOOK_SECRET;

  const { handleStripeWebhook } = freshRequire('../src/routes/payments');
  const req = {
    body: Buffer.from(JSON.stringify({ id: 'evt_test', type: 'customer.created', data: { object: {} } })),
    headers: {},
  };
  const res = {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };

  await handleStripeWebhook(req, res);

  assert.equal(res.statusCode, 500);
  assert.match(res.payload.error, /webhook secret/i);

  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalStripeKey === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = originalStripeKey;
  if (originalWebhookSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = originalWebhookSecret;
});

test('POST /api/cases rejects empty submissions without a valid email', async () => {
  const casesRouter = freshRequire('../src/routes/cases');
  const app = jsonApp(casesRouter, '/api/cases');

  await withServer(app, async (request) => {
    const res = await request('/api/cases', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.code, 'email_required');
  });
});

test('admin API rejects admin keys in the query string', async () => {
  const originalAdminKey = process.env.ADMIN_API_KEY;
  process.env.ADMIN_API_KEY = 'secret-test-key';
  const adminRouter = freshRequire('../src/routes/admin');
  const app = jsonApp(adminRouter, '/api/admin');

  await withServer(app, async (request) => {
    const res = await request('/api/admin/stats?key=secret-test-key');
    assert.equal(res.status, 401);
  });

  if (originalAdminKey === undefined) delete process.env.ADMIN_API_KEY;
  else process.env.ADMIN_API_KEY = originalAdminKey;
});

test('report download rejects expired tokens before touching storage', async () => {
  const dbPath = require.resolve('../src/db');
  const storagePath = require.resolve('../src/services/storageService');
  const originalDb = require.cache[dbPath];
  const originalStorage = require.cache[storagePath];
  let storageTouched = false;

  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      query: async () => ({
        rows: [{
          id: 1,
          case_id: 10,
          storage_path: 'reports/expired.pdf',
          download_token: 'expired-token',
          token_expires_at: new Date(Date.now() - 60_000).toISOString(),
          review_type: 'invoice_review',
          company: 'Test Co',
        }],
      }),
    },
  };
  require.cache[storagePath] = {
    id: storagePath,
    filename: storagePath,
    loaded: true,
    exports: {
      download: async () => {
        storageTouched = true;
        return Buffer.from('%PDF fake');
      },
    },
  };

  const reportsRouter = freshRequire('../src/routes/reports');
  const app = jsonApp(reportsRouter, '/api/reports');

  await withServer(app, async (request) => {
    const res = await request('/api/reports/download/expired-token');
    assert.equal(res.status, 404);
    assert.equal(storageTouched, false);
    const body = await res.json();
    assert.match(body.error, /expired/i);
  });

  if (originalDb) require.cache[dbPath] = originalDb;
  else delete require.cache[dbPath];
  if (originalStorage) require.cache[storagePath] = originalStorage;
  else delete require.cache[storagePath];
});

test('Express app trusts the first proxy hop so rate limits use the real client IP on Render', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalDatabaseUrlUnderscore = process.env.DATABASE_URL_;
  process.env.NODE_ENV = 'test';
  delete process.env.DATABASE_URL;
  delete process.env.DATABASE_URL_;

  const app = freshRequire('../index');
  assert.equal(app.get('trust proxy'), 1);

  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalDatabaseUrlUnderscore === undefined) delete process.env.DATABASE_URL_;
  else process.env.DATABASE_URL_ = originalDatabaseUrlUnderscore;
});
