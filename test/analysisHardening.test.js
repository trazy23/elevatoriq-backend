const test = require('node:test');
const assert = require('node:assert/strict');

const claudeService = require('../src/services/claudeService');
const analysisWorker = require('../src/workers/analysisWorker');

test('chunkText splits long text into multiple chunks with overlap', () => {
  const { chunkText } = claudeService.__testables;
  const text = 'A'.repeat(40000);
  const chunks = chunkText(text, 10000, 1000);

  assert.ok(chunks.length >= 4);
  assert.equal(chunks[0].length, 10000);
  assert.ok(chunks[1].startsWith('A'.repeat(1000)));
});

test('parseAnalysisResponse extracts report and json blocks', () => {
  const { parseAnalysisResponse } = claudeService.__testables;
  const parsed = parseAnalysisResponse('---REPORT_BODY---\nSECTION 1\nhello\n---EXTRACTION_JSON---\n{"a":1}');
  assert.match(parsed.reportBody, /SECTION 1/);
  assert.equal(parsed.extractionJson, '{"a":1}');
});

test('quality gate rejects report with high verbatim overlap', () => {
  const { isReportDeliverable } = analysisWorker.__testables;
  const source = `${'X'.repeat(200)}\n${'Y'.repeat(200)}\n${'Z'.repeat(200)}`;
  const report = `SECTION 1\n${'X'.repeat(200)}\nSECTION 2\n${'Y'.repeat(200)}\nRecommendation: Investigate`;
  assert.equal(isReportDeliverable(report, source), false);
});

test('quality gate accepts synthesized report with required structure', () => {
  const { isReportDeliverable } = analysisWorker.__testables;
  const source = 'Original proposal language.';
  const report = [
    'SECTION 1 — EXECUTIVE SUMMARY',
    'This synthesis explains pricing posture and owner risk allocation in plain terms with negotiation direction.',
    'SECTION 2 — PRICE COMPARISON',
    'Assessment: The quoted lump sum appears competitive relative to assumptions but exclusions shift downstream owner cost.',
    'Risk: Hidden scope transfer for temporary use and fire-alarm integration can materially increase total cost.',
    'Recommendation: Require a normalized inclusion matrix and fixed alternates prior to award.',
    'Bottom Line: Proceed only with clarified exclusions and warranty callback language.',
    'A'.repeat(1300),
  ].join('\n');
  assert.equal(isReportDeliverable(report, source), true);
});
