const fs = require('fs');
const FormData = require('form-data');
require('dotenv').config();

/**
 * sendReport — Email PDF via Resend REST API
 * Uses multipart/form-data to upload attachment directly to Resend
 */
async function sendReport(toEmail, pdfBuffer, reviewType, downloadToken) {
  const downloadUrl = `https://elevatoriq.ai/api/reports/download/${downloadToken}`;
  const reviewLabel = reviewType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  
  const apiKey = process.env.EMAIL_PROVIDER_API_KEY;
  const fromEmail = process.env.FROM_EMAIL || 'reports@elevatoriq.ai';

  if (!apiKey) {
    throw new Error('EMAIL_PROVIDER_API_KEY not configured');
  }

  // Build multipart form data with attachment
  const form = new FormData();
  form.append('from', fromEmail);
  form.append('to', toEmail);
  form.append('subject', `Your ElevatorIQ ${reviewLabel} is Ready`);
  form.append('html', `
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
  `);
  form.append('attachments', pdfBuffer, 'ElevatorIQ_Report.pdf');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...form.getHeaders(),
    },
    body: form,
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(`Resend API error: ${result.message || JSON.stringify(result)}`);
  }

  return result;
}

module.exports = { sendReport };
