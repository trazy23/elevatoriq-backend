const db = require('../db');
const { Resend } = require('resend');
const { BRAND, formatFromEmail } = require('./reportBranding');

const resend = new Resend(process.env.EMAIL_PROVIDER_API_KEY);

function actionsEnabled() {
  return process.env.GROWTH_ACTIONS_ENABLED === 'true';
}

function centsToDollars(cents) {
  return Math.round(Number(cents || 0)) / 100;
}

async function getSummary() {
  await ensureStarterGrowthData();

  const [prospects, campaigns, approvals, agents, recentActivity] = await Promise.all([
    db.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status IN ('ready_for_approval') OR approval_status='pending')::int AS need_approval,
        COUNT(*) FILTER (WHERE status='sent')::int AS sent,
        COUNT(*) FILTER (WHERE status='replied')::int AS replies,
        COUNT(*) FILTER (WHERE status='uploaded')::int AS uploads,
        COUNT(*) FILTER (WHERE status='paid')::int AS paid,
        COALESCE(SUM(revenue_cents),0)::int AS revenue_cents
      FROM growth_prospects
    `),
    db.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status IN ('ready_for_approval') OR approval_status='pending')::int AS need_approval,
        COUNT(*) FILTER (WHERE status IN ('queued','running'))::int AS active,
        COUNT(*) FILTER (WHERE status IN ('sent','completed'))::int AS completed
      FROM growth_campaigns
    `),
    db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status='pending')::int AS pending,
        COUNT(*) FILTER (WHERE status='approved')::int AS approved,
        COUNT(*) FILTER (WHERE status='executed')::int AS executed,
        COUNT(*) FILTER (WHERE status='failed')::int AS failed
      FROM growth_approvals
    `),
    db.query(`SELECT key, name, lane, status, current_work, last_output, last_run_at, next_run_at FROM growth_agents ORDER BY lane, name`),
    db.query(`SELECT agent_key, event_type, title, detail, created_at FROM growth_activity_events ORDER BY created_at DESC LIMIT 15`),
  ]);

  const p = prospects.rows[0] || {};
  const c = campaigns.rows[0] || {};
  const a = approvals.rows[0] || {};
  const executiveSummary = buildExecutiveSummary({ p, c, a, agents: agents.rows });

  return {
    actions_enabled: actionsEnabled(),
    generated_at: new Date().toISOString(),
    executive_summary: executiveSummary,
    prospects: { ...p, revenue_dollars: centsToDollars(p.revenue_cents) },
    campaigns: c,
    approvals: a,
    agents: agents.rows,
    recent_activity: recentActivity.rows,
  };
}

async function ensureStarterGrowthData() {
  const [{ rows: prospectRows }, { rows: campaignRows }, { rows: approvalRows }] = await Promise.all([
    db.query(`SELECT COUNT(*)::int AS count FROM growth_prospects`),
    db.query(`SELECT COUNT(*)::int AS count FROM growth_campaigns`),
    db.query(`SELECT COUNT(*)::int AS count FROM growth_approvals`),
  ]);

  const hasGrowthWork =
    Number(prospectRows[0]?.count || 0) > 0 ||
    Number(campaignRows[0]?.count || 0) > 0 ||
    Number(approvalRows[0]?.count || 0) > 0;

  if (hasGrowthWork) return;

  const starterProspects = [
    {
      company: 'Village Green',
      market: 'Detroit / Midwest',
      buyer_type: 'Property management firm',
      decision_maker: 'Facilities / Property Operations Lead',
      title: 'Facilities or Property Operations',
      website_url: 'https://villagegreen.com',
      elevator_relevance: 'Large multifamily/property management operator; likely recurring elevator service contracts and modernization decisions across managed assets.',
      priority_score: 92,
      notes: 'Needs contact enrichment before live send. Good early ICP target for Michigan/Midwest property management.'
    },
    {
      company: 'Friedman Real Estate',
      market: 'Farmington Hills / Midwest',
      buyer_type: 'Commercial real estate and property management',
      decision_maker: 'Property Management / Facilities Decision Maker',
      title: 'Property Management or Facilities',
      website_url: 'https://www.friedmanrealestate.com',
      elevator_relevance: 'Commercial property management portfolio; elevator contracts, service invoices, and modernization proposals are likely recurring issues.',
      priority_score: 90,
      notes: 'Needs contact enrichment and exact decision-maker confirmation before live send.'
    },
    {
      company: 'McKinley Companies',
      market: 'Ann Arbor / Michigan',
      buyer_type: 'Real estate owner/operator',
      decision_maker: 'Facilities / Asset Management Lead',
      title: 'Facilities or Asset Management',
      website_url: 'https://www.mckinley.com',
      elevator_relevance: 'Michigan-based owner/operator with multifamily/commercial exposure; likely periodic elevator vendor decisions.',
      priority_score: 88,
      notes: 'Needs contact enrichment before live send.'
    },
    {
      company: 'Beztak',
      market: 'Farmington Hills / National',
      buyer_type: 'Multifamily property owner/operator',
      decision_maker: 'Operations / Facilities Lead',
      title: 'Operations or Facilities',
      website_url: 'https://www.beztak.com',
      elevator_relevance: 'Large multifamily operator; elevator maintenance agreements and repair invoices may be frequent across portfolio.',
      priority_score: 86,
      notes: 'Needs contact enrichment before live send.'
    },
    {
      company: 'Hayman Company',
      market: 'Michigan / Midwest',
      buyer_type: 'Property management firm',
      decision_maker: 'Property Operations Lead',
      title: 'Property Operations',
      website_url: 'https://www.haymancompany.com',
      elevator_relevance: 'Property management firm with managed real estate assets; good fit for bid, contract, and invoice review offer.',
      priority_score: 84,
      notes: 'Needs contact enrichment before live send.'
    }
  ];

  const insertedProspects = [];
  for (const prospect of starterProspects) {
    const result = await db.query(`
      INSERT INTO growth_prospects (
        company, market, buyer_type, decision_maker, title, website_url,
        elevator_relevance, priority_score, status, approval_status, notes, source
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ready_for_approval','pending',$9,'starter_launch_seed')
      RETURNING *
    `, [
      prospect.company,
      prospect.market,
      prospect.buyer_type,
      prospect.decision_maker,
      prospect.title,
      prospect.website_url,
      prospect.elevator_relevance,
      prospect.priority_score,
      prospect.notes,
    ]);
    insertedProspects.push(result.rows[0]);
  }

  const campaignBody = `Hi {{first_name}},

ElevatorIQ helps property managers and facility teams review elevator invoices, maintenance contracts, and modernization bids before they overpay or sign something unclear.

You can upload one elevator invoice, contract, or proposal and get a free preview first. If the preview is useful, the full plain-English report is $99.

Would it make sense to send one recent elevator document through for a quick review preview?

Thanks,
The ElevatorIQ Team
https://elevatoriq.ai`;

  const campaign = await db.query(`
    INSERT INTO growth_campaigns (
      name, channel, objective, subject, body, cta, status, approval_status, owner_agent_key
    ) VALUES (
      'Michigan property manager first 5',
      'email',
      'Validate first direct-outreach message with Michigan/Midwest property management targets. Do not send until contacts are enriched and CEO approves.',
      'Quick elevator invoice / bid review preview',
      $1,
      'Ask recipient to upload one elevator invoice, contract, or proposal for a free preview.',
      'ready_for_approval',
      'pending',
      'outreach_agent'
    ) RETURNING *
  `, [campaignBody]);

  for (const prospect of insertedProspects) {
    await db.query(`
      INSERT INTO growth_campaign_recipients (
        campaign_id, prospect_id, company, personalized_opening, final_subject, final_body, status
      ) VALUES ($1,$2,$3,$4,$5,$6,'ready_for_approval')
    `, [
      campaign.rows[0].id,
      prospect.id,
      prospect.company,
      `${prospect.company} looks like a fit because ${prospect.elevator_relevance}`,
      'Quick elevator invoice / bid review preview',
      campaignBody,
    ]);
  }

  await db.query(`
    INSERT INTO growth_approvals (
      item_type, item_id, title, summary, risk_level, requested_by_agent_key, action_type, action_payload
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
  `, [
    'campaign',
    campaign.rows[0].id,
    'Approve Michigan first-5 outreach campaign for enrichment / queue',
    `This queues the first Michigan/Midwest property manager campaign inside the dashboard. Safe mode means approval will not send emails yet. Before live sending, the Prospecting Agent still needs to enrich real decision-maker emails and Trey should approve the exact recipients.\n\nSubject: Quick elevator invoice / bid review preview\n\nBody:\n${campaignBody}`,
    'medium',
    'outreach_agent',
    'queue_campaign',
    JSON.stringify({ campaign_id: campaign.rows[0].id, safe_mode_note: 'Queue only until GROWTH_ACTIONS_ENABLED=true and recipient emails are enriched.' }),
  ]);

  await db.query(`
    INSERT INTO growth_approvals (
      item_type, title, summary, risk_level, requested_by_agent_key, action_type, action_payload
    ) VALUES ($1,$2,$3,$4,$5,$6,$7)
  `, [
    'other',
    'Approve Prospecting Agent to enrich first 25 Michigan targets',
    'Decision needed: approve the Prospecting Agent lane to build/enrich the first 25 Michigan/Midwest property-management targets with decision maker, verified email or contact path, ICP score, and custom opening line. This does not send anything externally; it fills the dashboard approval queue for CEO review.',
    'low',
    'prospecting_agent',
    'none',
    JSON.stringify({ requested_batch_size: 25, market: 'Michigan / Midwest', action: 'research_only' }),
  ]);

  await db.query(`
    UPDATE growth_agents
    SET status = CASE
        WHEN key IN ('prospecting_agent','outreach_agent') THEN 'needs_review'
        WHEN key = 'scoreboard_agent' THEN 'running'
        ELSE status
      END,
      current_work = CASE
        WHEN key = 'prospecting_agent' THEN 'Starter batch seeded. Awaiting CEO approval to enrich first 25 Michigan/Midwest targets.'
        WHEN key = 'outreach_agent' THEN 'Starter campaign draft seeded. Awaiting CEO approval before queueing or live sending.'
        WHEN key = 'scoreboard_agent' THEN 'Monitoring launch queue and summarizing CEO decisions needed.'
        ELSE current_work
      END,
      last_output = CASE
        WHEN key = 'prospecting_agent' THEN '5 starter prospects seeded; no emails verified yet.'
        WHEN key = 'outreach_agent' THEN '1 starter email campaign drafted; safe-mode prevents external sends.'
        WHEN key = 'scoreboard_agent' THEN 'Executive summary now has approval work to drive.'
        ELSE last_output
      END,
      last_run_at = NOW(),
      updated_at = NOW()
  `);

  await logActivity({
    agentKey: 'scoreboard_agent',
    eventType: 'starter_seed',
    title: 'Starter growth command queue created',
    detail: 'Seeded 5 starter prospects, 1 campaign draft, and 2 approval decisions. External sending remains disabled in safe mode.',
    payload: { prospects: insertedProspects.length, campaign_id: campaign.rows[0].id },
  });
}

