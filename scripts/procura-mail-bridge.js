#!/usr/bin/env node
/*
 * Procura Apple Mail / Brinker Exchange bridge.
 * Sends ONLY recipients already approved/queued inside Procura Command.
 * Uses Trey's logged-in macOS Mail.app Exchange account instead of storing Brinker credentials.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const backendRoot = path.join(__dirname, '..');
const bridgeEnvPath = process.env.EIQ_BRIDGE_ENV_FILE || path.join(os.homedir(), '.hermes', 'secrets', 'elevatoriq-render.env');
require('dotenv').config({ path: fs.existsSync(bridgeEnvPath) ? bridgeEnvPath : path.join(backendRoot, '.env'), quiet: true });

let db;
let procura;
let sendTelegram;
function loadRuntime() {
  if (!db) db = require('../src/db');
  if (!procura) procura = require('../src/services/procuraCommandService');
  if (!sendTelegram) ({ sendTelegram } = require('./growth-login-alerts'));
  return { db, procura, sendTelegram };
}

const ACCOUNT_NAME = process.env.PROCURA_APPLE_MAIL_ACCOUNT || 'Exchange';
const FROM_EMAIL = process.env.PROCURA_FROM_EMAIL || 'tzackery@brinkergroup.com';
const FROM_NAME = process.env.PROCURA_FROM_NAME || 'Trey Zackery';
const POLL_SECONDS = Number(process.env.PROCURA_MAIL_BRIDGE_POLL_SECONDS || 60);
const SEND_LIMIT = Number(process.env.PROCURA_MAIL_BRIDGE_SEND_LIMIT || 10);

function runOsascript(script, args = [], timeout = 120000) {
  const scriptPath = path.join(os.tmpdir(), `procura-mail-${process.pid}-${Date.now()}.applescript`);
  fs.writeFileSync(scriptPath, script, 'utf8');
  try {
    return execFileSync('/usr/bin/osascript', [scriptPath, ...args], {
      cwd: backendRoot,
      encoding: 'utf8',
      timeout,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } finally {
    try { fs.unlinkSync(scriptPath); } catch (_) {}
  }
}

function alert(message, service = 'procura-mail') {
  try {
    const runtime = loadRuntime();
    return runtime.sendTelegram(`🔴 Procura Mail Bridge\n${message}`, { service, reason: 'procura_mail_bridge' });
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function appleMailStatus() {
  const script = `
on run argv
  set targetAccountName to item 1 of argv
  set targetEmail to item 2 of argv
  tell application "Mail"
    set foundAccount to false
    set accountLine to ""
    repeat with a in every account
      set accName to name of a as string
      set accUser to ""
      try
        set accUser to user name of a as string
      end try
      set accEmails to ""
      try
        set accEmails to email addresses of a as string
      end try
      if accName is targetAccountName or accUser is targetEmail or accEmails contains targetEmail then
        set foundAccount to true
        set accountLine to accName & "|" & accUser & "|" & accEmails
        exit repeat
      end if
    end repeat
    if foundAccount is false then return "NO_ACCOUNT"
    try
      set inboxCount to count of messages of mailbox "Inbox" of account targetAccountName
      set sentCount to count of messages of mailbox "Sent Items" of account targetAccountName
      return "READY|" & accountLine & "|Inbox=" & inboxCount & "|Sent=" & sentCount
    on error errMsg number errNum
      return "ACCOUNT_FOUND_MAILBOX_ERROR|" & accountLine & "|" & errMsg & "|" & errNum
    end try
  end tell
end run
`;
  const raw = runOsascript(script, [ACCOUNT_NAME, FROM_EMAIL], 60000);
  const ready = raw.startsWith('READY|');
  return { ready, raw, account: ACCOUNT_NAME, email: FROM_EMAIL };
}

function sendViaAppleMail({ to, name, subject, body }) {
  const script = `
on run argv
  set accountName to item 1 of argv
  set fromEmail to item 2 of argv
  set fromName to item 3 of argv
  set toAddress to item 4 of argv
  set toName to item 5 of argv
  set subjectText to item 6 of argv
  set bodyText to item 7 of argv
  set senderText to fromName & " <" & fromEmail & ">"
  tell application "Mail"
    set foundAccount to false
    repeat with a in every account
      if (name of a as string) is accountName then
        set foundAccount to true
        exit repeat
      end if
    end repeat
    if foundAccount is false then return "NO_ACCOUNT"
    set theMessage to make new outgoing message with properties {subject:subjectText, content:bodyText & return & return, visible:false}
    tell theMessage
      set sender to senderText
      make new to recipient at end of to recipients with properties {address:toAddress, name:toName}
      send
    end tell
    return "SENT|" & (current date as string)
  end tell
end run
`;
  return runOsascript(script, [ACCOUNT_NAME, FROM_EMAIL, FROM_NAME, to, name || '', subject, body], 120000);
}

function recentInboxLines(limit = 300) {
  const script = `
on run argv
  set accountName to item 1 of argv
  set maxCount to item 2 of argv as integer
  tell application "Mail"
    set inboxBox to mailbox "Inbox" of account accountName
    set msgList to messages of inboxBox
    set outText to ""
    set n to 0
    repeat with m in msgList
      set n to n + 1
      set senderText to ""
      set subjectText to ""
      set dateText to ""
      try
        set senderText to sender of m as string
      end try
      try
        set subjectText to subject of m as string
      end try
      try
        set dateText to date received of m as string
      end try
      set outText to outText & senderText & "\t" & subjectText & "\t" & dateText & linefeed
      if n ≥ maxCount then exit repeat
    end repeat
    return outText
  end tell
end run
`;
  return runOsascript(script, [ACCOUNT_NAME, String(limit)], 120000).split(/\r?\n/).filter(Boolean);
}

async function sendApprovedOnce() {
  ({ db, procura } = loadRuntime());
  await procura.ensureSchema();
  const status = appleMailStatus();
  if (!status.ready) {
    const telegram = alert(`Brinker Exchange/Mail.app is not ready. Procura can draft, but approved outreach cannot send until Mail.app account '${ACCOUNT_NAME}' / ${FROM_EMAIL} is available. Status: ${status.raw}`, 'brinker-exchange');
    await procura.logActivity({ agentKey: 'procura_reply_agent', eventType: 'brinker_mail_not_ready', title: 'Brinker Exchange Mail.app rail not ready', detail: status.raw, payload: { status, telegram } });
    return { ok: false, sent: 0, status };
  }

  const recipients = await db.query(`
    SELECT r.*, c.name AS campaign_name
    FROM procura_campaign_recipients r
    JOIN procura_campaigns c ON c.id=r.campaign_id
    WHERE c.status IN ('approved','queued','running')
      AND c.approval_status='approved'
      AND r.status IN ('approved','queued')
      AND r.email IS NOT NULL
    ORDER BY r.created_at ASC
    LIMIT $1
  `, [SEND_LIMIT]);

  let sent = 0;
  let failed = 0;
  const results = [];
  for (const r of recipients.rows) {
    await db.query(`UPDATE procura_campaign_recipients SET status='sending', updated_at=NOW() WHERE id=$1`, [r.id]);
    try {
      const raw = sendViaAppleMail({ to: r.email, name: r.name || '', subject: r.final_subject, body: r.final_body });
      if (!raw.startsWith('SENT|')) throw new Error(raw);
      const messageId = `apple-mail:${Date.now()}:${r.id}`;
      await db.query(`UPDATE procura_campaign_recipients SET status='sent', sent_at=NOW(), provider_message_id=$2, error=NULL, updated_at=NOW() WHERE id=$1`, [r.id, messageId]);
      await db.query(`UPDATE procura_opportunities SET status='sent', last_contacted_at=NOW(), next_follow_up_at=NOW()+INTERVAL '3 days', updated_at=NOW() WHERE id=$1`, [r.opportunity_id]);
      sent++;
      results.push({ id: r.id, email: r.email, status: 'sent', raw });
    } catch (e) {
      failed++;
      await db.query(`UPDATE procura_campaign_recipients SET status='failed', error=$2, updated_at=NOW() WHERE id=$1`, [r.id, e.message]);
      results.push({ id: r.id, email: r.email, status: 'failed', error: e.message });
      if (/NO_ACCOUNT|not ready|Mail/i.test(e.message)) alert(`Approved Procura outreach failed through Brinker Mail.app rail. Error: ${e.message}`, 'brinker-exchange-send');
    }
  }

  if (sent || failed) {
    await procura.logActivity({ agentKey: 'procura_outreach_agent', eventType: 'brinker_mail_send_batch', title: 'Procura Brinker Mail.app send batch processed', detail: `Sent ${sent}, failed ${failed}.`, payload: { sent, failed, results } });
  }
  await closeCompletedCampaigns();
  return { ok: true, sent, failed, checked: recipients.rows.length, status };
}

async function closeCompletedCampaigns() {
  await db.query(`
    UPDATE procura_campaigns c
    SET status='sent', updated_at=NOW()
    WHERE c.status IN ('approved','queued','running')
      AND NOT EXISTS (SELECT 1 FROM procura_campaign_recipients r WHERE r.campaign_id=c.id AND r.status IN ('approved','queued','sending','ready_for_approval','draft'))
      AND EXISTS (SELECT 1 FROM procura_campaign_recipients r WHERE r.campaign_id=c.id AND r.status='sent')
  `);
}

async function monitorReplies() {
  ({ db, procura } = loadRuntime());
  await procura.ensureSchema();
  const status = appleMailStatus();
  if (!status.ready) return { ok: false, replied: 0, status };
  const sent = await db.query(`
    SELECT r.id, r.email, r.name, r.company, r.opportunity_id, r.sent_at
    FROM procura_campaign_recipients r
    WHERE r.status='sent' AND r.email IS NOT NULL AND r.sent_at IS NOT NULL
    ORDER BY r.sent_at DESC
    LIMIT 200
  `);
  if (!sent.rows.length) return { ok: true, replied: 0, checked: 0 };
  const lines = recentInboxLines(500);
  let replied = 0;
  const matches = [];
  for (const r of sent.rows) {
    const email = String(r.email).toLowerCase();
    const match = lines.find(line => line.toLowerCase().includes(email));
    if (!match) continue;
    await db.query(`UPDATE procura_campaign_recipients SET status='replied', updated_at=NOW() WHERE id=$1 AND status='sent'`, [r.id]);
    await db.query(`UPDATE procura_opportunities SET status='replied', reply_summary=$2, updated_at=NOW() WHERE id=$1`, [r.opportunity_id, `Possible reply detected in Brinker Exchange inbox: ${match.slice(0, 500)}`]);
    replied++;
    matches.push({ email: r.email, line: match.slice(0, 500) });
  }
  if (replied) {
    await procura.logActivity({ agentKey: 'procura_reply_agent', eventType: 'procura_replies_detected', title: 'Procura replies detected in Brinker inbox', detail: `${replied} possible replies detected. Review inbox and approve/draft next actions.`, payload: { matches } });
    alert(`${replied} possible Procura reply/replies detected in Brinker inbox. Review Procura Command and Brinker inbox for next move.`, 'procura-replies');
  }
  return { ok: true, replied, checked: sent.rows.length };
}

async function once({ send = true, monitor = true } = {}) {
  const result = {};
  result.status = appleMailStatus();
  if (send) result.send = await sendApprovedOnce();
  if (monitor) result.monitor = await monitorReplies();
  return result;
}

async function watch() {
  console.log(JSON.stringify({ ok: true, mode: 'watch', poll_seconds: POLL_SECONDS, account: ACCOUNT_NAME, from: FROM_EMAIL }));
  let lastErrorAlertAt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const result = await once({ send: true, monitor: true });
      if (result.send?.sent || result.send?.failed || result.monitor?.replied) console.log(JSON.stringify({ at: new Date().toISOString(), result }));
    } catch (e) {
      const msg = e.stack || e.message;
      console.error(`[${new Date().toISOString()}] ${msg}`);
      const now = Date.now();
      if (now - lastErrorAlertAt > 30 * 60 * 1000) {
        lastErrorAlertAt = now;
        alert(`Procura mail worker is running, but cannot reach the Growth Command database/API path needed to send or track approved outreach. Error: ${String(e.message || e).slice(0, 400)}`, 'procura-mail-db');
      }
    }
    await new Promise(resolve => setTimeout(resolve, POLL_SECONDS * 1000));
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--status')) return console.log(JSON.stringify(appleMailStatus(), null, 2));
  if (args.has('--monitor')) return console.log(JSON.stringify(await monitorReplies(), null, 2));
  if (args.has('--watch')) return watch();
  const result = await once({ send: !args.has('--no-send'), monitor: !args.has('--no-monitor') });
  console.log(JSON.stringify(result, null, 2));
}

main().catch(e => { console.error(e.stack || e.message); process.exitCode = 1; }).finally(() => {
  if (!process.argv.includes('--watch')) process.exit();
});
