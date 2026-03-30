const db = require('../db');
const { Resend } = require('resend');
const { BRAND } = require('./reportBranding');
require('dotenv').config();

const resend = new Resend(process.env.EMAIL_PROVIDER_API_KEY);

/**
 * scheduleNurtureSequence — Schedule 3 nurture emails for a free-tier case
 * Emails scheduled at: 24h, 4 days, 8 days from now
 */
async function scheduleNurtureSequence(caseId, customerEmail, customerName) {
  if (!caseId || !customerEmail) {
    console.warn('[Nurture] Missing caseId or customerEmail, skipping schedule');
    return;
  }

  try {
    const now = new Date();
    const schedules = [
      { emailType: 'nurture_1', hoursDelay: 24 },
      { emailType: 'nurture_2', hoursDelay: 96 }, // 4 days
      { emailType: 'nurture_3', hoursDelay: 192 }, // 8 days
    ];

    for (const { emailType, hoursDelay } of schedules) {
      const scheduledFor = new Date(now.getTime() + hoursDelay * 60 * 60 * 1000);
      await db.query(
        `INSERT INTO nurture_emails (case_id, customer_email, customer_name, email_type, scheduled_for)
         VALUES ($1, $2, $3, $4, $5)`,
        [caseId, customerEmail, customerName || null, emailType, scheduledFor]
      );
    }

    console.log(`[Nurture] Scheduled 3 nurture emails for case ${caseId} (${customerEmail})`);
  } catch (err) {
    console.error('[Nurture] Failed to schedule nurture sequence:', err.message);
  }
}

/**
 * processNurtureQueue — Send all pending nurture emails
 * Called by cron job or manual endpoint
 */
async function processNurtureQueue() {
  try {
    const result = await db.query(
      `SELECT id, case_id, customer_email, customer_name, email_type
       FROM nurture_emails
       WHERE sent_at IS NULL
         AND scheduled_for <= NOW()
       ORDER BY scheduled_for ASC
       LIMIT 100`
    );

    if (result.rows.length === 0) {
      console.log('[Nurture] No pending nurture emails');
      return { processed: 0, failed: 0 };
    }

    console.log(`[Nurture] Processing ${result.rows.length} pending emails`);
    let processed = 0;
    let failed = 0;

    for (const row of result.rows) {
      try {
        const sent = await sendNurtureEmail(row.customer_email, row.customer_name, row.email_type);
        if (sent) {
          await db.query(
            `UPDATE nurture_emails SET sent_at=NOW() WHERE id=$1`,
            [row.id]
          );
          processed++;
          console.log(`[Nurture] Sent ${row.email_type} to ${row.customer_email} (case: ${row.case_id})`);
        } else {
          failed++;
        }
      } catch (err) {
        console.error(`[Nurture] Failed to send ${row.email_type} to ${row.customer_email}:`, err.message);
        failed++;
      }
    }

    console.log(`[Nurture] Queue complete: ${processed} sent, ${failed} failed`);
    return { processed, failed };
  } catch (err) {
    console.error('[Nurture] processNurtureQueue failed:', err.message);
    return { processed: 0, failed: 0, error: err.message };
  }
}

/**
 * sendNurtureEmail — Send individual nurture email via Resend
 */