function buildExecutiveSummary({ p, c, a, agents }) {
  const pending = Number(a.pending || 0);
  const sent = Number(p.sent || 0);
  const replies = Number(p.replies || 0);
  const uploads = Number(p.uploads || 0);
  const paid = Number(p.paid || 0);
  const runningAgents = agents.filter((agent) => agent.status === 'running').length;
  const blockedAgents = agents.filter((agent) => ['blocked', 'error'].includes(agent.status)).length;

  const nextDecision = pending > 0
    ? `${pending} item${pending === 1 ? '' : 's'} waiting for CEO approval.`
    : 'No approval blockers right now; next move is fill the queue with qualified prospects and drafts.';

  const traction = paid > 0
    ? `${paid} paid unlock${paid === 1 ? '' : 's'} recorded.`
    : uploads > 0
      ? `${uploads} upload${uploads === 1 ? '' : 's'} recorded; conversion to paid is the next pressure point.`
      : replies > 0
        ? `${replies} repl${replies === 1 ? 'y' : 'ies'} recorded; push interested replies toward one document upload.`
        : sent > 0
          ? `${sent} outreach item${sent === 1 ? '' : 's'} sent; watch reply quality and follow-up timing.`
          : 'No outbound traction recorded yet; first approved send batch is the immediate launch lever.';

  const agentHealth = blockedAgents > 0
    ? `${blockedAgents} agent${blockedAgents === 1 ? '' : 's'} blocked or errored.`
    : `${runningAgents} agent${runningAgents === 1 ? '' : 's'} running; remaining agents idle/ready.`;

  return {
    headline: nextDecision,
    traction,
    agent_health: agentHealth,
    recommended_ceo_action: pending > 0 ? 'Review the approval queue and approve/reject/edit the highest-priority outbound items.' : 'Ask the Prospecting and Outreach agents to prepare the next 25-target batch.',
  };
}

async function listApprovals() {
  const result = await db.query(`
    SELECT a.*, ag.name AS requested_by_agent_name
    FROM growth_approvals a
    LEFT JOIN growth_agents ag ON ag.key = a.requested_by_agent_key
    ORDER BY CASE a.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, a.created_at DESC
    LIMIT 100
  `);
  return result.rows;
}

async function listCampaigns() {
  const result = await db.query(`
    SELECT c.*,
      COUNT(r.id)::int AS recipient_count,
      COUNT(r.id) FILTER (WHERE r.status='sent')::int AS sent_count,
      COUNT(r.id) FILTER (WHERE r.status='failed')::int AS failed_count,
      COALESCE(
        json_agg(
          json_build_object(
            'id', r.id,
            'company', r.company,
            'email', r.email,
            'name', r.name,
            'personalized_opening', r.personalized_opening,
            'final_subject', r.final_subject,
            'final_body', r.final_body,
            'status', r.status
          ) ORDER BY r.created_at
        ) FILTER (WHERE r.id IS NOT NULL),
        '[]'::json
      ) AS recipient_drafts
    FROM growth_campaigns c
    LEFT JOIN growth_campaign_recipients r ON r.campaign_id = c.id
    GROUP BY c.id
    ORDER BY c.created_at DESC
    LIMIT 100
  `);
  return result.rows;
}

async function listProspects() {
  const result = await db.query(`
    SELECT * FROM growth_prospects
    ORDER BY priority_score DESC, created_at DESC
    LIMIT 250
  `);
  return result.rows;
}


