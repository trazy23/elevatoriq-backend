#!/usr/bin/env node
/*
  ElevatorIQ Growth Command daily revenue machine.

  Runs locally on Trey's Mac with production Render Postgres access. It owns the
  daily operating cadence around the production Growth Command data:
  - research/enrichment and draft queue creation through growthCommandService
  - inbox/reply/bounce monitoring through Himalaya elevatoriq Gmail
  - follow-up due approvals
  - daily/weekly executive reports written back to Growth Command activity

  External sends/posts are still approval-gated by Growth Command approvals.
*/
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const backendRoot = path.join(__dirname, '..');
const bridgeEnvPath = process.env.EIQ_BRIDGE_ENV_FILE || path.join(os.homedir(), '.hermes', 'secrets', 'elevatoriq-render.env');
require('dotenv').config({ path: fs.existsSync(bridgeEnvPath) ? bridgeEnvPath : path.join(backendRoot, '.env') });

const db = require('../src/db');
const growth = require('../src/services/growthCommandService');

const ACCOUNT = process.env.GROWTH_HIMALAYA_ACCOUNT || 'elevatoriq';
const DEFAULT_MARKET = process.env.GROWTH_DEFAULT_MARKET || 'Michigan / Midwest';
const DEFAULT_BATCH = Number(process.env.GROWTH_DAILY_BATCH_SIZE || 12);

function arg(name, fallback = null) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  const inline = process.argv.find((item) => item.startsWith(`--${name}=`));
  return inline ? inline.slice(name.length + 3) : fallback;
}

async function logActivity({ agentKey = 'scoreboard_agent', eventType, title, detail = null, payload = {} }) {
  await db.query(
    `INSERT INTO growth_activity_events (agent_key, event_type, title, detail, payload)
     VALUES ($1::text,$2::text,$3::text,$4::text,$5::jsonb)`,
    [agentKey, eventType, title, detail, JSON.stringify(payload)]
  );
}

