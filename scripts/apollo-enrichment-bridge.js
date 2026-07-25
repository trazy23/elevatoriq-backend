#!/usr/bin/env node
/*
  ElevatorIQ Apollo Enrichment Bridge

  Local browser bridge that uses Trey's logged-in Apollo Chrome session to turn
  Apollo People search results into Growth Command prospects with verified work
  emails. It never sends outreach. It only imports/enriches prospects and logs
  what it did.

  Usage:
    node scripts/apollo-enrichment-bridge.js --mode verify
    node scripts/apollo-enrichment-bridge.js --mode dry-run --reveal-limit 0
    node scripts/apollo-enrichment-bridge.js --mode once --reveal-limit 5 --import-limit 10
*/
const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer');

const backendRoot = path.join(__dirname, '..');
const bridgeEnvPath = process.env.EIQ_BRIDGE_ENV_FILE || path.join(os.homedir(), '.hermes', 'secrets', 'elevatoriq-render.env');
require('dotenv').config({ path: fs.existsSync(bridgeEnvPath) ? bridgeEnvPath : path.join(backendRoot, '.env') });
const db = require('../src/db');
const { alertLoginRequired } = require('./growth-login-alerts');

const DEFAULT_BROWSER_URL = process.env.APOLLO_CHROME_BROWSER_URL || 'http://127.0.0.1:9222';
const DEFAULT_SEARCH_URL = process.env.APOLLO_EIQ_SEARCH_URL || 'https://app.apollo.io/#/people?sortByField=%5Bnone%5D&sortAscending=false&page=1&qKeywords=property%20manager&contactEmailStatusV2[]=verified&personLocations[]=Michigan%2C%20United%20States&recommendationConfigId=score';
const DEFAULT_MARKET = process.env.APOLLO_EIQ_MARKET || 'Michigan / Midwest';
const DEFAULT_DAILY_CREDIT_CAP = Number(process.env.APOLLO_DAILY_CREDIT_CAP || 5);
const DEFAULT_REVEAL_LIMIT = Number(process.env.APOLLO_REVEAL_LIMIT || 5);
const DEFAULT_IMPORT_LIMIT = Number(process.env.APOLLO_IMPORT_LIMIT || 10);

function arg(name, fallback = null) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  const inline = process.argv.find((item) => item.startsWith(`--${name}=`));
  return inline ? inline.slice(name.length + 3) : fallback;
}

function boolArg(name) {
  return process.argv.includes(`--${name}`);
}

function nowIso() {
  return new Date().toISOString();
}

function sanitizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeEmail(value = '') {
  return String(value || '').trim().toLowerCase();
}

function pickNameParts(name = '') {
  const parts = sanitizeText(name).split(/\s+/).filter(Boolean);
  return { first: parts[0] || null, last: parts.length > 1 ? parts.slice(1).join(' ') : null };
}

function score(record) {
  const text = Object.values(record).join(' ').toLowerCase();
  let value = 70;
  if (/property|facilit|maintenance|operations|asset|regional/.test(text)) value += 12;
  if (/director|manager|vp|vice president|owner|principal|president/.test(text)) value += 8;
  if (/michigan|detroit|ann arbor|southfield|farmington|troy|midwest|grand rapids|royal oak|jackson/.test(text)) value += 5;
  if (record.email) value += 5;
  if (/student|intern|recruiter|sales development|marketing/.test(text)) value -= 18;
  if (/hospital|health care|mental health|recruiting|staffing/.test(text)) value -= 6;
  return Math.max(40, Math.min(98, value));
}

function isFit(record) {
  const text = Object.values(record).join(' ').toLowerCase();
  if (/example|student|intern|recruiter|sales development representative/.test(text)) return false;
  return /property|facilit|maintenance|operations|asset|real estate|building|community|portfolio|multifamily|commercial|apartment|condo|hoa/.test(text);
}

async function logActivity(payload) {
  const detail = payload.detail || `Apollo bridge run: imported ${payload.inserted || 0}, updated ${payload.updated || 0}, skipped ${payload.skipped || 0}.`;
  await db.query(
    `INSERT INTO growth_activity_events (agent_key,event_type,title,detail,payload)
     VALUES ('prospecting_agent','apollo_browser_bridge','Apollo enrichment bridge completed',$1::text,$2::jsonb)`,
    [detail, JSON.stringify(payload)]
  );
}