async function runAgent(agentKey, options = {}) {
  await ensureStarterGrowthData();

  const agentResult = await db.query(`SELECT * FROM growth_agents WHERE key=$1`, [agentKey]);
  if (!agentResult.rows.length) return { ok: false, status: 404, error: 'Agent not found' };

  await setAgent(agentKey, {
    status: 'running',
    currentWork: 'Manual CEO-triggered run started from Growth Command Center.',
    lastRunAt: true,
  });

  let result;
  if (agentKey === 'prospecting_agent') result = await runProspectingAgent(options);
  else if (agentKey === 'outreach_agent') result = await runOutreachAgent(options);
  else if (agentKey === 'content_agent') result = await runContentAgent(options);
  else if (agentKey === 'site_qa_agent') result = await runSiteQaAgent(options);
  else if (agentKey === 'product_intel_agent') result = await runProductIntelAgent(options);
  else if (agentKey === 'scoreboard_agent') result = await runScoreboardAgent(options);
  else result = { message: 'Agent acknowledged. No specialized run handler is configured yet.', created: 0 };

  await setAgent(agentKey, {
    status: result.needs_review ? 'needs_review' : 'idle',
    currentWork: result.current_work || 'Run complete. Waiting for next CEO direction.',
    lastOutput: result.message,
    lastRunAt: true,
  });

  await logActivity({
    agentKey,
    eventType: 'agent_run',
    title: `${agentResult.rows[0].name} run completed`,
    detail: result.message,
    payload: result,
  });

  return { ok: true, agent_key: agentKey, result };
}

async function setAgent(agentKey, { status, currentWork, lastOutput, lastRunAt = false, nextRunAt = undefined }) {
  const updates = ['updated_at=NOW()'];
  const values = [agentKey];
  let i = 2;
  if (status) { updates.push(`status=$${i++}`); values.push(status); }
  if (currentWork !== undefined) { updates.push(`current_work=$${i++}`); values.push(currentWork); }
  if (lastOutput !== undefined) { updates.push(`last_output=$${i++}`); values.push(lastOutput); }
  if (lastRunAt) updates.push('last_run_at=NOW()');
  if (nextRunAt !== undefined) { updates.push(`next_run_at=$${i++}`); values.push(nextRunAt); }
  await db.query(`UPDATE growth_agents SET ${updates.join(', ')} WHERE key=$1`, values);
}

async function createApprovalIfMissing({ itemType = 'other', itemId = null, title, summary, riskLevel = 'low', agentKey, actionType = 'none', actionPayload = {} }) {
  const existing = await db.query(
    `SELECT id FROM growth_approvals WHERE title=$1 AND status='pending' LIMIT 1`,
    [title]
  );
  if (existing.rows.length) return { id: existing.rows[0].id, created: false };
  const result = await db.query(`
    INSERT INTO growth_approvals (
      item_type, item_id, title, summary, risk_level, requested_by_agent_key, action_type, action_payload
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id
  `, [itemType, itemId, title, summary, riskLevel, agentKey, actionType, JSON.stringify(actionPayload)]);
  return { id: result.rows[0].id, created: true };
}

async function researchAndEnrichProspects({ market, batchSize }) {
  const queries = buildProspectingQueries(market);
  const rawResults = [];
  for (const query of queries) {
    try {
      const results = await searchProspectWeb(query);
      rawResults.push(...results.map((result) => ({ ...result, query })));
    } catch (err) {
      rawResults.push({ query, error: err.message });
    }
    if (rawResults.filter((result) => result.url).length >= batchSize * 2) break;
  }

  let candidates = dedupeProspectCandidates(rawResults).slice(0, batchSize);
  let source = process.env.BRAVE_SEARCH_API_KEY ? 'brave_search_api' : 'duckduckgo_html_search';
  if (!candidates.length) {
    const directoryResults = await directoryProspectSearch(market);
    rawResults.push(...directoryResults.map((result) => ({ ...result, query: 'property-management-directory-fallback' })));
    candidates = dedupeProspectCandidates(rawResults).slice(0, batchSize);
    if (candidates.length) source = `${source}+property_management_directory`;
  }
  const enriched = [];
  for (const candidate of candidates) {
    // Keep this bounded because the button is a live admin request, not a long background job.
    // eslint-disable-next-line no-await-in-loop
    enriched.push(await enrichProspectCandidate(candidate, market));
  }

  return {
    source,
    queries,
    prospects: enriched.filter((prospect) => prospect.company && prospect.website_url),
    raw_result_count: rawResults.length,
  };
}

function buildProspectingQueries(market) {
  const region = String(market || 'Michigan Midwest').replace(/\s*\/\s*/g, ' ');
  return [
    `${region} property management company facilities director elevator`,
    `${region} commercial property management firm building operations`,
    `${region} multifamily property management company maintenance director`,
    `${region} condo association management company elevator maintenance`,
    `${region} real estate owner operator facilities property management`,
  ];
}

async function searchProspectWeb(query) {
  if (process.env.BRAVE_SEARCH_API_KEY) return braveSearch(query);
  return duckDuckGoSearch(query);
}

async function directoryProspectSearch(market) {
  const urls = [
    'https://www.propertymanagement.com/companies-in-detroit-mi/',
    'https://www.propertymanagement.com/companies-in-ann-arbor-mi/',
    'https://www.propertymanagement.com/companies-in-grand-rapids-mi/',
  ];
  const results = [];
  for (const url of urls) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const response = await fetchWithTimeout(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 ElevatorIQGrowthResearch/1.0', Accept: 'text/html,application/xhtml+xml' },
      }, 9000);
      if (!response.ok) continue;
      // eslint-disable-next-line no-await-in-loop
      const html = await response.text();
      results.push(...extractPropertyManagementDirectoryResults(html, url, market));
    } catch (_err) {
      // Directory fallback is best-effort.
    }
    if (results.length >= 30) break;
  }
  return results;
}

function extractPropertyManagementDirectoryResults(html, sourceUrl, market) {
  const results = [];
  const seen = new Set();
  const jsonNameRegex = /"name"\s*:\s*"([^"]{3,120})"[\s\S]{0,900}?"description"\s*:\s*"([^"]{3,240})"[\s\S]{0,1200}?"urlTemplate"\s*:\s*"([^"]+)"/gi;
  let match;
  while ((match = jsonNameRegex.exec(html)) !== null && results.length < 40) {
    const company = stripHtml(match[1]).replace(/\\u0026/g, '&');
    const description = stripHtml(match[2]).replace(/\\u0026/g, '&');
    const profileUrl = match[3].replace(/\\\//g, '/');
    if (!company || seen.has(company.toLowerCase())) continue;
    seen.add(company.toLowerCase());
    results.push({
      title: company,
      url: profileUrl,
      snippet: `${description}. Directory source for ${market}.`,
    });
  }

  const headingRegex = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi;
  while ((match = headingRegex.exec(html)) !== null && results.length < 40) {
    const company = stripHtml(match[1]);
    if (!company || company.length < 3 || seen.has(company.toLowerCase())) continue;
    if (/property management|apartments|real estate|management|properties/i.test(company)) {
      seen.add(company.toLowerCase());
      results.push({
        title: company,
        url: sourceUrl,
        snippet: `${company} appears in a Michigan property-management directory. Needs official-site/contact verification before live sending.`,
      });
    }
  }
  return results;
}

