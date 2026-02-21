# Email Configuration

## Sending Address

Reports are emailed FROM: **reports@elevatoriq.ai**

This address is configured in `.env` as `FROM_EMAIL=reports@elevatoriq.ai`.

> ⚠️ This domain must be verified in Resend before it can send. If email delivery fails, check the Resend dashboard first.

---

## Email Provider: Resend

ElevatorIQ uses **Resend** as the SMTP relay.

| Setting | Value |
|---------|-------|
| SMTP Host | `smtp.resend.com` |
| SMTP Port | `587` |
| SMTP User | `resend` |
| SMTP Password | Your Resend API key (`EMAIL_PROVIDER_API_KEY` in `.env`) |
| From Address | `reports@elevatoriq.ai` |

### Resend Dashboard
https://resend.com/emails

Use this to:
- View sent emails and delivery status
- Verify/add sending domains
- Monitor bounces and failures
- Get/rotate your API key

---

## What the User Receives

When a case completes, the system emails `customer_email` with:
- A message explaining the report is ready
- A **secure download link** that expires in 7 days
- The link format: `https://your-backend-url/api/reports/download/{TOKEN}`

> Note: Locally, the link in the email will point to `localhost:3001` and won't work for external users. After deployment, update `BASE_URL` in `.env` (or in `emailService.js`) to your production URL.

---

## Test Email Address

Trey's test address: **trenaryl.zackery@gmail.com**

Use this when testing cases locally so you can verify email delivery without involving real clients.

---

## Domain Setup Checklist (for Production)

Before going live, confirm in Resend:

- [ ] `elevatoriq.ai` domain is verified (DNS records added)
- [ ] `reports@elevatoriq.ai` shows as active sender
- [ ] SPF, DKIM records are published for deliverability
- [ ] Test email delivered successfully to Gmail and Outlook

---

## Email Template Location

`elevatoriq-backend/src/services/emailService.js`

This file controls:
- The email subject line
- The body HTML (simple message + download link)
- The from/reply-to address
- Attachment handling (currently no attachment — PDF is download-link only)
