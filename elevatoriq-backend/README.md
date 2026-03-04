# ElevatorIQ Backend — v1.1

AI-powered elevator procurement intelligence. Built for elevatoriq.ai.

## Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Database Setup (PostgreSQL, 10 tables) | ✅ Complete |
| 2 | Project Scaffold & Environment | ✅ Complete |
| 3 | Document Upload Pipeline | ✅ Complete |
| 4 | Claude API Integration (dual output) | ✅ Complete |
| 5 | JSON Validation & DB Insert | ✅ Complete |
| 6 | PDF Generation & Email Delivery | ✅ Complete |
| 7 | Worker Job (full orchestration) | ✅ Complete |
| 8 | Aggregation Job (flywheel) | ✅ Complete |
| 9 | Frontend Connection | ⏳ Needs API keys + deployment |

## Quick Start (Local Dev)

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your actual API keys

# 3. Set up database (PostgreSQL must be running)
createdb elevatoriq_dev
psql elevatoriq_dev < schema_v1.sql

# 4. Start dev server
npm run dev
```

## Environment Variables (Required)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | Claude API key from console.anthropic.com |
| `AWS_BUCKET` | S3 bucket name for file storage |
| `AWS_REGION` | AWS region (e.g. us-east-1) |
| `AWS_ACCESS_KEY_ID` | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key |
| `EMAIL_PROVIDER_API_KEY` | SendGrid/Postmark/Resend API key |
| `SMTP_HOST` | SMTP host (default: smtp.sendgrid.net) |
| `SMTP_PORT` | SMTP port (default: 587) |
| `SMTP_USER` | SMTP username (default: apikey for SendGrid) |
| `FROM_EMAIL` | Sender email address (default/recommended: `reports@elevatoriq.ai`) |
| `REDIS_HOST` | Redis host for Bull queue (default: 127.0.0.1) |
| `PORT` | Server port (default: 3001) |
| `FRONTEND_ORIGIN` | Canonical frontend origin for CORS (e.g. https://elevatoriq.ai) |
| `API_ORIGIN` | Canonical API origin for CORS (e.g. https://api.elevatoriq.ai) |
| `CORS_ORIGINS` | Optional comma-separated additional CORS origins |
| `FRONTEND_DIST_PATH` | Optional static bundle path when serving SPA from backend host |
| `PARSER_API_ENABLED` | Feature flag for parser API consumer integration (default: false) |
| `PARSER_API_BASE_URL` | Parser API base URL (default: http://localhost:3001) |
| `PARSER_API_TIMEOUT_MS` | Parser API timeout in ms (default: 30000) |
| `PARSER_API_BEARER_TOKEN` | Optional bearer token for protected parser API |


## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/cases` | Create a new analysis case |
| POST | `/api/cases/:id/documents` | Upload a single document |
| POST | `/api/cases/:id/documents/batch` | Upload multiple documents in one request (`files[]`) |
| POST | `/api/cases/:id/run` | Trigger analysis |
| GET | `/api/cases/:id/status` | Poll case status |
| GET | `/api/cases/:id/output` | Return report/output artifact metadata (PDF + structured JSON path + extraction payload) |
| GET | `/api/reports/download/:token` | Download PDF report |
| POST | `/api/invoice/parse` | Upload PDF invoice and extract structured fields |
| POST | `/api/prompt` | End-to-end orchestration (supports multi-doc `file`/`files`, accepts `review_type` or `function_mode`, recipient resolution prefers `customer_email` then falls back to request email fields) |
| GET | `/health` | Liveness check |
| GET | `/readyz` | Readiness check (env + static bundle + CORS summary) |

## Invoice Parse API (Sprint 001)

Endpoint: `POST /api/invoice/parse`

- Content type: `multipart/form-data`
- Required file field: `file`
- Accepted type: PDF only
- Max size: 15 MB

Example request:

```bash
curl -X POST http://localhost:3001/api/invoice/parse \
  -F "file=@/absolute/path/to/invoice.pdf"
```

Operational runbook: `docs/invoice-parser-runbook.md`

Example success response:

```json
{
  "success": true,
  "file_name": "invoice-2026-01-31.pdf",
  "extracted_characters": 4821,
  "data": {
    "vendor": "ACME Elevator Services, LLC",
    "elevator_brand": "OTIS",
    "elevator_model": "Gen2 MRL",
    "line_items": [
      {
        "description": "Door Roller Assemblies",
        "quantity": 2,
        "unit_price": 125,
        "total": 250
      }
    ],
    "totals": {
      "subtotal": 550,
      "tax": 33,
      "total": 583
    }
  },
  "normalized": {
    "supplier_name": "ACME Elevator Services, LLC",
    "oem_brand": "OTIS",
    "oem_model": "Gen2 MRL",
    "currency": "USD",
    "totals": {
      "subtotal_amount": 550,
      "tax_amount": 33,
      "invoice_total_amount": 583
    },
    "line_items": [
      {
        "index": 0,
        "title": "Door Roller Assemblies",
        "quantity": 2,
        "unit_amount": 125,
        "line_total": 250,
        "category_hint": "parts_or_other"
      }
    ],
    "bid_analysis": {
      "inferred_service_scope": ["Door Roller Assemblies"],
      "inferred_vendor_slug": "acme_elevator_services_llc"
    }
  },
  "confidence": {
    "overall": "high",
    "overall_score": 0.901,
    "fields": {
      "vendor": 0.86,
      "elevator_brand": 0.88,
      "elevator_model": 0.78,
      "totals_subtotal": 0.92,
      "totals_tax": 0.84,
      "totals_total": 0.95,
      "line_items_count": 0.62
    },
    "methodology": "heuristic_v1"
  }
}
```

Example error response:

```json
{
  "success": false,
  "error": {
    "code": "UNREADABLE_DOCUMENT",
    "message": "PDF appears to be image-based or empty — no extractable text found.",
    "http_status": 422,
    "retryable": false
  }
}
```

## Architecture

```
Frontend (elevatoriq.ai)
    ↓
Express API (index.js)
    ↓ POST /api/cases/:id/run
analysisWorker.js
    ├── storageService.js  (S3 upload/download)
    ├── claudeService.js   (Claude API — dual output)
    ├── benchmarkService.js (inject benchmarks into prompt)
    ├── pdfService.js      (Puppeteer PDF generation)
    └── emailService.js    (SMTP delivery)
         ↓
PostgreSQL (10 tables)
    └── extractions_raw → aggregationJob.js → benchmarks
```

## Deployment (Railway/Render)

1. Push this directory to its own GitHub repo
2. Connect to Railway.app or Render.com
3. Add all `.env` variables in the platform dashboard
4. Set `PORT` to whatever the platform provides
5. Update CORS in `index.js` to point to your deployed frontend URL

## What's Next

- Add real `pdfjs-dist` text extraction for uploaded PDFs
- Set up Redis for Bull queue (required in production)
- Wire in production AWS S3 bucket
- Add SendGrid/Postmark API key and configure SMTP
- Run aggregation job as a nightly cron
- Deploy to Railway/Render