async function braveSearch(query) {
  const response = await fetchWithTimeout(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`, {
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': process.env.BRAVE_SEARCH_API_KEY,
    },
  }, 8000);
  if (!response.ok) throw new Error(`Brave search failed: ${response.status}`);
  const body = await response.json();
  return (body.web?.results || []).map((item) => ({
    title: stripHtml(item.title || ''),
    url: item.url,
    snippet: stripHtml(item.description || ''),
  }));
}

async function duckDuckGoSearch(query) {
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await fetchWithTimeout(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 ElevatorIQGrowthResearch/1.0',
      Accept: 'text/html,application/xhtml+xml',
    },
  }, 9000);
  if (!response.ok) throw new Error(`DuckDuckGo search failed: ${response.status}`);
  const html = await response.text();
  const results = [];
  const blockRegex = /<div class="result[\s\S]*?<\/div>\s*<\/div>/gi;
  const blocks = html.match(blockRegex) || [];
  for (const block of blocks) {
    const linkMatch = block.match(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;
    const snippetMatch = block.match(/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i)
      || block.match(/<div[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/div>/i);
    results.push({
      title: stripHtml(linkMatch[2]),
      url: normalizeSearchUrl(linkMatch[1]),
      snippet: stripHtml(snippetMatch?.[1] || ''),
    });
  }
  return results;
}

function dedupeProspectCandidates(rawResults) {
  const blockedHosts = ['google.com', 'bing.com', 'yahoo.com', 'facebook.com', 'linkedin.com', 'instagram.com', 'x.com', 'twitter.com', 'youtube.com', 'yelp.com', 'apartments.com', 'wikipedia.org', 'bloomberg.com', 'zoominfo.com', 'dnb.com', 'rocketreach.co'];
  const seen = new Set();
  const candidates = [];
  for (const result of rawResults) {
    if (!result.url) continue;
    const url = safeUrl(result.url);
    if (!url) continue;
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    const dedupeKey = host === 'propertymanagement.com' ? `${host}${url.pathname.toLowerCase() || result.title?.toLowerCase()}` : host;
    if (blockedHosts.some((blocked) => host === blocked || host.endsWith(`.${blocked}`))) continue;
    if (seen.has(dedupeKey)) continue;
    const combined = `${result.title || ''} ${result.snippet || ''} ${host}`.toLowerCase();
    const isLikelyFit = /(property management|real estate|apartments|multifamily|commercial propert|facility|facilities|condo|hoa|building operations|asset management)/.test(combined);
    if (!isLikelyFit) continue;
    seen.add(dedupeKey);
    candidates.push({
      company: inferCompanyName(result.title, host),
      website_url: host === 'propertymanagement.com' ? url.href : `${url.protocol}//${url.host}`,
      title: result.title,
      snippet: result.snippet,
      source_url: result.url,
      host,
    });
  }
  return candidates;
}

async function enrichProspectCandidate(candidate, market) {
  const pages = await fetchCandidatePages(candidate.website_url);
  const text = pages.map((page) => `${page.url}\n${page.text}`).join('\n\n').slice(0, 12000);
  const email = extractBestEmail(text, candidate.host);
  const linkedinUrl = extractLinkedinUrl(pages.map((page) => page.html).join('\n'));
  const decisionMaker = extractDecisionMaker(text) || 'Property Operations / Facilities Lead';
  const buyerType = inferBuyerType(`${candidate.title} ${candidate.snippet} ${text}`);
  const relevance = buildElevatorRelevance(candidate, buyerType, text, market);
  const score = scoreProspect(candidate, buyerType, text, email);
  const notes = [
    `Live web research source: ${candidate.source_url}`,
    email ? `Public contact email found: ${email}` : 'No public decision-maker email verified; use contact form or enrich manually before live sending.',
    linkedinUrl ? `LinkedIn/company profile found: ${linkedinUrl}` : 'No LinkedIn URL found on fetched pages.',
    `Evidence: ${compactWhitespace(candidate.snippet || candidate.title || '').slice(0, 260)}`,
  ].join('\n');

  return {
    company: candidate.company,
    market: inferMarket(`${candidate.title} ${candidate.snippet} ${text}`, market),
    buyer_type: buyerType,
    decision_maker: decisionMaker,
    title: decisionMaker,
    email,
    linkedin_url: linkedinUrl,
    website_url: candidate.website_url,
    elevator_relevance: relevance,
    priority_score: score,
    notes,
    source: 'live_web_research',
  };
}

async function fetchCandidatePages(baseUrl) {
  const urls = [baseUrl, `${baseUrl.replace(/\/$/, '')}/contact`, `${baseUrl.replace(/\/$/, '')}/about`, `${baseUrl.replace(/\/$/, '')}/team`];
  const pages = [];
  for (const url of urls) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const response = await fetchWithTimeout(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 ElevatorIQGrowthResearch/1.0', Accept: 'text/html,application/xhtml+xml' },
      }, 5000);
      if (!response.ok || !String(response.headers.get('content-type') || '').includes('text/html')) continue;
      // eslint-disable-next-line no-await-in-loop
      const html = await response.text();
      pages.push({ url, html, text: stripHtml(html).slice(0, 6000) });
    } catch (_err) {
      // Some sites block crawlers; keep the rest of the enrichment rather than failing the run.
    }
    if (pages.length >= 2) break;
  }
  return pages;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function upsertResearchedProspect(prospect, defaultMarket) {
  const values = [
    prospect.company,
    prospect.market || defaultMarket,
    prospect.buyer_type,
    prospect.decision_maker,
    prospect.title,
    prospect.email,
    prospect.linkedin_url,
    prospect.website_url,
    prospect.elevator_relevance,
    prospect.priority_score,
    prospect.notes,
    prospect.source,
  ];

  const existing = await db.query(`
    SELECT id FROM growth_prospects
    WHERE lower(company)=lower($1::text)
       OR (
         $2::text IS NOT NULL
         AND lower(regexp_replace(COALESCE(website_url,''), '^https?://(www\\.)?|/.*$', '', 'g'))=lower(regexp_replace($2::text, '^https?://(www\\.)?|/.*$', '', 'g'))
       )
    LIMIT 1
  `, [prospect.company, prospect.website_url]);

  if (!existing.rows.length) {
    const insert = await db.query(`
      INSERT INTO growth_prospects (
        company, market, buyer_type, decision_maker, title, email, linkedin_url, website_url,
        elevator_relevance, priority_score, status, approval_status, notes, source, updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'researched','not_requested',$11,$12,NOW())
      RETURNING id
    `, values);
    return { inserted: insert.rowCount > 0, updated: false };
  }

  const update = await db.query(`
    UPDATE growth_prospects
    SET market=COALESCE($2::text, market),
        buyer_type=COALESCE($3::text, buyer_type),
        decision_maker=COALESCE($4::text, decision_maker),
        title=COALESCE($5::text, title),
        email=COALESCE($6::text, email),
        linkedin_url=COALESCE($7::text, linkedin_url),
        website_url=COALESCE($8::text, website_url),
        elevator_relevance=COALESCE($9::text, elevator_relevance),
        priority_score=GREATEST(COALESCE(priority_score,0), $10::int),
        notes=concat_ws('\n\n', NULLIF(notes,''), $11::text),
        source=$12::text,
        updated_at=NOW()
    WHERE id=$13
    RETURNING id
  `, [...values, existing.rows[0].id]);
  return { inserted: false, updated: update.rowCount > 0 };
}

