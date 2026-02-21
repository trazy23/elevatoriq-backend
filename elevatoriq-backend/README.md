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
| `FROM_EMAIL` | Sender email address |
| `REDIS_HOST` | Redis host for Bull queue (default: 127.0.0.1) |
| `PORT` | Server port (default: 3001) |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/cases` | Create a new analysis case |
| POST | `/api/cases/:id/documents` | Upload a document |
| POST | `/api/cases/:id/run` | Trigger analysis |
| GET | `/api/cases/:id/status` | Poll case status |
| GET | `/api/reports/download/:token` | Download PDF report |
| GET | `/health` | Health check |

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