async function sendNurtureEmail(toEmail, customerName, emailType) {
  const fromEmail = process.env.FROM_EMAIL || BRAND.reportsFromEmail;

  if (!process.env.EMAIL_PROVIDER_API_KEY) {
    console.log(`[Nurture-Mock] ${emailType} would be sent to ${toEmail}`);
    return true;
  }

  const firstName = customerName ? customerName.trim().split(/\s+/)[0] : null;

  let subject, html;

  if (emailType === 'nurture_1') {
    subject = 'How to act on your ElevatorIQ findings';
    html = buildNurture1Html(firstName);
  } else if (emailType === 'nurture_2') {
    subject = '3 elevator contract traps most building owners miss';
    html = buildNurture2Html(firstName);
  } else if (emailType === 'nurture_3') {
    subject = "Don't let your elevator findings go unaddressed";
    html = buildNurture3Html(firstName);
  } else {
    console.warn(`[Nurture] Unknown email type: ${emailType}`);
    return false;
  }

  try {
    const result = await resend.emails.send({
      from: fromEmail,
      to: toEmail,
      subject,
      html,
    });

    if (result.error) {
      console.error(`[Nurture] Resend error for ${emailType}:`, result.error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error(`[Nurture] Failed to send ${emailType}:`, err.message);
    return false;
  }
}

function buildNurture1Html(firstName) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto;">
      <div style="background: #0B0E13; padding: 24px; text-align: center;">
        <h2 style="color: white; margin: 0;">Elevator<span style="color: #00B876;">IQ</span></h2>
      </div>
      <div style="padding: 32px; background: #f8f9fa;">
        ${firstName ? `<p style="font-size: 16px; color: #1a1a2e;">Hi ${firstName},</p>` : ''}
        <p style="font-size: 16px; color: #1a1a2e;"><strong>How to act on your ElevatorIQ findings</strong></p>
        <p style="color: #555; line-height: 1.6;">
          Your elevator analysis report is in your inbox. Here are two immediate next steps:
        </p>
        <ol style="color: #555; line-height: 1.8;">
          <li><strong>Share with your elevator company.</strong> Forward the findings to your vendor and ask them to respond in writing. This creates a documented record and often leads to operational improvements.</li>
          <li><strong>Use the risk flags as negotiating points.</strong> When your contract comes up for renewal, reference specific issues flagged in the report. You'll negotiate from a position of knowledge.</li>
        </ol>
        <p style="color: #555; line-height: 1.6;">
          Have another document to review? Upload it now for just $99, or consider our Owner Plan at $149/month for unlimited reviews.
        </p>
        <div style="text-align: center; margin: 28px 0;">
          <a href="https://elevatoriq.ai" style="background: #00B876; color: #0B0E13; padding: 12px 28px;
             border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 14px;">
            Upload Your Next Document
          </a>
        </div>
        <p style="font-size: 12px; color: #888; line-height: 1.5;">
          ElevatorIQ analyzes elevator contracts, invoices, and bids to identify cost savings, maintenance gaps, and renewal risks.
        </p>
      </div>
    </div>
  `;
}

function buildNurture2Html(firstName) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto;">
      <div style="background: #0B0E13; padding: 24px; text-align: center;">
        <h2 style="color: white; margin: 0;">Elevator<span style="color: #00B876;">IQ</span></h2>
      </div>
      <div style="padding: 32px; background: #f8f9fa;">
        ${firstName ? `<p style="font-size: 16px; color: #1a1a2e;">Hi ${firstName},</p>` : ''}
        <p style="font-size: 16px; color: #1a1a2e;"><strong>3 elevator contract traps most building owners miss</strong></p>
        <p style="color: #555; line-height: 1.6;">
          Even experienced property managers often overlook critical issues in elevator maintenance contracts. Here are the three most common traps:
        </p>
        <ol style="color: #555; line-height: 1.8;">
          <li><strong>Auto-renewal clauses with short cancellation windows.</strong> Your contract might auto-renew with only 90 days' notice. If you miss that window by even one day, you're locked in for another year.</li>
          <li><strong>Response time language with hidden loopholes.</strong> A clause promising "normal business hours" response sounds good until your elevator breaks on a Sunday.</li>
          <li><strong>Exclusion creep.</strong> The contract claims "full coverage" but excludes the components that actually break—and the exclusions are buried in the fine print.</li>
        </ol>
        <p style="color: #555; line-height: 1.6;">
          <strong>Run your contract through ElevatorIQ</strong> and we'll flag every one of these traps plus dozens more, saving you time and money.
        </p>
        <div style="text-align: center; margin: 28px 0;">
          <a href="https://elevatoriq.ai" style="background: #00B876; color: #0B0E13; padding: 12px 28px;
             border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 14px;">
            Analyze Your Contract
          </a>
        </div>
        <p style="font-size: 12px; color: #888; line-height: 1.5;">
          ElevatorIQ is built by people who understand elevator contracts. We know what to look for.
        </p>
      </div>
    </div>
  `;
}

function buildNurture3Html(firstName) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto;">
      <div style="background: #0B0E13; padding: 24px; text-align: center;">
        <h2 style="color: white; margin: 0;">Elevator<span style="color: #00B876;">IQ</span></h2>
      </div>
      <div style="padding: 32px; background: #f8f9fa;">
        ${firstName ? `<p style="font-size: 16px; color: #1a1a2e;">Hi ${firstName},</p>` : ''}
        <p style="font-size: 16px; color: #1a1a2e;"><strong>Don't let your elevator findings go unaddressed</strong></p>
        <p style="color: #555; line-height: 1.6;">
          Most building owners who find issues in their ElevatorIQ reports take action within two weeks. After that, good intentions fade and the document ends up in a folder.
        </p>
        <p style="color: #555; line-height: 1.6;">
          If your report flagged something worth acting on, now is the time. The sooner you address findings—whether by renegotiating with your vendor or switching providers—the sooner you start saving money.
        </p>
        <p style="color: #555; line-height: 1.6;">
          <strong>Our Owner Plan ($149/month)</strong> puts you in control. Review every new elevator document as it comes in. Never miss a renewal deadline. Never get surprised by a contract change. It's one less thing to manage.
        </p>
        <div style="text-align: center; margin: 28px 0;">
          <a href="https://elevatoriq.ai" style="background: #00B876; color: #0B0E13; padding: 12px 28px;
             border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 14px;">
            Start Your Owner Plan
          </a>
        </div>
        <p style="font-size: 12px; color: #888; line-height: 1.5;">
          Questions? Reply to this email. We're here to help.
        </p>
      </div>
    </div>
  `;
}

module.exports = { scheduleNurtureSequence, processNurtureQueue, sendNurtureEmail };