function buildProspectingApprovalSummary({ market, research, inserted, updated }) {
  const lines = research.prospects.slice(0, 12).map((prospect, index) => (
    `${index + 1}. ${prospect.company} — ${prospect.buyer_type}; score ${prospect.priority_score}; ${prospect.email ? `email/contact: ${prospect.email}` : 'no verified email yet'}; ${prospect.website_url}`
  ));
  return `Prospecting Agent ran live web research for ${market}.\n\nResult: ${research.prospects.length} enriched candidates, ${inserted} new, ${updated} refreshed.\n\nWhat changed: this is no longer the old static starter list. The agent searched the web, filtered for property/facility ICP fit, visited company pages where possible, extracted public contact paths, scored relevance, and saved evidence notes.\n\nCandidates:\n${lines.join('\n') || 'No qualified candidates found from live search.'}\n\nSearch queries used:\n${research.queries.map((query) => `- ${query}`).join('\n')}\n\nSafety: this only researched and saved prospects. It did not send emails, post publicly, or enable outbound actions.`;
}

function normalizeSearchUrl(rawUrl) {
  const decoded = rawUrl.replace(/&amp;/g, '&');
  try {
    const parsed = new URL(decoded, 'https://duckduckgo.com');
    const uddg = parsed.searchParams.get('uddg');
    return uddg ? decodeURIComponent(uddg) : parsed.href;
  } catch (_err) {
    return decoded;
  }
}

function safeUrl(rawUrl) {
  try {
    const url = new URL(normalizeSearchUrl(rawUrl));
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url;
  } catch (_err) {
    return null;
  }
}

