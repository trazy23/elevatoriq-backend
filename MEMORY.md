# MEMORY.md — Long-term Context

## Who I'm working with
- **Name:** Trey Zackery
- **Timezone:** America/Detroit (EST)
- **Role:** Domain expert + product owner. 15 years elevator industry consulting.
- **Not a developer.** Works with part-time dev (Landen) and AI agents.
- **Test email:** trenaryl.zackery@gmail.com

## Project: ElevatorIQ (elevatoriq.ai)
AI-powered elevator procurement intelligence platform. Users upload elevator invoices, bids, and modernization proposals → Claude analyzes via Rulebook → structured PDF report delivered by email.

**Three analysis modules:**
- Module A: Invoice Review / Contract Coverage
- Module B: Modernization / Single Bid
- Module C: Maintenance Bid Comparison

## Backend Status (as of 2026-02-21)
- **Phases 1–8 complete.** All committed to `/Users/treyzackery/OpenClawSandbox` (main)
- PostgreSQL 17 running locally, `elevatoriq_dev` DB with all 10 tables
- Backend at `elevatoriq-backend/` — Node.js/Express, port 3001
- All keys wired: Anthropic ✅, Cloudflare R2 (`elevatoriq-documents`) ✅, Resend SMTP ✅
- Live end-to-end test passed: 3 real bids → Claude → PDF → email ✅

## Next Steps
1. Deploy to Railway or Render
2. Wire frontend to deployed backend URL
3. Refine Rulebook for better analysis output
4. Add report_body DB caching (skip re-running Claude for PDF regeneration)

## Key Infra
- DB: `postgresql://localhost:5432/elevatoriq_dev`
- R2 endpoint: `https://8d019a2f5e3aaeba152a925ccf74527a.r2.cloudflarestorage.com`
- R2 bucket: `elevatoriq-documents`
- SMTP: smtp.resend.com (user: resend)
- Redis: disabled by default (`REDIS_ENABLED=true` to enable Bull queue)
