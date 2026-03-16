const { Resend } = require('resend');
const { BRAND } = require('./reportBranding');
require('dotenv').config();

const resend = new Resend(process.env.EMAIL_PROVIDER_API_KEY);

/**
 * sendReport — Email PDF via Resend SDK
 */
async function sendReport(toEmail, pdfBuffer, reviewType, downloadToken) {
  const backendUrl = process.env.BACKEND_URL || `https://elevatoriq-backend-prod.onrender.com`;
  const downloadUrl = `${backendUrl}/api/reports/download/${downloadToken}`;
  const reviewLabel = reviewType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  
  const fromEmail = process.env.FROM_EMAIL || BRAND.reportsFromEmail;

  if (!process.env.EMAIL_PROVIDER_API_KEY) {
    // MVP: Mock email send
    console.log(`[Email-Mock] Report "${reviewLabel}" would be sent to ${toEmail}`);
    return { id: 'mock-email-' + Date.now() };
  }

  const result = await resend.emails.send({
    from: fromEmail,
    to: toEmail,
    subject: `Your ElevatorIQ ${reviewLabel} is Ready`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto;">
        <div style="background: #0B0E13; padding: 24px; text-align: center;">
          <h2 style="color: white; margin: 0;">Elevator<span style="color: #00B876;">IQ</span></h2>
        </div>
        <div style="padding: 32px; background: #f8f9fa;">
          <p style="font-size: 16px; color: #1a1a2e;"><strong>Your ${reviewLabel} is ready.</strong></p>
          <p style="color: #555; line-height: 1.6;">
            Your structured elevator analysis has been completed and is attached as a PDF.
            You can also download it using the link below (expires in 7 days).
          </p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${downloadUrl}" style="background: #00B876; color: #0B0E13; padding: 12px 28px;
               border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 14px;">
              Download Report
            </a>
          </div>
          <p style="font-size: 12px; color: #888; line-height: 1.5;">
            This analysis evaluates contractual and commercial structure only.
            ElevatorIQ is independent — no vendor affiliations. All data is confidential.
          </p>
        </div>
      </div>
    `,
    attachments: [
      {
        filename: 'ElevatorIQ_Report.pdf',
        content: Buffer.isBuffer(pdfBuffer) ? pdfBuffer.toString('base64') : pdfBuffer,
      },
    ],
  });

  if (result.error) {
    throw new Error(`Resend error: ${result.error.message}`);
  }

  return result;
}

/**
 * sendSubmissionAlert — Notify the owner when a new submission comes in
 */
async function sendSubmissionAlert({ customerEmail, company, reviewType, caseId }) {
  const notifyEmail = process.env.ADMIN_NOTIFY_EMAIL;
  if (!notifyEmail) return; // Not configured — skip silently

  const fromEmail = process.env.FROM_EMAIL || BRAND.reportsFromEmail;
  const reviewLabel = (reviewType || 'auto').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const adminUrl = process.env.BACKEND_URL
    ? `${process.env.BACKEND_URL}/admin`
    : 'https://elevatoriq-backend-prod.onrender.com/admin';
  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' });

  if (!process.env.EMAIL_PROVIDER_API_KEY) {
    console.log(`[Alert-Mock] New submission from ${customerEmail} (${reviewLabel})`);
    return;
  }

  try {
    await resend.emails.send({
      from: fromEmail,
      to: notifyEmail,
      subject: `New ElevatorIQ Submission — ${reviewLabel}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <div style="background: #0B0E13; padding: 20px 24px; display: flex; align-items: center;">
            <h2 style="color: white; margin: 0; font-size: 18px;">Elevator<span style="color: #00B876;">IQ</span> <span style="color: #5E6470; font-weight: 400; font-size: 13px;">/ New Submission</span></h2>
          </div>
          <div style="padding: 28px; background: #f8f9fa; border: 1px solid #e0e0e0;">
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr>
                <td style="padding: 8px 0; color: #888; width: 120px;">Email</td>
                <td style="padding: 8px 0; color: #111; font-weight: 600;">${customerEmail || '(not provided)'}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #888;">Company</td>
                <td style="padding: 8px 0; color: #111;">${company || '(not provided)'}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #888;">Review Type</td>
                <td style="padding: 8px 0; color: #111;">${reviewLabel}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #888;">Time</td>
                <td style="padding: 8px 0; color: #111;">${timestamp} ET</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #888;">Case ID</td>
                <td style="padding: 8px 0; color: #888; font-family: monospace; font-size: 12px;">${caseId}</td>
              </tr>
            </table>
            <div style="margin-top: 24px; text-align: center;">
              <a href="${adminUrl}" style="background: #00B876; color: #0B0E13; padding: 11px 24px;
                 border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 13px;">
                View in Admin Dashboard
              </a>
            </div>
          </div>
        </div>
      `,
    });
  } catch (err) {
    // Non-fatal — log but don't block
    console.warn('[Alert] Failed to send submission alert:', err.message);
  }
}

/**
 * sendQualityFailure — Notify customer when analysis couldn't generate a deliverable report
 */
async function sendQualityFailure(toEmail, reviewType, caseId) {
  const fromEmail = process.env.FROM_EMAIL || BRAND.reportsFromEmail;
  const reviewLabel = (reviewType || 'review').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  if (!process.env.EMAIL_PROVIDER_API_KEY) {
    console.log(`[Email-Mock] Quality failure notice would be sent to ${toEmail} for case ${caseId}`);
    return;
  }

  const result = await resend.emails.send({
    from: fromEmail,
    to: toEmail,
    subject: `ElevatorIQ: We couldn't generate your ${reviewLabel}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto;">
        <div style="background: #0B0E13; padding: 24px; text-align: center;">
          <h2 style="color: white; margin: 0;">Elevator<span style="color: #00B876;">IQ</span></h2>
        </div>
        <div style="padding: 32px; background: #f8f9fa;">
          <p style="font-size: 16px; color: #1a1a2e;"><strong>We weren't able to generate a quality report for your submission.</strong></p>
          <p style="color: #555; line-height: 1.6;">
            Our analysis engine couldn't extract enough structured information from the uploaded document to produce
            a complete report. This can happen when documents are scanned images, heavily redacted, or not
            elevator-related contracts or bids.
          </p>
          <p style="color: #555; line-height: 1.6;">
            <strong>To retry:</strong> Return to <a href="https://elevatoriq.ai" style="color: #00B876;">elevatoriq.ai</a>
            and re-submit with a cleaner or different version of the document.
            If you believe this was an error, reply to this email and we'll review it manually.
          </p>
          <p style="font-size: 11px; color: #aaa; margin-top: 24px;">Case ID: ${caseId}</p>
        </div>
      </div>
    `,
  });

  if (result.error) {
    throw new Error(`Resend error: ${result.error.message}`);
  }

  return result;
}

module.exports = { sendReport, sendSubmissionAlert, sendQualityFailure };
