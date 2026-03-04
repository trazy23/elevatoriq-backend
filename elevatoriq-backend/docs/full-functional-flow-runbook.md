# ElevatorIQ Full Functional Flow Runbook (ASAP MVP)

## Goal
Upload supported documents (invoice, maintenance contract, modernization bid, new construction bid), auto-map document type/review type, generate structured report + PDF, and send customer email with PDF attachment.

## Required Environment Variables

### Core API
- `DATABASE_URL`

### Analysis/Pipeline
- `ANTHROPIC_API_KEY`
- `REDIS_ENABLED` (`true` to enable queue, otherwise direct processing)
- `REDIS_HOST` (required if `REDIS_ENABLED=true`)

### Storage (R2/S3)
- `AWS_BUCKET`
- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_ENDPOINT` (if using R2)

### Email
- `EMAIL_PROVIDER_API_KEY` (Resend API key)
- `FROM_EMAIL`

### Frontend
- `VITE_API_BASE_URL` (e.g. `http://localhost:3001`)

## Runtime Verification Checklist

1. **Backend readiness**
   - `curl -s http://localhost:3001/readyz | jq`
   - Confirm `status=ready` and `full_pipeline_status=ready`

2. **Frontend build check**
   - `npm run build` in `repos/elevatoriq`

3. **Backend tests**
   - `npm test` in `repos/elevatoriq-backend/elevatoriq-backend`

4. **Manual E2E API flow (single file)**
   - Create case:
     - `curl -s -X POST http://localhost:3001/api/cases -H 'content-type: application/json' -d '{"review_type":"auto","customer_email":"you@example.com"}'`
   - Upload file:
     - `curl -s -X POST http://localhost:3001/api/cases/<CASE_ID>/documents -F file=@/path/to/file.pdf`
   - Run case:
     - `curl -s -X POST http://localhost:3001/api/cases/<CASE_ID>/run`
   - Poll:
     - `curl -s http://localhost:3001/api/cases/<CASE_ID>/status`
   - Output metadata:
     - `curl -s http://localhost:3001/api/cases/<CASE_ID>/output | jq`

5. **Expected successful artifacts**
   - `reports/<caseId>.pdf` in storage
   - `reports/<caseId>/structured-report.json` in storage
   - `reports` DB row has `download_token`, and `emailed_at` populated after successful email send

## Known Live Validation Blockers
- Without real, reachable DB + storage + Anthropic + Resend credentials, live PDF/email delivery cannot be fully validated.
