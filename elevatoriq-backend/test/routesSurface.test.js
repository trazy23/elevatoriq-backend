const test = require('node:test');
const assert = require('node:assert/strict');

process.env.EMAIL_PROVIDER_API_KEY = process.env.EMAIL_PROVIDER_API_KEY || 'test_key';

const documentsRouter = require('../src/routes/documents');
const casesRouter = require('../src/routes/cases');

function hasRoute(router, path, method) {
  return router.stack.some((layer) => {
    if (!layer.route) return false;
    return layer.route.path === path && layer.route.methods[method];
  });
}

test('documents route exposes batch upload endpoint', () => {
  assert.equal(hasRoute(documentsRouter, '/batch', 'post'), true);
});

test('cases route exposes output metadata endpoint', () => {
  assert.equal(hasRoute(casesRouter, '/:id/output', 'get'), true);
});
