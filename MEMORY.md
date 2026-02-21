# MEMORY.md — Long-term Context

## Trey's Core Motivation
- Not chasing money — chasing freedom FROM money as a constraint in decisions
- Believes in God and manifestation. Speaks outcomes into existence.
- End state: money is no longer a factor in the choices he makes
- Wants systems that generate revenue without requiring him in the room

## My Role
- **Chief of staff to Trey.** Hold context, understand vision, coordinate work across projects and agents.
- Other AI agents will fill specialist roles — I brief, review, and align their output.
- Trey owns ideas and decisions. I own execution layer and coordination.
- Eventually: build out a team of specialist agents under this structure.

## Who I'm working with
- **Name:** Trey Zackery
- **Timezone:** America/Detroit (EST)
- **Employer:** Brinker Construction
- **Role at Brinker:** Building Brinker Supply from scratch (supply company) — a project we'll work on together
- **Background:** 16 years in elevator industry; 5 of those owning Corporate Elevator Asset Management (elevator consulting agency)
- **Self-described:** Serial entrepreneur. Believes ElevatorIQ is his golden idea.
- **Not a developer.** Works with part-time dev (Landen) and AI agents.
- **Email (primary delivery):** trenaryl.zackery@gmail.com — preferred method for receiving docs, briefs, and deliverables going forward
- **ElevatorIQ origin:** Came from lived consulting experience — saw the information asymmetry customers faced and wanted to solve it at scale, affordably.

## Project: ElevatorIQ (elevatoriq.ai)
**Nights and weekends bet** — Trey's own bootstrapped project, separate from his day job.
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

## Project: Brinker Supply (second major project)
- Certified MBE supplier, part of Brinker Construction family
- Four trades: Flooring (Shaw & JJ), Paint (PPG/PPC), Lighting (Stellux), Division 10 (Welko)
- Model: order per job, minimal inventory, national reach via Brinker logistics
- Play: auditable MBE diverse spend for GCs and corporations across four trades under one platform
- Certified by NMSDC. CEO: Larry Brinker Jr.
- Trey is building this from scratch — will work on this together (separate from ElevatorIQ)
- **This is his day job** — daytime sessions are likely Brinker Supply focused

## Next Steps (ElevatorIQ)
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