function runHimalaya(args, options = {}) {
  return execFileSync('himalaya', args, {
    encoding: 'utf8',
    timeout: options.timeout || 60_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function safeJson(text, fallback) {
  try { return JSON.parse(text); } catch (_err) { return fallback; }
}

function normalizeEmail(value = '') {
  return String(value || '').trim().toLowerCase();
}

function classifyInbound(message) {
  const subject = String(message.subject || '').toLowerCase();
  const from = normalizeEmail(message.from?.addr || message.from || '');
  const text = `${subject} ${from}`;
  if (/mailer-daemon|postmaster|delivery subsystem|undeliver|delivery status|bounce|failure notice|returned mail/i.test(text)) return 'bounce';
  if (/unsubscribe|remove me|stop emailing|opt out/i.test(text)) return 'unsubscribe';
  if (/out of office|automatic reply|auto.?reply|away from/i.test(text)) return 'out_of_office';
  if (/not interested|no thanks|not a fit|don't need/i.test(text)) return 'not_interested';
  if (/wrong person|not me|contact|reach out|talk to|forward/i.test(text)) return 'referral_or_wrong_person';
  if (/pricing|cost|how much|send|info|interested|yes|sure|upload|demo|question|learn more/i.test(text)) return 'interested_or_question';
  return 'unclassified_reply';
}

async function findMatchingRecipient(inbound) {
  const from = normalizeEmail(inbound.from?.addr || inbound.from || '');
  const subject = String(inbound.subject || '').replace(/^(re|fw|fwd):\s*/i, '').trim();
  let result = await db.query(`
    SELECT r.*, p.company AS prospect_company
    FROM growth_campaign_recipients r
    LEFT JOIN growth_prospects p ON p.id=r.prospect_id
    WHERE lower(r.email)=lower($1::text)
    ORDER BY r.sent_at DESC NULLS LAST, r.created_at DESC
    LIMIT 1
  `, [from]);
  if (result.rows.length) return result.rows[0];
  if (subject) {
    result = await db.query(`
      SELECT r.*, p.company AS prospect_company
      FROM growth_campaign_recipients r
      LEFT JOIN growth_prospects p ON p.id=r.prospect_id
      WHERE lower(r.final_subject)=lower($1::text)
      ORDER BY r.sent_at DESC NULLS LAST, r.created_at DESC
      LIMIT 1
    `, [subject]);
    if (result.rows.length) return result.rows[0];
  }
  return null;
}

async function monitorReplies({ pageSize = 30 } = {}) {
  let envelopes = [];
  try {
    const output = runHimalaya(['envelope', 'list', '--account', ACCOUNT, '--output', 'json', '--page-size', String(pageSize)]);
    envelopes = safeJson(output, []);
  } catch (err) {
    await logActivity({ agentKey: 'outreach_agent', eventType: 'inbox_monitor_error', title: 'Inbox monitor failed', detail: err.message, payload: { account: ACCOUNT } });
    return { checked: 0, matched: 0, errors: [err.message] };
  }

  let matched = 0;
  let actionable = 0;
  const seen = [];
  for (const msg of envelopes) {
    const from = normalizeEmail(msg.from?.addr || msg.from || '');
    if (!from || /apollo|google|resend|stripe|no-reply|noreply|mailer-daemon|postmaster/.test(from)) continue;
    const recipient = await findMatchingRecipient(msg);
    if (!recipient) continue;
    matched += 1;
    const replyClass = classifyInbound(msg);
    const replySummary = `${replyClass}: ${msg.subject || '(no subject)'} from ${from}`;
    await db.query(`
      UPDATE growth_campaign_recipients
      SET status='replied', updated_at=NOW()
      WHERE id=$1::uuid
    `, [recipient.id]);
    if (recipient.prospect_id) {
      const prospectStatus = ['bounce', 'unsubscribe', 'not_interested'].includes(replyClass) ? 'do_not_contact' : 'replied';
      await db.query(`
        UPDATE growth_prospects
        SET status=$2::text,
            reply_summary=$3::text,
            next_follow_up_at=CASE WHEN $2='replied' THEN NOW() + INTERVAL '1 day' ELSE NULL END,
            updated_at=NOW()
        WHERE id=$1::uuid
      `, [recipient.prospect_id, prospectStatus, replySummary]);
    }
    if (!['bounce', 'unsubscribe', 'out_of_office'].includes(replyClass)) {
      actionable += 1;
      await createApprovalIfMissingLocal({
        itemType: 'recipient',
        itemId: recipient.id,
        title: `Reply needs response: ${recipient.company || recipient.prospect_company || from}`,
        summary: `Inbound reply classified as ${replyClass}.\n\nFrom: ${from}\nSubject: ${msg.subject || '(no subject)'}\nMatched campaign recipient: ${recipient.company || recipient.prospect_company || 'unknown'}\n\nNext action: read the message, draft the response, and move interested replies toward uploading one elevator invoice, contract, bid, or proposal for a free preview.`,
        riskLevel: 'medium',
        agentKey: 'outreach_agent',
        actionType: 'none',
        actionPayload: { inbound_id: msg.id, from, subject: msg.subject, reply_class: replyClass, recipient_id: recipient.id },
      });
    }
    seen.push({ from, subject: msg.subject, reply_class: replyClass, recipient_id: recipient.id });
  }

  await logActivity({
    agentKey: 'outreach_agent',
    eventType: 'inbox_monitor',
    title: 'Inbox/reply monitor ran',
    detail: `Checked ${envelopes.length} inbox messages; matched ${matched} campaign replies; queued ${actionable} response approval(s).`,
    payload: { checked: envelopes.length, matched, actionable, seen },
  });
  return { checked: envelopes.length, matched, actionable, seen };
}

async function createApprovalIfMissingLocal({ itemType = 'other', itemId = null, title, summary, riskLevel = 'low', agentKey, actionType = 'none', actionPayload = {} }) {
  const existing = await db.query(`SELECT id FROM growth_approvals WHERE title=$1::text AND status='pending' LIMIT 1`, [title]);
  if (existing.rows.length) return { id: existing.rows[0].id, created: false };
  const result = await db.query(`
    INSERT INTO growth_approvals (item_type, item_id, title, summary, risk_level, requested_by_agent_key, action_type, action_payload)
    VALUES ($1::text,$2::uuid,$3::text,$4::text,$5::text,$6::text,$7::text,$8::jsonb)
    RETURNING id
  `, [itemType, itemId, title, summary, riskLevel, agentKey, actionType, JSON.stringify(actionPayload)]);
  return { id: result.rows[0].id, created: true };
}

async function queueFollowUps() {
  const due = await db.query(`
    SELECT p.*, r.id AS recipient_id, r.final_subject, r.final_body
    FROM growth_prospects p
    LEFT JOIN LATERAL (
      SELECT * FROM growth_campaign_recipients
      WHERE prospect_id=p.id AND status IN ('sent','replied')
      ORDER BY sent_at DESC NULLS LAST, created_at DESC
      LIMIT 1
    ) r ON true
    WHERE p.status IN ('sent','follow_up_due','replied')
      AND p.next_follow_up_at IS NOT NULL
      AND p.next_follow_up_at <= NOW()
      AND NOT EXISTS (
        SELECT 1 FROM growth_approvals a
        WHERE a.status='pending'
          AND a.requested_by_agent_key='outreach_agent'
          AND a.action_payload->>'prospect_id'=p.id::text
          AND a.title ILIKE 'Follow-up due:%'
      )
    ORDER BY p.next_follow_up_at ASC
    LIMIT 10
  `);
  let created = 0;
  for (const p of due.rows) {
    const draft = buildFollowUpDraft(p);
    const approval = await createApprovalIfMissingLocal({
      itemType: p.recipient_id ? 'recipient' : 'prospect',
      itemId: p.recipient_id || p.id,
      title: `Follow-up due: ${p.company}`,
      summary: `Follow-up is due for ${p.company}.\n\nProspect stage: ${p.status}\nLast contacted: ${p.last_contacted_at || 'unknown'}\nReply summary: ${p.reply_summary || 'No reply recorded.'}\n\nDraft follow-up:\nSubject: ${draft.subject}\n\n${draft.body}\n\nApproval records the draft for CEO review; it does not send until Trey approves a send action for this recipient.`,
      riskLevel: 'medium',
      agentKey: 'outreach_agent',
      actionType: 'none',
      actionPayload: { prospect_id: p.id, recipient_id: p.recipient_id, draft },
    });
    if (approval.created) created += 1;
    await db.query(`UPDATE growth_prospects SET status='follow_up_due', updated_at=NOW() WHERE id=$1::uuid`, [p.id]);
  }
  await logActivity({ agentKey: 'outreach_agent', eventType: 'followup_due_check', title: 'Follow-up due checker ran', detail: `Found ${due.rows.length} due follow-up(s); queued ${created} approval(s).`, payload: { due: due.rows.length, created } });
  return { due: due.rows.length, created };
}

function buildFollowUpDraft(p) {
  const subject = p.final_subject && /^re:/i.test(p.final_subject) ? p.final_subject : `Re: ${p.final_subject || `${p.company}: elevator document review preview`}`;
  const body = [
    'Hi,',
    '',
    `Circling back on ElevatorIQ for ${p.company}.`,
    '',
    'The simple ask is still just one document: an elevator invoice, maintenance contract, repair quote, modernization bid, or proposal. The free preview shows whether there is anything worth reviewing before anyone pays for the full $99 report.',
    '',
    'Is there one recent elevator document your team would want a second set of eyes on?',
    '',
    'Thanks,',
    'The ElevatorIQ Team',
    'https://elevatoriq.ai',
  ].join('\n');
  return { subject, body };
}

async function revenueSnapshot() {
  const summary = await growth.getSummary();
  const pipeline = await db.query(`
    SELECT status, COUNT(*)::int AS count
    FROM growth_prospects
    WHERE status NOT IN ('not_fit','do_not_contact')
    GROUP BY status
    ORDER BY status
  `);
  const approvals = await db.query(`
    SELECT status, COUNT(*)::int AS count
    FROM growth_approvals
    WHERE status <> 'rejected'
    GROUP BY status
    ORDER BY status
  `);
  const recent = await db.query(`SELECT event_type, title, detail, created_at FROM growth_activity_events ORDER BY created_at DESC LIMIT 10`);
  return { summary, pipeline: pipeline.rows, approvals: approvals.rows, recent: recent.rows };
}

function formatReport({ dailyResult, replies, followups, snapshot }) {
  const p = snapshot.summary.prospects || {};
  const a = snapshot.summary.approvals || {};
  const c = snapshot.summary.campaigns || {};
  const pipeline = snapshot.pipeline.map((row) => `${row.status}: ${row.count}`).join(', ') || 'none';
  return [
    'ElevatorIQ Growth Command daily run complete.',
    '',
    `Done: prospecting ${dailyResult.prospecting?.result?.message || dailyResult.prospecting?.message || 'not run'}; outreach ${dailyResult.outreach?.result?.message || dailyResult.outreach?.message || 'not run'}; content ${dailyResult.content?.result?.message || dailyResult.content?.message || 'not run'}.`,
    `Reply monitor: checked ${replies.checked}, matched ${replies.matched}, queued ${replies.actionable || 0} response approval(s).`,
    `Follow-ups: ${followups.due} due, ${followups.created} approval(s) queued.`,
    `Scoreboard: prospects ${p.total || 0}, campaigns ${c.total || 0}, pending approvals ${a.pending || 0}, sent ${p.sent || 0}, replies ${p.replies || 0}, uploads ${p.uploads || 0}, paid ${p.paid || 0}, revenue $${Math.round(Number(p.revenue_cents || 0) / 100)}.`,
    `Pipeline: ${pipeline}.`,
    `Top next action: ${snapshot.summary.executive_summary?.recommended_ceo_action || 'Review approvals.'}`,
  ].join('\n');
}

async function runDaily() {
  const market = arg('market', DEFAULT_MARKET);
  const batchSize = Number(arg('batch-size', DEFAULT_BATCH));
  const dailyResult = {};
  dailyResult.prospecting = await growth.runAgent('prospecting_agent', { source: 'daily_machine', market, batch_size: batchSize });
  dailyResult.outreach = await growth.runAgent('outreach_agent', { source: 'daily_machine' });
  dailyResult.content = await growth.runAgent('content_agent', { source: 'daily_machine' });
  const replies = await monitorReplies({ pageSize: 40 });
  const followups = await queueFollowUps();
  dailyResult.scoreboard = await growth.runAgent('scoreboard_agent', { source: 'daily_machine' });
  const snapshot = await revenueSnapshot();
  const report = formatReport({ dailyResult, replies, followups, snapshot });
  await logActivity({ agentKey: 'scoreboard_agent', eventType: 'daily_revenue_machine', title: 'Daily revenue machine completed', detail: report, payload: { dailyResult, replies, followups, snapshot: { pipeline: snapshot.pipeline, approvals: snapshot.approvals } } });
  return report;
}

async function runWeekly() {
  const snapshot = await revenueSnapshot();
  const recent = await db.query(`
    SELECT event_type, COUNT(*)::int AS count
    FROM growth_activity_events
    WHERE created_at > NOW() - INTERVAL '7 days'
    GROUP BY event_type
    ORDER BY count DESC
  `);
  const report = [
    'ElevatorIQ weekly optimization report.',
    '',
    `Revenue: $${Math.round(Number(snapshot.summary.prospects?.revenue_cents || 0) / 100)}; uploads ${snapshot.summary.prospects?.uploads || 0}; paid ${snapshot.summary.prospects?.paid || 0}; replies ${snapshot.summary.prospects?.replies || 0}; sent ${snapshot.summary.prospects?.sent || 0}.`,
    `Pipeline: ${snapshot.pipeline.map((row) => `${row.status}: ${row.count}`).join(', ') || 'none'}.`,
    `Work performed: ${recent.rows.map((row) => `${row.event_type}: ${row.count}`).join(', ') || 'none'}.`,
    '',
    'Next optimization: keep prospecting narrow around property/facility operators, enrich verified direct emails through Apollo when credits are available, keep sends small until reply/bounce quality is proven, and push every warm reply toward one document upload/free preview.',
  ].join('\n');
  await logActivity({ agentKey: 'scoreboard_agent', eventType: 'weekly_optimization', title: 'Weekly growth optimization report completed', detail: report, payload: { snapshot, event_counts: recent.rows } });
  return report;
}

async function runVerify() {
  const checks = [];
  checks.push(`env: DATABASE_URL ${process.env.DATABASE_URL ? 'present' : 'missing'}`);
  try {
    await db.query('SELECT 1');
    checks.push('db: connected');
  } catch (err) { checks.push(`db: failed ${err.message}`); }
  try {
    const out = runHimalaya(['envelope', 'list', '--account', ACCOUNT, '--output', 'json', '--page-size', '3']);
    checks.push(`himalaya: read ${safeJson(out, []).length} inbox item(s)`);
  } catch (err) { checks.push(`himalaya: failed ${err.message}`); }
  const poster = path.join(os.homedir(), '.hermes', 'scripts', 'linkedin_company_post.py');
  if (fs.existsSync(poster)) {
    try {
      const out = execFileSync('python3', [poster, '--browser', '--dry-run', '--text', 'ElevatorIQ growth-machine readiness check — not publishing.'], { encoding: 'utf8', timeout: 120_000 });
      const parsed = safeJson(out, {});
      checks.push(`linkedin_browser: ${parsed.status || 'unknown'}; post button found ${Boolean(parsed.post_button_found)}`);
    } catch (err) { checks.push(`linkedin_browser: failed ${err.message}`); }
  } else {
    checks.push('linkedin_browser: poster script missing');
  }
  return checks.join('\n');
}

async function main() {
  const mode = arg('mode', 'daily');
  let output;
  if (mode === 'daily') output = await runDaily();
  else if (mode === 'weekly') output = await runWeekly();
  else if (mode === 'replies') output = JSON.stringify(await monitorReplies({ pageSize: Number(arg('page-size', 40)) }), null, 2);
  else if (mode === 'followups') output = JSON.stringify(await queueFollowUps(), null, 2);
  else if (mode === 'verify') output = await runVerify();
  else if (mode === 'snapshot') output = JSON.stringify(await revenueSnapshot(), null, 2);
  else throw new Error(`Unknown mode: ${mode}`);
  console.log(output);
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exitCode = 1;
}).finally(async () => {
  await db.pool?.end?.().catch(() => {});
});
