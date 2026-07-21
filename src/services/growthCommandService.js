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
      COUNT(r.id) FILTER (WHERE r.status='failed')::int AS failed_count
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
    await db.query(`UPDATE growth_campaigns SET status='queued', approval_status='approved', updated_at=NOW() WHERE id=$1`, [campaignId]);
    return { status: 'executed', queued: true, message: 'Campaign queued.' };
  }

  if (approval.action_type === 'mark_prospect_approved') {
    const prospectId = approval.item_type === 'prospect' ? approval.item_id : approval.action_payload?.prospect_id;
    if (!prospectId) return { status: 'failed', error: 'Missing prospect_id' };
    await db.query(`UPDATE growth_prospects SET status='approved', approval_status='approved', updated_at=NOW() WHERE id=$1`, [prospectId]);
    return { status: 'executed', message: 'Prospect approved.' };
  }

  return { status: 'approved', queued: true, message: `Action type ${approval.action_type} is approved but not auto-executable yet.` };
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
  approveItem,
  rejectItem,
};
