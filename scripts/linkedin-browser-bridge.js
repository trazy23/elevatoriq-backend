#!/usr/bin/env node
/*
  Local LinkedIn browser bridge for ElevatorIQ Growth Command Center.

  This runs on Trey's Mac, not Render. Render queues approved LinkedIn posts with
  provider=linkedin_browser_bridge. This script polls production Postgres, posts via
  the logged-in Chrome LinkedIn session, then writes proof back to growth_approvals.

  Usage:
    node scripts/linkedin-browser-bridge.js --once
    node scripts/linkedin-browser-bridge.js --watch
*/

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const defaultEnvPath = path.join(__dirname, '..', '.env');
const bridgeEnvPath = process.env.EIQ_BRIDGE_ENV_FILE || path.join(os.homedir(), '.hermes', 'secrets', 'elevatoriq-render.env');
require('dotenv').config({ path: fs.existsSync(bridgeEnvPath) ? bridgeEnvPath : defaultEnvPath });
const { Pool } = require('pg');

const BACKEND_ROOT = path.join(__dirname, '..');
const PYTHON_POSTER = path.join(os.homedir(), '.hermes', 'scripts', 'linkedin_company_post.py');
const POLL_MS = Number(process.env.LINKEDIN_BROWSER_BRIDGE_POLL_MS || 60_000);
const DRY_RUN = /^(1|true|yes)$/i.test(process.env.LINKEDIN_BROWSER_BRIDGE_DRY_RUN || '');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL missing. Run from elevatoriq-backend with .env present.');
  process.exit(2);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('sslmode=') ? undefined : { rejectUnauthorized: false },
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  console.error(`[${new Date().toISOString()}] Postgres pool idle-client error:`, err.message);
});

async function logActivity(client, { approvalId, title, detail, payload, eventType = 'linkedin_browser_bridge' }) {
  await client.query(
    `INSERT INTO growth_activity_events (agent_key, event_type, title, detail, payload)
     VALUES ($1::text,$2::text,$3::text,$4::text,$5::jsonb)`,
    ['content_agent', eventType, title, detail, JSON.stringify({ approval_id: approvalId, ...payload })]
  );
}

function extractText(approval) {
  const payload = approval.action_payload || {};
  return String(payload.text || payload.body || payload.draft || approval.summary || '').trim();
}

function runPoster(text) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eiq-linkedin-'));
  const postPath = path.join(tmp, 'post.txt');
  fs.writeFileSync(postPath, text, 'utf8');
  const args = [PYTHON_POSTER, '--browser', '--file', postPath];
  if (DRY_RUN) args.push('--dry-run');
  const result = spawnSync('python3', args, { cwd: BACKEND_ROOT, encoding: 'utf8', timeout: 120_000 });
  fs.rmSync(tmp, { recursive: true, force: true });
  let parsed = null;
  try { parsed = JSON.parse(result.stdout || '{}'); } catch (_) {}
  return {
    exitCode: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    result: parsed || { status: 'failed', error: 'Poster returned non-JSON output' },
  };
}

async function processOnce() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT id, title, summary, action_payload, action_result
      FROM growth_approvals
      WHERE status='approved'
        AND action_type='post_content'
        AND action_result->>'provider'='linkedin_browser_bridge'
        AND COALESCE(action_result->>'posted','false')='false'
      ORDER BY decided_at ASC NULLS LAST, created_at ASC
      LIMIT 5
    `);

    if (!rows.length) {
      console.log(`[${new Date().toISOString()}] No LinkedIn browser-bridge approvals pending.`);
      return 0;
    }

    let processed = 0;
    for (const approval of rows) {
      const text = extractText(approval);
      if (!text) {
        const actionResult = { status: 'failed', provider: 'linkedin_browser_bridge', posted: false, error: 'No post text found in approval payload.' };
        await client.query(
          `UPDATE growth_approvals SET status='failed', executed_at=NOW(), action_result=$2::jsonb, updated_at=NOW() WHERE id=$1::uuid`,
          [approval.id, JSON.stringify(actionResult)]
        );
        await logActivity(client, { approvalId: approval.id, title: `${approval.title} — failed`, detail: actionResult.error, payload: actionResult, eventType: 'social_post_failed' });
        continue;
      }

      console.log(`[${new Date().toISOString()}] Publishing LinkedIn approval ${approval.id}: ${approval.title}`);
      const poster = runPoster(text);
      const ok = poster.exitCode === 0 && ['executed', 'ready'].includes(poster.result.status);
      const actionResult = {
        ...(approval.action_result || {}),
        ...poster.result,
        status: DRY_RUN ? 'approved' : (ok && poster.result.status === 'executed' ? 'executed' : 'failed'),
        provider: 'linkedin_browser_bridge',
        posted: !DRY_RUN && ok && poster.result.status === 'executed',
        dry_run: DRY_RUN,
        bridge_completed_at: new Date().toISOString(),
        stderr: poster.stderr ? poster.stderr.slice(0, 1000) : undefined,
      };
      const newStatus = actionResult.status;
      await client.query(
        `UPDATE growth_approvals
         SET status=$2::text,
             executed_at=CASE WHEN $2 IN ('executed','failed') THEN NOW() ELSE executed_at END,
             action_result=$3::jsonb,
             updated_at=NOW()
         WHERE id=$1::uuid`,
        [approval.id, newStatus, JSON.stringify(actionResult)]
      );
      await logActivity(client, {
        approvalId: approval.id,
        title: `${approval.title} — ${newStatus}`,
        detail: actionResult.message || actionResult.error || 'LinkedIn browser bridge processed approval.',
        payload: actionResult,
        eventType: newStatus === 'executed' ? 'social_post_executed' : 'social_post_failed',
      });
      processed += 1;
    }
    return processed;
  } finally {
    client.release();
  }
}

async function main() {
  const watch = process.argv.includes('--watch');
  if (!fs.existsSync(PYTHON_POSTER)) {
    console.error(`Missing LinkedIn poster script: ${PYTHON_POSTER}`);
    process.exit(2);
  }
  if (!watch) {
    const count = await processOnce();
    await pool.end();
    process.exit(count >= 0 ? 0 : 1);
  }
  console.log(`LinkedIn browser bridge watching every ${POLL_MS}ms. Dry run: ${DRY_RUN ? 'yes' : 'no'}`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try { await processOnce(); } catch (err) { console.error(`[${new Date().toISOString()}] Bridge error:`, err.message); }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => {});
  process.exit(1);
});
