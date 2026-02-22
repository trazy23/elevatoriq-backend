# MEMORY.md — Long-term Context

## Corporate Structure
- **Lightward Ventures LLC** — holding company being created and filed ASAP
- All ventures (ElevatorIQ, Trill Golf, and personal stake in Brinker Supply) will fall under Lightward Ventures
- Purpose: remove Trey personally from liability, clean ownership structure across all businesses

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

## Day 1 Build Summary (Feb 21-22, 2026)

**What got done:**
- OpenClaw v1.0 → v1.1 complete — 10 agents (Kirsten + 9 specialists), 6 on free Ollama
- Cost crisis fixed: switched Kirsten to Claude Haiku (20x cheaper), enabled 1-hour prompt caching (69% hit rate)
- ElevatorIQ backend pushed to `https://github.com/trazy23/elevatoriq-backend`
- Trinity Health Oakland pilot package ready (4 PDFs) + research brief complete
- Model stack optimized: Sonnet for critical reasoning only, Ollama for day-to-day work, Gemini for research/content
- Prompt caching eliminates re-reading system context on every message

**Cost Impact:**
- Day 1 spent ~$50 (building, testing, analysis) — not sustainable
- Now: projected $2-5/day with caching + Haiku for routine work
- Sonnet only on: Kirsten (orchestration), Builder (code gen), Legal agent (specialized)

## Tomorrow (Feb 22 — 30 minutes max)

1. **Railway deploy** — already logged in (from 01:30 session)
   ```bash
   cd ~/OpenClawSandbox/elevatoriq-backend
   railway up --detach
   ```
   Will give you a live URL like `https://elevatoriq-backend-prod.railway.app`

2. **Run schema** on live DB — Kirsten will do this once you have the URL

3. **Wire frontend** — update API_BASE in `ElevatorIQ_Landing_v6.jsx` to the live URL

4. **Test** — POST to `/api/prompt` with a test case

5. **Ready for Rocky's pilot**

## Next Steps (ElevatorIQ — Post-Deploy)
1. Deploy to Railway or Render
2. Wire frontend to deployed backend URL
3. Refine Rulebook for better analysis output
4. Add report_body DB caching (skip re-running Claude for PDF regeneration)

## Trey's Setup
- **Calendars:** Google + Apple + Outlook, all synced to iCal on Mac
- **Calendar access:** Need `brew install ical-buddy` — not yet installed. Once done, I can read full schedule across all three.
- **Email delivery preference:** trenaryl.zackery@gmail.com for all deliverables
- **Kirsten email (pending):** Trey wants to set up a dedicated email for Kirsten that both can monitor. Options discussed: kirsten@elevatoriq.ai (Resend + Cloudflare forwarding) or shared Gmail. Leaning toward Option 3 (both). Not yet set up.

## Key Infra
- DB: `postgresql://localhost:5432/elevatoriq_dev`
- R2 endpoint: `https://8d019a2f5e3aaeba152a925ccf74527a.r2.cloudflarestorage.com`
- R2 bucket: `elevatoriq-documents`
- SMTP: smtp.resend.com (user: resend)
- Redis: disabled by default (`REDIS_ENABLED=true` to enable Bull queue)
