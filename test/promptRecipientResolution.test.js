const test = require('node:test');
const assert = require('node:assert/strict');

process.env.EMAIL_PROVIDER_API_KEY = process.env.EMAIL_PROVIDER_API_KEY || 'test_key';

const promptRouter = require('../src/routes/prompt');

test('resolveRecipientEmail prefers explicit customer_email', () => {
  const resolved = promptRouter.resolveRecipientEmail({
    customer_email: 'Client@Example.com ',
    request_email: 'fallback@example.com',
  });

  assert.equal(resolved.email, 'client@example.com');
  assert.equal(resolved.source, 'customer_email');
});

test('resolveRecipientEmail falls back to request_email when customer_email missing', () => {
  const resolved = promptRouter.resolveRecipientEmail({
    request_email: 'uploads+lead@customer.com',
  });

  assert.equal(resolved.email, 'uploads+lead@customer.com');
  assert.equal(resolved.source, 'request_email');
});

test('resolveRecipientEmail ignores invalid values and returns null when none valid', () => {
  const resolved = promptRouter.resolveRecipientEmail({
    customer_email: 'not-an-email',
    request_email: ' ',
    email: 'also-bad',
  });

  assert.equal(resolved.email, null);
  assert.equal(resolved.source, null);
});
