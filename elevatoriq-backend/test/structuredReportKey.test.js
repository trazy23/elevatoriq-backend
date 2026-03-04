const test = require('node:test');
const assert = require('node:assert/strict');
const { getStructuredReportKey } = require('../src/utils/reportArtifacts');

test('getStructuredReportKey returns stable per-case artifact path', () => {
  assert.equal(
    getStructuredReportKey('abc-123'),
    'reports/abc-123/structured-report.json'
  );
});
