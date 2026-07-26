#!/usr/bin/env node
const dotenv = require('dotenv');
const fs = require('fs');
const os = require('os');
const path = require('path');
const backendRoot = path.join(__dirname, '..');
const bridgeEnvPath = process.env.EIQ_BRIDGE_ENV_FILE || path.join(os.homedir(), '.hermes', 'secrets', 'elevatoriq-render.env');
dotenv.config({ path: fs.existsSync(bridgeEnvPath) ? bridgeEnvPath : path.join(backendRoot, '.env') });
const db = require('../src/db');
const procura = require('../src/services/procuraCommandService');

async function run() {
  await procura.ensureSchema();
  const summary = await procura.getSummary();
  const opps = summary.opportunities || {};
  const byLane = opps.by_lane || [];
  const activity = summary.recent_activity || [];
  const approval = summary.approvals || {};
  const campaigns = summary.campaigns || {};
  const top = await db.query(`
    SELECT company,lane,decision_maker,title,email,priority_score,status,last_contacted_at
    FROM procura_opportunities
    ORDER BY priority_score DESC, updated_at DESC
    LIMIT 10
  `);
  const blockers = [];
  const accounts = await new Promise(resolve => {
    const { exec } = require('child_process');
    exec('himalaya account list 2>&1', { timeout: 15000 }, (err, stdout) => resolve(stdout || err?.message || ''));
  });
  if (!/\bbrinker\b/i.test(accounts)) blockers.push('Brinker Exchange email is still not configured in Himalaya as account “brinker”.');
  if ((approval.pending || 0) > 0) blockers.push(`${approval.pending} Procura approval item(s) waiting for Trey.`);

  const report = [
    'Procura weekly optimization report',
    '',
    `Total opportunities: ${opps.total || 0}`,
    `Sendable emails: ${opps.with_email || 0}`,
    `Sent: ${opps.sent || 0}`,
    `Replies: ${opps.replies || 0}`,
    `Active opportunities: ${opps.active_opportunities || 0}`,
    `Won: ${opps.won || 0}`,
    `Pending approvals: ${approval.pending || 0}`,
    `Campaigns needing review: ${campaigns.need_review || 0}`,
    '',
    'Lane mix:',
    ...byLane.map(l => `- ${l.lane}: ${l.total} total, ${l.with_email} with email, avg score ${Math.round(l.avg_score || 0)}`),
    '',
    'Top money moves:',
    ...top.rows.map(r => `- ${r.company} (${r.lane}) — ${r.decision_maker || 'decision maker TBD'} — score ${r.priority_score}`),
    '',
    'Blockers:',
    ...(blockers.length ? blockers.map(b => `- ${b}`) : ['- None detected.']),
    '',
    'Next experiments:',
    '- Keep Apollo national buyer searches broad, then tighten by replies and known category fit.',
    '- Prioritize recurring Jan/San and MRO first; use paint/electrical/flooring as project-trigger lanes.',
    '- Do not send from ElevatorIQ identity; use Brinker Exchange once configured and approved.'
  ].join('\n');
  await procura.logActivity({ agentKey: 'procura_scoreboard_agent', eventType: 'weekly_optimization', title: 'Procura weekly optimization completed', detail: report.slice(0, 1000), payload: { report } });
  console.log(report);
}
run().catch(e => { console.error(e.stack || e.message); process.exitCode = 1; }).finally(async()=>{ await db.pool?.end?.().catch(()=>{}); });
