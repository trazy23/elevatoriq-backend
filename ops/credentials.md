# ElevatorIQ Credentials & Services

> All of these are already wired into `elevatoriq-backend/.env`. This file is your reference map — what each key is for and where to manage it.

---

## Anthropic (Claude AI)

| Item | Value |
|------|-------|
| **API Key** | In `.env` as `ANTHROPIC_API_KEY` |
| **Model Used** | `claude-sonnet-4-6` |
| **Dashboard** | https://console.anthropic.com |

Used for: All document analysis. Every case runs one Claude API call. Cost is per-token — monitor usage in the Anthropic dashboard.

---

## Cloudflare R2 (File Storage)

| Item | Value |
|------|-------|
| **Bucket Name** | `elevatoriq-documents` |
| **Region** | `auto` |
| **Account ID** | In `.env` as `CF_ACCOUNT_ID` |
| **Access Key ID** | In `.env` as `AWS_ACCESS_KEY_ID` |
| **Secret Access Key** | In `.env` as `AWS_SECRET_ACCESS_KEY` |
| **R2 Endpoint** | `https://8d019a2f5e3aaeba152a925ccf74527a.r2.cloudflarestorage.com` |
| **CF API Token** | In `.env` as `CF_API_TOKEN` |
| **Dashboard** | https://dash.cloudflare.com → R2 → elevatoriq-documents |

Used for: Storing uploaded documents (under `uploads/{case_id}/`) and generated PDF reports (under `reports/{case_id}.pdf`).

R2 is **S3-compatible** — the backend uses the AWS SDK to talk to it.

---

## Resend (Email)

| Item | Value |
|------|-------|
| **API Key** | In `.env` as `EMAIL_PROVIDER_API_KEY` |
| **From Address** | `reports@elevatoriq.ai` |
| **SMTP Host** | `smtp.resend.com:587` |
| **SMTP User** | `resend` (literal — not your email) |
| **SMTP Password** | Same as your Resend API key |
| **Dashboard** | https://resend.com |

Used for: Delivering report-ready emails to clients with their secure download link.

---

## PostgreSQL (Database)

| Item | Value |
|------|-------|
| **Connection String** | `postgresql://localhost:5432/elevatoriq_dev` |
| **Database Name** | `elevatoriq_dev` |
| **User** | `treyzackery` (your Mac OS user) |
| **Host** | `localhost:5432` |
| **PostgreSQL Version** | 17 (installed via Homebrew) |
| **Homebrew Path** | `/opt/homebrew/opt/postgresql@17/bin/` |

Used for: All case, document, report, customer, and extraction data.

10 tables: `customers`, `cases`, `documents`, `reports`, `extractions_raw`, `facts_labor`, `facts_line_items`, `facts_parts`, `facts_contract_terms`, `benchmarks`

---

## Where `.env` Lives

```
/Users/treyzackery/OpenClawSandbox/elevatoriq-backend/.env
```

This file is **gitignored** — it will never be committed. If you move to a new machine or deploy to Railway/Render, you'll need to re-enter these values in the platform's environment variable dashboard.

---

## Key Rotation Checklist

If you need to rotate a key (security incident, key compromise, etc.):

- **Anthropic** → Regenerate at console.anthropic.com → update `ANTHROPIC_API_KEY` in `.env`
- **Cloudflare R2** → Regenerate in Cloudflare dashboard → update `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`
- **Resend** → Regenerate at resend.com → update `EMAIL_PROVIDER_API_KEY` in `.env`
- After updating `.env` locally → restart the backend
- After updating on Railway/Render → redeploy
