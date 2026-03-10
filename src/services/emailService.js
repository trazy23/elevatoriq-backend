const { Resend } = require('resend');
const { BRAND } = require('./reportBranding');
require('dotenv').config();

const resend = new Resend(process.env.EMAIL_PROVIDER_API_KEY);

/**
 * sendReport — Email PDF via Resend SDK
 */
async function sendReport(toEmail, pdfBuffer, reviewType, downloadToken) {
  const downloadUrl = `https://${BRAND.domain}/api/reports/download/${downloadToken}`;
  const reviewLabel = reviewType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  
  const fromEmail = process.env.FROM_EMAIL || BRAND.reportsFromEmail;

  if (!process.env.EMAIL_PROVIDER_API_KEY) {
    throw new Error('EMAIL_PROVIDER_API_KEY not configured');
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
        content: pdfBuffer,
      },
    ],
  });

  if (result.error) {
    throw new Error(`Resend error: ${result.error.message}`);
  }

  return result;
}

module.exports = { sendReport };