function inferCompanyName(title, host) {
  const cleanedTitle = stripHtml(title || '')
    .split(/\s[|–—-]\s/)[0]
    .replace(/\b(home|official site|property management|real estate|apartments|commercial real estate)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleanedTitle && cleanedTitle.length >= 3 && cleanedTitle.length <= 80) return cleanedTitle;
  return host.replace(/^www\./, '').split('.')[0].replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function inferBuyerType(text) {
  const lower = String(text || '').toLowerCase();
  if (/multifamily|apartment|residential communit/.test(lower)) return 'Multifamily property owner/operator';
  if (/commercial real estate|office|retail|industrial/.test(lower)) return 'Commercial real estate/property management';
  if (/condo|hoa|association/.test(lower)) return 'Condo / HOA property management';
  if (/facility|facilities|building operations/.test(lower)) return 'Facilities / building operations';
  return 'Property management firm';
}

function inferMarket(text, fallback) {
  const lower = String(text || '').toLowerCase();
  if (/detroit|southfield|farmington|royal oak|troy|ann arbor|michigan/.test(lower)) return 'Michigan / Midwest';
  if (/ohio|cleveland|columbus|toledo|cincinnati/.test(lower)) return 'Ohio / Midwest';
  if (/indiana|indianapolis|fort wayne/.test(lower)) return 'Indiana / Midwest';
  if (/illinois|chicago/.test(lower)) return 'Illinois / Midwest';
  return fallback;
}

function extractBestEmail(text, host) {
  const matches = Array.from(new Set(String(text || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []));
  const filtered = matches.filter((email) => !/example|privacy|sentry|wixpress|wordpress|schema|domain/.test(email.toLowerCase()));
  const sameDomain = filtered.find((email) => host && email.toLowerCase().includes(host.replace(/^www\./, '').split('.')[0].toLowerCase()));
  return sameDomain || filtered.find((email) => /info|contact|leasing|management|office|hello|admin/i.test(email)) || filtered[0] || null;
}

function extractLinkedinUrl(html) {
  const match = String(html || '').match(/https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/[^"'\s<>]+/i);
  return match ? match[0].replace(/[),.;]+$/, '') : null;
}

function extractDecisionMaker(text) {
  const titles = [
    'Director of Facilities',
    'Facilities Director',
    'Director of Property Management',
    'Property Manager',
    'Regional Property Manager',
    'Director of Operations',
    'Asset Manager',
    'Building Operations Manager',
    'Maintenance Director',
  ];
  const lower = String(text || '').toLowerCase();
  return titles.find((title) => lower.includes(title.toLowerCase())) || null;
}

function buildElevatorRelevance(candidate, buyerType, text, market) {
  const lower = String(text || '').toLowerCase();
  const portfolioHint = /portfolio|properties|communities|apartments|commercial|managed/.test(lower)
    ? 'public pages indicate a managed property portfolio'
    : 'search result indicates property/facility management fit';
  return `${candidate.company} fits the ${market} ElevatorIQ ICP as a ${buyerType}; ${portfolioHint}. Likely use case: reviewing elevator invoices, maintenance contracts, repair proposals, or modernization bids before approval.`;
}

function scoreProspect(candidate, buyerType, text, email) {
  const lower = `${candidate.title || ''} ${candidate.snippet || ''} ${text || ''}`.toLowerCase();
  let score = 62;
  if (/property management|commercial real estate|multifamily|apartments/.test(lower)) score += 12;
  if (/portfolio|properties|communities|managed/.test(lower)) score += 8;
  if (/facility|facilities|maintenance|operations|asset management/.test(lower)) score += 6;
  if (/michigan|detroit|ann arbor|southfield|farmington|troy|midwest/.test(lower)) score += 5;
  if (email) score += 4;
  if (/Condo|HOA/i.test(buyerType)) score -= 3;
  return Math.max(40, Math.min(95, score));
}

function stripHtml(value = '') {
  return compactWhitespace(String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"'));
}

function compactWhitespace(value = '') {
  return String(value).replace(/\s+/g, ' ').trim();
}

async function runProspectingAgent(options = {}) {
  const market = options.market || 'Michigan / Midwest';
  const batchSize = Math.min(Number(options.batch_size || options.batchSize || 12), 25);
  const research = await researchAndEnrichProspects({ market, batchSize });

  let inserted = 0;
  let updated = 0;
  for (const prospect of research.prospects) {
    const result = await upsertResearchedProspect(prospect, market);
    if (result.inserted) inserted += 1;
    else if (result.updated) updated += 1;
  }

  const approvalSummary = buildProspectingApprovalSummary({ market, research, inserted, updated });
  const approval = await createApprovalIfMissing({
    title: `Review Prospecting Agent live research batch — ${new Date().toISOString().slice(0, 10)}`,
    summary: approvalSummary,
    riskLevel: 'low',
    agentKey: 'prospecting_agent',
    actionType: 'none',
    actionPayload: {
      market,
      inserted,
      updated,
      researched: research.prospects.length,
      search_queries: research.queries,
      source: research.source,
    },
  });

  return {
    created: inserted,
    updated,
    researched: research.prospects.length,
    needs_review: true,
    current_work: 'Live web research/enrichment completed. Awaiting CEO review before outreach drafting.',
    message: `Researched ${research.prospects.length} web-derived prospect${research.prospects.length === 1 ? '' : 's'}; added ${inserted}, refreshed ${updated}.`,
    approval_id: approval.id,
    source: research.source,
  };
}

async function runOutreachAgent() {
  const prospects = await db.query(`
    SELECT * FROM growth_prospects
    WHERE status IN ('researched','ready_for_approval','approved')
      AND COALESCE(approval_status,'not_requested') <> 'rejected'
      AND id NOT IN (
        SELECT DISTINCT prospect_id
        FROM growth_campaign_recipients
        WHERE prospect_id IS NOT NULL
          AND status IN ('ready_for_approval','approved','queued','sending','sent')
          AND created_at > NOW() - INTERVAL '21 days'
      )
    ORDER BY
      CASE WHEN email IS NOT NULL AND email <> '' THEN 0 ELSE 1 END,
      priority_score DESC,
      created_at DESC
    LIMIT 5
  `);
  if (!prospects.rows.length) {
    return { created: 0, message: 'No eligible prospects found. Run Prospecting Agent first, or review existing campaign drafts before creating another batch.', current_work: 'Waiting for fresh prospects.' };
  }

  const drafts = prospects.rows.map((prospect) => buildPersonalizedOutreachDraft(prospect));
  const campaignSubject = 'Personalized elevator document review preview';
  const campaignBody = buildCampaignBodySummary(drafts);
  const campaign = await db.query(`
    INSERT INTO growth_campaigns (name, channel, objective, subject, body, cta, status, approval_status, owner_agent_key)
    VALUES ($1,'email',$2,$3,$4,$5,'ready_for_approval','pending','outreach_agent')
    RETURNING id
  `, [
    `Personalized outreach batch ${new Date().toISOString().slice(0, 10)}`,
    'Prepare individualized, CEO-approval-gated emails for property/facility operators. Safe mode keeps this queued until live actions are explicitly enabled.',
    campaignSubject,
    campaignBody,
    'Ask for one elevator invoice, contract, or proposal upload for a free preview.',
  ]);

  for (const draft of drafts) {
    // eslint-disable-next-line no-await-in-loop
    await db.query(`
      INSERT INTO growth_campaign_recipients (campaign_id, prospect_id, email, name, company, personalized_opening, final_subject, final_body, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ready_for_approval')
    `, [
      campaign.rows[0].id,
      draft.prospect_id,
      draft.email,
      draft.name,
      draft.company,
      draft.personalized_opening,
      draft.subject,
      draft.body,
    ]);
  }

  const approval = await createApprovalIfMissing({
    itemType: 'campaign',
    itemId: campaign.rows[0].id,
    title: `Approve personalized outreach campaign: ${drafts.length}-target batch`,
    summary: buildOutreachApprovalSummary(drafts),
    riskLevel: 'medium',
    agentKey: 'outreach_agent',
    actionType: 'queue_campaign',
    actionPayload: {
      campaign_id: campaign.rows[0].id,
      recipient_count: drafts.length,
      personalized: true,
      recipients_with_email: drafts.filter((draft) => draft.email).length,
      safe_mode_note: 'Approval queues only unless GROWTH_ACTIONS_ENABLED=true. Recipients without emails require manual contact/enrichment before live sending.',
    },
  });

  return {
    created: 1,
    needs_review: true,
    current_work: 'Personalized campaign drafted. Awaiting CEO approval/edit request.',
    message: `Drafted ${drafts.length} personalized email${drafts.length === 1 ? '' : 's'} for CEO approval. ${drafts.filter((draft) => draft.email).length} have public emails/contact emails on file.`,
    campaign_id: campaign.rows[0].id,
    approval_id: approval.id,
  };
}

function buildPersonalizedOutreachDraft(prospect) {
  const company = cleanForEmail(prospect.company || 'your team');
  const contactName = inferFirstName(prospect.decision_maker);
  const salutation = contactName ? `Hi ${contactName},` : 'Hi,';
  const relevance = buildPersonalizedOpening(prospect);
  const useCase = chooseOutreachUseCase(prospect);
  const subject = buildPersonalizedSubject(prospect, useCase);
  const body = [
    salutation,
    '',
    relevance,
    '',
    `ElevatorIQ gives property and facilities teams a free preview on one elevator ${useCase.documentType} before they decide whether to unlock the full plain-English report for $99.`,
    '',
    'The useful part is that it turns the document into practical review points: what looks unclear, what may need backup, what questions to ask the vendor, and what is not decision-ready yet.',
    '',
    useCase.ask,
    '',
    'Thanks,',
    'The ElevatorIQ Team',
    'https://elevatoriq.ai',
  ].join('\n');

  return {
    prospect_id: prospect.id,
    company,
    email: prospect.email || null,
    name: contactName || prospect.decision_maker || null,
    subject,
    body,
    personalized_opening: relevance,
    evidence_note: buildProspectEvidenceNote(prospect),
  };
}

function buildPersonalizedSubject(prospect, useCase) {
  const company = cleanForEmail(prospect.company || 'your properties');
  if (/contract/i.test(useCase.documentType)) return `${company}: elevator contract review preview`;
  if (/invoice/i.test(useCase.documentType)) return `${company}: elevator invoice review preview`;
  if (/bid|proposal/i.test(useCase.documentType)) return `${company}: elevator bid review preview`;
  return `${company}: elevator document review preview`;
}

function buildPersonalizedOpening(prospect) {
  const company = cleanForEmail(prospect.company || 'your company');
  const buyerType = cleanForEmail(prospect.buyer_type || 'property/facility operator');
  const market = cleanForEmail(prospect.market || 'Michigan/Midwest');
  const relevance = cleanForEmail(prospect.elevator_relevance || 'your team likely has to review vendor documents before approving elevator work');
  if (/condo|hoa/i.test(`${prospect.buyer_type || ''} ${prospect.notes || ''}`)) {
    return `I had ${company} on my Michigan/Midwest property-operations list because HOA and condo managers often have to explain elevator invoices, maintenance contracts, or repair proposals to boards before approving spend.`;
  }
  if (/multifamily|apartments|communities/i.test(`${prospect.buyer_type || ''} ${prospect.elevator_relevance || ''}`)) {
    return `I had ${company} on my ${market} operator list because multifamily portfolios often see recurring elevator invoices, service contracts, and repair proposals across properties.`;
  }
  if (/commercial|real estate|asset/i.test(`${prospect.buyer_type || ''} ${prospect.elevator_relevance || ''}`)) {
    return `I had ${company} on my ${market} commercial property list because teams managing buildings often need a quick second set of eyes on elevator contracts, invoices, and modernization bids.`;
  }
  return `I had ${company} on my ${market} outreach list because it appears to fit ElevatorIQ's early ICP as a ${buyerType}: ${truncateSentence(relevance, 210)}`;
}

function chooseOutreachUseCase(prospect) {
  const combined = `${prospect.buyer_type || ''} ${prospect.elevator_relevance || ''} ${prospect.notes || ''}`.toLowerCase();
  if (/maintenance|service contract|contract|hoa|condo/.test(combined)) {
    return {
      documentType: 'maintenance contract or invoice',
      ask: 'Would it be worth having whoever handles elevator vendor decisions send one recent contract or invoice through for a free preview?',
    };
  }
  if (/modernization|bid|proposal|capital|asset/.test(combined)) {
    return {
      documentType: 'bid or proposal',
      ask: 'Would it be worth sending one recent elevator bid or proposal through for a free preview before the next approval conversation?',
    };
  }
  return {
    documentType: 'invoice, contract, or proposal',
    ask: 'Would it be worth sending one recent elevator document through for a free preview?',
  };
}

function buildCampaignBodySummary(drafts) {
  return drafts.map((draft, index) => [
    `Recipient ${index + 1}: ${draft.company}${draft.email ? ` <${draft.email}>` : ' — email/contact enrichment still needed'}`,
    `Subject: ${draft.subject}`,
    draft.body,
  ].join('\n')).join('\n\n---\n\n');
}

function buildOutreachApprovalSummary(drafts) {
  const withEmail = drafts.filter((draft) => draft.email).length;
  const header = `Outreach Agent drafted ${drafts.length} individualized email${drafts.length === 1 ? '' : 's'} for CEO review. ${withEmail}/${drafts.length} currently have a public email/contact email saved. Safe mode means approval records/queues only; it will not send externally until live actions are explicitly enabled.`;
  const recipientBlocks = drafts.map((draft, index) => [
    `\n${index + 1}. ${draft.company}${draft.email ? ` — ${draft.email}` : ' — no verified direct email yet'}`,
    `Evidence/personality hook: ${draft.evidence_note}`,
    `Subject: ${draft.subject}`,
    `Body:\n${draft.body}`,
  ].join('\n'));
  return [header, ...recipientBlocks].join('\n');
}

function buildProspectEvidenceNote(prospect) {
  const parts = [];
  if (prospect.market) parts.push(`market: ${prospect.market}`);
  if (prospect.buyer_type) parts.push(`buyer type: ${prospect.buyer_type}`);
  if (prospect.elevator_relevance) parts.push(`relevance: ${truncateSentence(prospect.elevator_relevance, 190)}`);
  if (prospect.source) parts.push(`source: ${prospect.source}`);
  return parts.join(' | ') || 'property/facility management ICP fit from Growth Command prospecting data';
}

function inferFirstName(value) {
  const text = String(value || '').trim();
  if (!text || /manager|director|lead|operations|facilities|property|asset|maintenance|decision maker/i.test(text)) return null;
  const first = text.split(/\s+/)[0].replace(/[^a-z'-]/gi, '');
  return first && first.length > 1 ? first : null;
}

function cleanForEmail(value) {
  return compactWhitespace(String(value || '').replace(/[<>]/g, ''));
}

function truncateSentence(value, maxLength) {
  const text = cleanForEmail(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}…`;
}

async function runContentAgent() {
  const posts = [
    'Most elevator invoices are hard to judge because the real issue is rarely one line item. It is whether labor, trip charges, parts, callbacks, and contract coverage all line up. ElevatorIQ turns the document into plain-English questions before you approve it.',
    'Before signing an elevator modernization proposal, ask: what is included, what is excluded, what is allowance-based, what can trigger change orders, and what schedule assumptions are buried in the fine print?',
    'A cheap elevator maintenance contract can get expensive if callbacks, after-hours labor, parts, testing support, or annual increases are excluded. The monthly price is only one part of the real annual exposure.'
  ];
  let created = 0;
  for (let i = 0; i < posts.length; i += 1) {
    const approval = await createApprovalIfMissing({
      itemType: 'content',
      title: `Approve faceless LinkedIn post ${i + 1}: elevator document red flags`,
      summary: `${posts[i]}\n\nCTA: Upload one elevator invoice, contract, or proposal at elevatoriq.ai for a free preview.`,
      riskLevel: 'low',
      agentKey: 'content_agent',
      actionType: 'none',
      actionPayload: { channel: 'linkedin_company_page', draft: posts[i] },
    });
    if (approval.created) created += 1;
  }
  return { created, needs_review: true, current_work: 'Content drafts ready for CEO approval.', message: `Created ${created} new content approval item${created === 1 ? '' : 's'} for faceless authority posts.` };
}

async function runSiteQaAgent() {
  const summary = `Site QA Agent checklist queued for CEO/product review:\n\n1. Live homepage loads and CTA starts upload.\n2. Upload accepts invoice, contract, modernization proposal, and maintenance bid docs.\n3. Free preview produces named findings without giving away full paid report.\n4. Stripe checkout shows $99 and clean product copy.\n5. Paid report uses Rulebook v2 language and avoids legal/vendor accusations.\n6. Admin Growth Command remains protected by admin key.`;
  const approval = await createApprovalIfMissing({
    itemType: 'qa_fix',
    title: 'Review Site QA Agent launch checklist before outbound traffic',
    summary,
    riskLevel: 'medium',
    agentKey: 'site_qa_agent',
    actionType: 'none',
    actionPayload: { checklist: 'launch_upload_preview_stripe_report_admin' },
  });
  return { created: approval.created ? 1 : 0, needs_review: true, current_work: 'QA checklist ready. Waiting for CEO/product review.', message: 'Queued the launch QA checklist for approval/review.', approval_id: approval.id };
}

async function runProductIntelAgent() {
  const summary = `Product Intelligence Agent recommends the next feedback loop:\n\n1. Capture report type, preview findings shown, paid unlock, and top objection for every upload.\n2. Score each paid report on: worth $99, evidence anchors, vendor-neutral language, next questions, and decision-readiness.\n3. Feed recurring issues back into Rulebook v2.\n4. Use objections to update homepage FAQ and outreach copy weekly.`;
  const approval = await createApprovalIfMissing({
    itemType: 'other',
    title: 'Approve Product Intelligence weekly feedback loop',
    summary,
    riskLevel: 'low',
    agentKey: 'product_intel_agent',
    actionType: 'none',
    actionPayload: { cadence: 'weekly', focus: 'uploads_reports_objections_rulebook' },
  });
  return { created: approval.created ? 1 : 0, needs_review: true, current_work: 'Feedback loop proposal ready for CEO approval.', message: 'Queued product intelligence feedback-loop approval.', approval_id: approval.id };
}

async function runScoreboardAgent() {
  const summary = await getSummary();
  const detail = `CEO summary: ${summary.executive_summary.headline} ${summary.executive_summary.traction} Recommended action: ${summary.executive_summary.recommended_ceo_action}`;
  await logActivity({ agentKey: 'scoreboard_agent', eventType: 'scoreboard_refresh', title: 'Scoreboard refreshed by CEO control', detail, payload: summary.executive_summary });
  return { created: 0, current_work: 'Scoreboard refreshed. Monitoring CEO decisions and traction.', message: detail };
}

async function approveItem(approvalId, decisionNotes = '') {
  const approvalResult = await db.query(`SELECT * FROM growth_approvals WHERE id=$1`, [approvalId]);
  if (!approvalResult.rows.length) return { ok: false, status: 404, error: 'Approval not found' };

  const approval = approvalResult.rows[0];
  if (approval.status !== 'pending') {
    return { ok: false, status: 409, error: `Approval is already ${approval.status}` };
  }

  await db.query(
    `UPDATE growth_approvals SET status='approved', decision_notes=$2, decided_at=NOW(), updated_at=NOW() WHERE id=$1`,
    [approvalId, decisionNotes || null]
  );

  const actionResult = await executeApprovalAction(approval);

  await db.query(
    `UPDATE growth_approvals SET status=$2, executed_at=CASE WHEN $2 IN ('executed','failed') THEN NOW() ELSE executed_at END, action_result=$3, updated_at=NOW() WHERE id=$1`,
    [approvalId, actionResult.status, JSON.stringify(actionResult)]
  );

  await logActivity({
    agentKey: approval.requested_by_agent_key,
    eventType: 'approval_decision',
    title: `${approval.title} — ${actionResult.status}`,
    detail: decisionNotes || null,
    payload: actionResult,
  });

  return { ok: true, approval_id: approvalId, result: actionResult };
}

async function rejectItem(approvalId, status, decisionNotes = '') {
  if (!['needs_edits', 'rejected'].includes(status)) throw new Error('Invalid rejection status');
  const result = await db.query(
    `UPDATE growth_approvals SET status=$2, decision_notes=$3, decided_at=NOW(), updated_at=NOW() WHERE id=$1 RETURNING *`,
    [approvalId, status, decisionNotes || null]
  );
  if (!result.rows.length) return { ok: false, status: 404, error: 'Approval not found' };
  await logActivity({ eventType: 'approval_decision', title: `${result.rows[0].title} — ${status}`, detail: decisionNotes || null });
  return { ok: true, approval: result.rows[0] };
}

async function executeApprovalAction(approval) {
  if (approval.action_type === 'none' || !approval.action_type) {
    return { status: 'executed', message: 'Approval recorded; no external action configured.' };
  }

  if (!actionsEnabled()) {
    return { status: 'approved', queued: true, message: 'Approval recorded. External actions are disabled until GROWTH_ACTIONS_ENABLED=true.' };
  }

  if (approval.action_type === 'send_email') {
    return sendApprovedEmail(approval.action_payload || {});
  }

  if (approval.action_type === 'queue_campaign') {
    const campaignId = approval.item_type === 'campaign' ? approval.item_id : approval.action_payload?.campaign_id;
    if (!campaignId) return { status: 'failed', error: 'Missing campaign_id' };
    return sendApprovedCampaign(campaignId);
  }

  if (approval.action_type === 'mark_prospect_approved') {
    const prospectId = approval.item_type === 'prospect' ? approval.item_id : approval.action_payload?.prospect_id;
    if (!prospectId) return { status: 'failed', error: 'Missing prospect_id' };
    await db.query(`UPDATE growth_prospects SET status='approved', approval_status='approved', updated_at=NOW() WHERE id=$1`, [prospectId]);
    return { status: 'executed', message: 'Prospect approved.' };
  }

  return { status: 'approved', queued: true, message: `Action type ${approval.action_type} is approved but not auto-executable yet.` };
}

async function sendApprovedCampaign(campaignId) {
  if (!process.env.EMAIL_PROVIDER_API_KEY) {
    return { status: 'failed', error: 'EMAIL_PROVIDER_API_KEY is not configured' };
  }

  const campaign = await db.query(`SELECT id, name FROM growth_campaigns WHERE id=$1`, [campaignId]);
  if (!campaign.rows.length) return { status: 'failed', error: 'Campaign not found' };

  await db.query(`UPDATE growth_campaigns SET status='running', approval_status='approved', updated_at=NOW() WHERE id=$1`, [campaignId]);

  const recipients = await db.query(`
    SELECT id, prospect_id, email, company, final_subject, final_body
    FROM growth_campaign_recipients
    WHERE campaign_id=$1
      AND status IN ('ready_for_approval','approved','queued','failed')
    ORDER BY created_at ASC
  `, [campaignId]);

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const results = [];

  for (const recipient of recipients.rows) {
    if (!recipient.email || !recipient.final_subject || !recipient.final_body) {
      skipped += 1;
      // eslint-disable-next-line no-await-in-loop
      await db.query(`
        UPDATE growth_campaign_recipients
        SET status='failed', error='Missing email, subject, or body; needs enrichment before sending.', updated_at=NOW()
        WHERE id=$1
      `, [recipient.id]);
      results.push({ recipient_id: recipient.id, company: recipient.company, status: 'skipped', error: 'Missing email/subject/body' });
      continue;
    }

    try {
      // eslint-disable-next-line no-await-in-loop
      await db.query(`UPDATE growth_campaign_recipients SET status='sending', error=NULL, updated_at=NOW() WHERE id=$1`, [recipient.id]);
      // eslint-disable-next-line no-await-in-loop
      const sendResult = await sendApprovedEmail({
        to: recipient.email,
        subject: recipient.final_subject,
        text: recipient.final_body,
      });

      if (sendResult.status === 'executed') {
        sent += 1;
        // eslint-disable-next-line no-await-in-loop
        await db.query(`
          UPDATE growth_campaign_recipients
          SET status='sent', provider_message_id=$2, sent_at=NOW(), error=NULL, updated_at=NOW()
          WHERE id=$1
        `, [recipient.id, sendResult.id]);
        if (recipient.prospect_id) {
          // eslint-disable-next-line no-await-in-loop
          await db.query(`
            UPDATE growth_prospects
            SET status='sent', approval_status='approved', last_contacted_at=NOW(), next_follow_up_at=NOW() + INTERVAL '4 days', updated_at=NOW()
            WHERE id=$1
          `, [recipient.prospect_id]);
        }
      } else {
        failed += 1;
        // eslint-disable-next-line no-await-in-loop
        await db.query(`
          UPDATE growth_campaign_recipients
          SET status='failed', error=$2, updated_at=NOW()
          WHERE id=$1
        `, [recipient.id, sendResult.error || sendResult.message || 'Send failed']);
      }
      results.push({ recipient_id: recipient.id, company: recipient.company, email: recipient.email, ...sendResult });
    } catch (err) {
      failed += 1;
      // eslint-disable-next-line no-await-in-loop
      await db.query(`UPDATE growth_campaign_recipients SET status='failed', error=$2, updated_at=NOW() WHERE id=$1`, [recipient.id, err.message]);
      results.push({ recipient_id: recipient.id, company: recipient.company, email: recipient.email, status: 'failed', error: err.message });
    }
  }

  const finalStatus = sent > 0 && failed === 0 && skipped === 0 ? 'sent' : 'paused';
  await db.query(`UPDATE growth_campaigns SET status=$2, updated_at=NOW() WHERE id=$1`, [campaignId, finalStatus]);

  await logActivity({
    agentKey: 'outreach_agent',
    eventType: 'campaign_send',
    title: `${campaign.rows[0].name} send completed`,
    detail: `Sent ${sent}, skipped ${skipped}, failed ${failed}.`,
    payload: { campaign_id: campaignId, sent, skipped, failed, results },
  });

  return {
    status: sent > 0 && failed === 0 ? 'executed' : (sent > 0 ? 'executed' : 'failed'),
    provider: 'resend',
    campaign_id: campaignId,
    sent,
    skipped,
    failed,
    message: `Campaign processed. Sent ${sent}, skipped ${skipped}, failed ${failed}.`,
    results,
  };
}

async function sendApprovedEmail(payload) {
  const to = payload.to || payload.email;
  const subject = payload.subject;
  const text = payload.text || payload.body;
  const html = payload.html || textToHtml(text);
  if (!to || !subject || !text) return { status: 'failed', error: 'Missing to/subject/body for send_email action' };
  if (!process.env.EMAIL_PROVIDER_API_KEY) return { status: 'failed', error: 'EMAIL_PROVIDER_API_KEY is not configured' };

  const from = formatFromEmail(process.env.OUTREACH_FROM_EMAIL || process.env.FROM_EMAIL || BRAND.reportsFromEmail, process.env.OUTREACH_FROM_NAME || 'ElevatorIQ');
  const result = await resend.emails.send({ from, to, subject, html, text });
  if (result.error) return { status: 'failed', error: result.error.message };
  return { status: 'executed', provider: 'resend', id: result.data?.id || result.id || null, to, subject };
}

function textToHtml(text = '') {
  const escaped = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
  return `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#111827;max-width:620px">${escaped}</div>`;
}

async function logActivity({ agentKey = null, eventType, title, detail = null, payload = {} }) {
  await db.query(
    `INSERT INTO growth_activity_events (agent_key, event_type, title, detail, payload) VALUES ($1,$2,$3,$4,$5)`,
    [agentKey, eventType, title, detail, JSON.stringify(payload)]
  );
}

module.exports = {
  getSummary,
  listApprovals,
  listCampaigns,
  listProspects,
  runAgent,
  approveItem,
  rejectItem,
};