async function countCreditsUsedToday() {
  const result = await db.query(`
    SELECT COALESCE(SUM((payload->>'credits_used')::int),0)::int AS used
    FROM growth_activity_events
    WHERE event_type='apollo_browser_bridge'
      AND created_at::date = NOW()::date
      AND payload ? 'credits_used'
  `);
  return Number(result.rows[0]?.used || 0);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectApollo({ browserUrl = DEFAULT_BROWSER_URL, searchUrl = DEFAULT_SEARCH_URL }) {
  const browser = await puppeteer.connect({ browserURL: browserUrl, defaultViewport: null });
  const pages = await browser.pages();
  let page = pages.find((p) => p.url().includes('app.apollo.io/#/people') && /qKeywords|contactEmailStatus|personLocations/.test(p.url()))
    || pages.find((p) => p.url().includes('app.apollo.io/#/people'))
    || pages.find((p) => p.url().includes('app.apollo.io'));
  if (!page) {
    page = await browser.newPage();
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  } else if (!page.url().includes('/#/people') || !/qKeywords|contactEmailStatus|personLocations/.test(page.url())) {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  }
  await page.bringToFront().catch(() => {});
  await page.waitForFunction(() => document.body && document.body.innerText.includes('Find people'), { timeout: 45_000 }).catch(() => {});
  await delay(3000);
  return { browser, page };
}

async function getApolloStatus(page) {
  return page.evaluate(() => {
    const text = document.body.innerText || '';
    const creditsMatch = text.match(/\b(\d{1,5})\s+credits\b/i);
    const totalMatch = text.match(/Total\s+([\d.]+K?|\d+)/i);
    const visibleEmails = (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).length;
    const accessEmailButtons = [...document.querySelectorAll('button,a,[role="button"]')]
      .filter((el) => /Access email/i.test(el.innerText || el.getAttribute('aria-label') || '')).length;
    return {
      url: location.href,
      title: document.title,
      logged_in: /Find people/i.test(text),
      credits_visible: creditsMatch ? Number(creditsMatch[1]) : null,
      total_results: totalMatch ? totalMatch[1] : null,
      visible_emails: visibleEmails,
      access_email_buttons: accessEmailButtons,
      checked_at: new Date().toISOString(),
    };
  });
}

async function revealEmails(page, limit) {
  let clicked = 0;
  const attempts = [];
  for (let i = 0; i < limit; i += 1) {
    const handle = await page.evaluateHandle(() => {
      const candidates = [...document.querySelectorAll('button,a,[role="button"]')]
        .filter((el) => /Access email/i.test(el.innerText || el.getAttribute('aria-label') || ''));
      return candidates.find((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.top <= window.innerHeight;
      }) || null;
    });
    const element = handle.asElement();
    if (!element) break;
    try {
      const before = await page.evaluate(() => (document.body.innerText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).length);
      await element.click({ delay: 80 });
      await delay(2500);
      const after = await page.evaluate(() => (document.body.innerText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).length);
      clicked += 1;
      attempts.push({ clicked: true, before_emails: before, after_emails: after });
    } catch (err) {
      attempts.push({ clicked: false, error: err.message });
      break;
    } finally {
      await handle.dispose().catch(() => {});
    }
  }
  return { clicked, attempts };
}

async function extractVisibleRows(page) {
  return page.evaluate(() => {
    function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
    function emailFrom(text) {
      const match = String(text || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      return match ? match[0].toLowerCase() : null;
    }
    const contactLinks = [...document.querySelectorAll('a[href*="#/contacts/"]')]
      .filter((a) => clean(a.innerText).length > 1);
    const seen = new Set();
    const rows = [];
    for (const link of contactLinks) {
      const contactId = (link.href.match(/contacts\/([^?]+)/) || [])[1] || link.href;
      if (seen.has(contactId)) continue;
      seen.add(contactId);
      let row = link;
      for (let i = 0; i < 8 && row; i += 1) {
        if ((row.innerText || '').includes('Request phone number') || (row.innerText || '').includes('Access email')) break;
        row = row.parentElement;
      }
      const text = row?.innerText || '';
      const lines = text.split('\n').map(clean).filter(Boolean);
      const name = clean(link.innerText);
      const nameIdx = lines.findIndex((line) => line === name);
      const title = nameIdx >= 0 ? lines[nameIdx + 1] || null : null;
      const company = nameIdx >= 0 ? lines[nameIdx + 2] || null : null;
      const email = emailFrom(text);
      const linkedin = [...(row?.querySelectorAll('a[href*="linkedin.com/in/"]') || [])][0]?.href || null;
      const location = lines.find((line) => /,\s*(Michigan|MI)\b/i.test(line)) || null;
      const employees = lines.find((line, idx) => idx > nameIdx + 2 && /^[\d,]+$/.test(line)) || null;
      const keywords = lines.filter((line) => ![name, title, company, email, location, employees, 'Request phone number', 'Access email', 'Access Mobile', '+1', '-', 'Qualified', 'Disqualified', 'Possible Fit', 'Not Enough Information', 'Running...', 'Click to run'].includes(line)).slice(-8);
      if (name && company) {
        rows.push({
          name,
          title,
          company,
          email,
          linkedin_url: linkedin,
          location,
          employees,
          keywords,
          apollo_contact_url: link.href,
          source_url: location.href,
        });
      }
    }
    return rows;
  });
}

async function upsert(record, market) {
  if (!record.company || !record.email || !isFit(record)) return { skipped: true, reason: 'missing company/email or not ICP fit' };
  const { first, last } = pickNameParts(record.name);
  const decisionMaker = `${record.name}${record.title ? `, ${record.title}` : ''}`;
  const buyerType = /facilit|maintenance|operations/i.test(record.title || '') ? 'Facilities / building operations' : 'Property management / real estate operator';
  const notes = [
    'Apollo browser bridge import.',
    record.location ? `Location: ${record.location}` : null,
    record.title ? `Title: ${record.title}` : null,
    record.email ? 'Apollo verified-email search; email visible in Apollo at import time.' : null,
    record.linkedin_url ? `LinkedIn: ${record.linkedin_url}` : null,
    record.apollo_contact_url ? `Apollo contact: ${record.apollo_contact_url}` : null,
    record.keywords?.length ? `Apollo keywords: ${record.keywords.join(', ')}` : null,
  ].filter(Boolean).join('\n');

  const existing = await db.query(`
    SELECT id FROM growth_prospects
    WHERE lower(company)=lower($1::text)
       OR lower(email)=lower($2::text)
    LIMIT 1
  `, [record.company, record.email]);

  const priority = score(record);
  if (!existing.rows.length) {
    await db.query(`
      INSERT INTO growth_prospects (company, market, buyer_type, decision_maker, title, email, linkedin_url, website_url, elevator_relevance, priority_score, status, approval_status, notes, source, updated_at)
      VALUES ($1::text,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::text,$9::text,$10::int,'researched','not_requested',$11::text,'apollo_browser',NOW())
    `, [record.company, market, buyerType, decisionMaker, record.title, record.email, record.linkedin_url, null, `${record.company} fits ElevatorIQ ICP through Apollo as ${buyerType}; outreach should ask for one elevator invoice, contract, proposal, repair quote, or modernization bid for a free preview.`, priority, notes]);
    return { inserted: true, first, last };
  }

  await db.query(`
    UPDATE growth_prospects
    SET market=COALESCE($2::text, market),
        buyer_type=COALESCE($3::text, buyer_type),
        decision_maker=COALESCE($4::text, decision_maker),
        title=COALESCE($5::text, title),
        email=COALESCE($6::text, email),
        linkedin_url=COALESCE($7::text, linkedin_url),
        priority_score=GREATEST(COALESCE(priority_score,0), $8::int),
        notes=concat_ws('\n\n', NULLIF(notes,''), $9::text),
        source=CASE WHEN source='apollo_csv' THEN source ELSE 'apollo_browser' END,
        updated_at=NOW()
    WHERE id=$1::uuid
  `, [existing.rows[0].id, market, buyerType, decisionMaker, record.title, record.email, record.linkedin_url, priority, notes]);
  return { updated: true, first, last };
}

async function importRows(rows, { market, importLimit }) {
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const imported = [];
  const seenEmails = new Set();
  for (const row of rows) {
    if (imported.length >= importLimit) break;
    const email = normalizeEmail(row.email);
    if (!email || seenEmails.has(email)) { skipped += 1; continue; }
    seenEmails.add(email);
    // eslint-disable-next-line no-await-in-loop
    const result = await upsert({ ...row, email }, market);
    if (result.inserted) { inserted += 1; imported.push(row); }
    else if (result.updated) { updated += 1; imported.push(row); }
    else skipped += 1;
  }
  return { inserted, updated, skipped, imported };
}

async function sourceCounts() {
  const result = await db.query(`
    SELECT source, COUNT(*)::int AS total, COUNT(email)::int AS with_email
    FROM growth_prospects
    GROUP BY source
    ORDER BY source
  `);
  return result.rows;
}

async function runBridge() {
  const mode = arg('mode', 'once');
  const dryRun = mode === 'dry-run' || boolArg('dry-run') || mode === 'verify';
  const market = arg('market', DEFAULT_MARKET);
  const searchUrl = arg('search-url', DEFAULT_SEARCH_URL);
  const browserUrl = arg('browser-url', DEFAULT_BROWSER_URL);
  const dailyCap = Number(arg('daily-credit-cap', DEFAULT_DAILY_CREDIT_CAP));
  const requestedRevealLimit = Number(arg('reveal-limit', DEFAULT_REVEAL_LIMIT));
  const importLimit = Number(arg('import-limit', DEFAULT_IMPORT_LIMIT));

  const creditsAlreadyUsed = await countCreditsUsedToday();
  const remainingCap = Math.max(0, dailyCap - creditsAlreadyUsed);
  const revealLimit = dryRun ? 0 : Math.max(0, Math.min(requestedRevealLimit, remainingCap));

  const { browser, page } = await connectApollo({ browserUrl, searchUrl });
  let statusBefore = await getApolloStatus(page);
  if (!statusBefore.url.includes('/#/people')) {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(3000);
    statusBefore = await getApolloStatus(page);
  }
  if (!statusBefore.logged_in) {
    const context = `Apollo bridge could not see the People search after opening ${statusBefore.url || 'Apollo'}. Daily enrichment cannot reveal/import verified emails until Apollo is logged in.`;
    const alert = alertLoginRequired('apollo', context);
    const payload = {
      ran_at: nowIso(),
      mode,
      dry_run: dryRun,
      lane: 'ElevatorIQ',
      market,
      search_url: page.url(),
      status_before: statusBefore,
      login_required: true,
      alert,
      credits_already_used_today: creditsAlreadyUsed,
      daily_credit_cap: dailyCap,
      reveal_limit: 0,
      credits_used: 0,
      visible_rows: 0,
      sendable_rows: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      detail: 'Apollo bridge stopped: Apollo login required. Telegram login alert sent if cooldown allowed.',
    };
    await logActivity(payload);
    await browser.disconnect();
    return payload;
  }

  let reveal = { clicked: 0, attempts: [] };
  if (revealLimit > 0) reveal = await revealEmails(page, revealLimit);
  const rows = await extractVisibleRows(page);
  const sendableRows = rows.filter((row) => row.email && isFit(row));
  const statusAfter = await getApolloStatus(page);

  let importResult = { inserted: 0, updated: 0, skipped: 0, imported: [] };
  if (!dryRun) importResult = await importRows(sendableRows, { market, importLimit });
  const counts = await sourceCounts();

  const payload = {
    ran_at: nowIso(),
    mode,
    dry_run: dryRun,
    lane: 'ElevatorIQ',
    market,
    search_url: page.url(),
    status_before: statusBefore,
    status_after: statusAfter,
    credits_already_used_today: creditsAlreadyUsed,
    daily_credit_cap: dailyCap,
    reveal_limit: revealLimit,
    reveal_clicks_attempted: reveal.clicked,
    credits_used: Math.max(0, Number(statusBefore.credits_visible || 0) - Number(statusAfter.credits_visible || 0)),
    visible_rows: rows.length,
    sendable_rows: sendableRows.length,
    inserted: importResult.inserted,
    updated: importResult.updated,
    skipped: importResult.skipped,
    imported_preview: importResult.imported.slice(0, 10).map((row) => ({ name: row.name, title: row.title, company: row.company, email: row.email, location: row.location })),
    source_counts: counts,
    reveal_attempts: reveal.attempts,
  };
  payload.detail = dryRun
    ? `Apollo bridge dry-run saw ${rows.length} visible row(s), ${sendableRows.length} sendable row(s), used 0 credits, imported 0.`
    : `Apollo bridge used ${payload.credits_used} credit(s), saw ${rows.length} visible row(s), imported ${importResult.inserted}, updated ${importResult.updated}, skipped ${importResult.skipped}. No outreach sent.`;

  await logActivity(payload);
  await browser.disconnect();
  return payload;
}

runBridge().then((payload) => {
  console.log(JSON.stringify(payload, null, 2));
}).catch((err) => {
  console.error(err.stack || err.message);
  process.exitCode = 1;
}).finally(async () => {
  await db.pool?.end?.().catch(() => {});
});
