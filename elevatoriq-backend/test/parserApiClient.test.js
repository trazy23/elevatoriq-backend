const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isParserApiEnabled,
  parseInvoiceViaBackend,
} = require('../src/integrations/parserApiClient');

test('isParserApiEnabled returns false by default', () => {
  delete process.env.PARSER_API_ENABLED;
  assert.equal(isParserApiEnabled(), false);
});

test('parseInvoiceViaBackend returns skipped when feature flag is off', async () => {
  process.env.PARSER_API_ENABLED = 'false';

  const result = await parseInvoiceViaBackend(Buffer.from('pdf'), 'invoice.pdf', {
    fetchImpl: async () => {
      throw new Error('fetch should not be called when disabled');
    },
  });

  assert.equal(result.skipped, true);
});

test('parseInvoiceViaBackend posts to parser endpoint when enabled', async () => {
  process.env.PARSER_API_ENABLED = 'true';
  process.env.PARSER_API_BASE_URL = 'https://api.example.com';

  let captured = null;

  const fakeResponse = {
    ok: true,
    json: async () => ({ success: true, file_name: 'invoice.pdf', extracted_characters: 10, data: {} }),
  };

  const result = await parseInvoiceViaBackend(Buffer.from('pdf'), 'invoice.pdf', {
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return fakeResponse;
    },
  });

  assert.equal(result.success, true);
  assert.equal(captured.url, 'https://api.example.com/api/invoice/parse');
  assert.equal(captured.options.method, 'POST');
});
