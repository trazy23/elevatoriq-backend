#!/usr/bin/env node
/*
  Import Apollo CSV exports into ElevatorIQ Growth Command prospects.

  Usage:
    node scripts/import-apollo-csv.js --file ~/Downloads/apollo.csv --market "Michigan / Midwest"

  This does not send outreach. It only enriches/creates prospects and queues the
  Outreach Agent to draft approval-gated emails later.
*/
const fs = require('fs');
const os = require('os');
const path = require('path');

const backendRoot = path.join(__dirname, '..');
const bridgeEnvPath = process.env.EIQ_BRIDGE_ENV_FILE || path.join(os.homedir(), '.hermes', 'secrets', 'elevatoriq-render.env');
require('dotenv').config({ path: fs.existsSync(bridgeEnvPath) ? bridgeEnvPath : path.join(backendRoot, '.env') });
const db = require('../src/db');

function arg(name, fallback = null) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  const inline = process.argv.find((item) => item.startsWith(`--${name}=`));
  return inline ? inline.slice(name.length + 3) : fallback;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"' && inQuotes && next === '"') { cell += '"'; i += 1; continue; }
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { row.push(cell); cell = ''; continue; }
    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(cell); cell = '';
      if (row.some((v) => String(v).trim() !== '')) rows.push(row);
      row = [];
      continue;
    }
    cell += ch;
  }
  row.push(cell);
  if (row.some((v) => String(v).trim() !== '')) rows.push(row);
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((h, i) => [h, values[i] || ''])));
}

function pick(record, names) {
  const map = Object.fromEntries(Object.entries(record).map(([k, v]) => [k.toLowerCase().replace(/[^a-z0-9]/g, ''), v]));
  for (const name of names) {
    const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (map[key]) return String(map[key]).trim();
  }
  return null;
}

function score(record) {
  const text = Object.values(record).join(' ').toLowerCase();
  let value = 66;
  if (/property|facilit|maintenance|operations|asset|regional/.test(text)) value += 12;
  if (/director|manager|vp|vice president|owner|principal|president/.test(text)) value += 8;
  if (/michigan|detroit|ann arbor|southfield|farmington|troy|midwest/.test(text)) value += 5;
  if (pick(record, ['Email', 'Email Address', 'Work Email'])) value += 5;
  if (/student|intern|recruiter|sales development|marketing/.test(text)) value -= 18;
  return Math.max(40, Math.min(95, value));
}

function isFit(record) {
  const text = Object.values(record).join(' ').toLowerCase();
  if (/apollo|example|student|intern|recruiter|sales development representative/.test(text)) return false;
  return /property|facilit|maintenance|operations|asset|real estate|building|community|portfolio|multifamily|commercial/.test(text);
}

async function logActivity(payload) {
  await db.query(`INSERT INTO growth_activity_events (agent_key,event_type,title,detail,payload) VALUES ('prospecting_agent','apollo_import','Apollo CSV import completed',$1::text,$2::jsonb)`, [payload.detail, JSON.stringify(payload)]);
}

async function upsert(record, market) {
  const first = pick(record, ['First Name', 'FirstName', 'First']);
  const last = pick(record, ['Last Name', 'LastName', 'Last']);
  const name = pick(record, ['Name', 'Full Name']) || [first, last].filter(Boolean).join(' ') || null;
  const company = pick(record, ['Company', 'Company Name', 'Organization Name', 'Account Name']);
  const title = pick(record, ['Title', 'Job Title', 'Current Title']);
  const email = pick(record, ['Email', 'Email Address', 'Work Email']);
  const website = pick(record, ['Website', 'Company Website', 'Organization Website']);
  const linkedin = pick(record, ['Person Linkedin Url', 'LinkedIn URL', 'Linkedin Url', 'LinkedIn']);
  const city = pick(record, ['City']);
  const state = pick(record, ['State', 'Company State']);
  if (!company || !isFit(record)) return { skipped: true, reason: 'missing company or not ICP fit' };
  const decisionMaker = name ? `${name}${title ? `, ${title}` : ''}` : (title || 'Property / Facilities decision maker');
  const buyerType = /facilit|maintenance|operations/i.test(title || '') ? 'Facilities / building operations' : 'Property management / real estate operator';
  const notes = [
    'Apollo CSV import.',
    city || state ? `Location: ${[city, state].filter(Boolean).join(', ')}` : null,
    title ? `Title: ${title}` : null,
    email ? 'Apollo email present; treat as enrichment-sourced and verify deliverability through small batches.' : 'No Apollo email in CSV row.',
    linkedin ? `LinkedIn: ${linkedin}` : null,
  ].filter(Boolean).join('\n');
  const existing = await db.query(`
    SELECT id FROM growth_prospects
    WHERE lower(company)=lower($1::text)
       OR ($2::text IS NOT NULL AND lower(email)=lower($2::text))
    LIMIT 1
  `, [company, email]);
  if (!existing.rows.length) {
    await db.query(`
      INSERT INTO growth_prospects (company, market, buyer_type, decision_maker, title, email, linkedin_url, website_url, elevator_relevance, priority_score, status, approval_status, notes, source, updated_at)
      VALUES ($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::text,$9::text,$10::int,'researched','not_requested',$11::text,'apollo_csv',NOW())
    `, [company, market, buyerType, decisionMaker, title, email, linkedin, website, `${company} appears to fit ElevatorIQ ICP through Apollo as a ${buyerType}; likely use case is elevator invoice, contract, proposal, or bid review before approval.`, score(record), notes]);
    return { inserted: true };
  }
  await db.query(`
    UPDATE growth_prospects
    SET market=COALESCE($2::text, market), buyer_type=COALESCE($3::text, buyer_type), decision_maker=COALESCE($4::text, decision_maker), title=COALESCE($5::text, title), email=COALESCE($6::text, email), linkedin_url=COALESCE($7::text, linkedin_url), website_url=COALESCE($8::text, website_url), priority_score=GREATEST(COALESCE(priority_score,0), $9::int), notes=concat_ws('\n\n', NULLIF(notes,''), $10::text), source='apollo_csv', updated_at=NOW()
    WHERE id=$1::uuid
  `, [existing.rows[0].id, market, buyerType, decisionMaker, title, email, linkedin, website, score(record), notes]);
  return { updated: true };
}

async function main() {
  const file = arg('file');
  const market = arg('market', 'Michigan / Midwest');
  if (!file) throw new Error('Missing --file path to Apollo CSV export');
  const filePath = file.replace(/^~/, os.homedir());
  const records = parseCsv(fs.readFileSync(filePath, 'utf8'));
  let inserted = 0, updated = 0, skipped = 0;
  for (const record of records) {
    const result = await upsert(record, market);
    if (result.inserted) inserted += 1;
    else if (result.updated) updated += 1;
    else skipped += 1;
  }
  const detail = `Apollo import processed ${records.length} row(s): inserted ${inserted}, updated ${updated}, skipped ${skipped}. No outreach sent.`;
  await logActivity({ detail, records: records.length, inserted, updated, skipped, market });
  console.log(detail);
}

main().catch((err) => { console.error(err.stack || err.message); process.exitCode = 1; }).finally(async () => { await db.pool?.end?.().catch(() => {}); });
