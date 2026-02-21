const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function getRulebook() {
  const rulebookPath = path.join(__dirname, '../../rulebook_v1.txt');
  if (fs.existsSync(rulebookPath)) {
    return fs.readFileSync(rulebookPath, 'utf8');
  }
  // Fallback: minimal system prompt if rulebook file not yet present
  return `You are ElevatorIQ, an expert elevator procurement analyst with deep knowledge of:
- Elevator maintenance contracts (full-service, oil & grease, parts & labor)
- Modernization and new construction proposals
- Labor rate benchmarks by region and trade type
- Common billing fraud patterns and overcharge tactics
- Contract clause red flags (evergreen clauses, parts markup, callback limitations)
- Manufacturer-specific equipment cost benchmarks

Analyze documents with precision. Flag issues with confidence levels (high/medium/low).
Use elevator industry terminology. Be specific and actionable.`;
}

async function analyze(documentText, reviewType, benchmarkContext) {
  const systemPrompt = getRulebook();

  const userPrompt = `${benchmarkContext ? benchmarkContext + '\n\n' : ''}Review Type: ${reviewType}

DOCUMENTS:
${documentText}

---

After your analysis, output TWO sections exactly as follows with no deviation:

---REPORT_BODY---
[Your full structured report here — use clear sections, findings, risk signals, and recommendations]

---EXTRACTION_JSON---
[Valid JSON only conforming to ElevatorIQ schema v1. No prose. No markdown. No code fences.]

The JSON must include these fields at minimum:
{
  "schema_version": "1.1",
  "module": "A|B|C",
  "state": "2-letter state or null",
  "market": "metro market or null",
  "equipment_type": "hydraulic|traction|escalator|other",
  "contract_type": "full_maintenance|oil_and_grease|parts_and_labor|modernization|other|null",
  "unit_count": null,
  "confidence_overall": "high|medium|low",
  "benchmark_version": "1.0",
  "flags": [],
  "labor_data": [],
  "line_items": [],
  "parts_data": [],
  "contract_terms": {}
}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const raw = response.content[0].text;
  const splitMarker = '---EXTRACTION_JSON---';
  const splitIndex = raw.indexOf(splitMarker);

  if (splitIndex === -1) {
    // Fallback: treat entire response as report body
    return { reportBody: raw.replace('---REPORT_BODY---', '').trim(), extractionJson: null };
  }

  const reportBody = raw
    .substring(0, splitIndex)
    .replace('---REPORT_BODY---', '')
    .trim();
  const extractionJson = raw.substring(splitIndex + splitMarker.length).trim();

  return { reportBody, extractionJson };
}

module.exports = { analyze };
