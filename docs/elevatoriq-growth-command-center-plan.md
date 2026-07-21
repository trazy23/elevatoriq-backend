# ElevatorIQ Web Growth Command Center Implementation Plan

Goal: Turn the local launch dashboard into a protected web-based CEO cockpit at /admin/growth.html, backed by production database tables and approval-triggered actions.

Architecture:
- Backend owns the source of truth: growth agents, prospects, campaigns, recipients, approvals, and activity events.
- Admin UI uses existing x-admin-key auth and calls /api/admin/growth/* endpoints.
- Approval buttons record Trey’s decision and cue the configured action.
- Safety default: external actions are disabled unless GROWTH_ACTIONS_ENABLED=true. This lets us deploy the dashboard read/approve-safe first, then explicitly enable live sends when ready.

What is now scaffolded locally:
1. Database migration
   - migrations/012_growth_command_center.sql
   - Adds growth_agents, growth_prospects, growth_campaigns, growth_campaign_recipients, growth_approvals, growth_activity_events.
   - Seeds the six launch agents: Site QA, Prospecting, Outreach, Content, Product Intelligence, Scoreboard.

2. Backend service
   - src/services/growthCommandService.js
   - Builds executive summary.
   - Lists agents, approvals, campaigns, prospects.
   - Approves/rejects approval items.
   - Executes safe action types.
   - Can send approved email through Resend only when GROWTH_ACTIONS_ENABLED=true.

3. Admin API routes
   - GET /api/admin/growth/summary
   - GET /api/admin/growth/approvals
   - GET /api/admin/growth/campaigns
   - GET /api/admin/growth/prospects
   - POST /api/admin/growth/approvals/:id/approve
   - POST /api/admin/growth/approvals/:id/reject

4. Web UI
   - admin/growth.html
   - Shows executive summary, CEO action needed, KPIs, approval queue, agents, campaigns, prospects, and activity.
   - Approval button says “Approve / cue action.”
   - Shows whether external action mode is enabled or safe-mode queued only.

Deployment gates before production:
1. Apply migration 012 to Render Postgres.
2. Push backend changes to main to deploy admin/growth.html and APIs.
3. Verify /admin/growth.html loads behind admin key.
4. Keep GROWTH_ACTIONS_ENABLED unset/false for first smoke test.
5. Seed one fake approval item and verify Approve records/queues but does not send.
6. Only after Trey says “Approved, enable live growth actions,” set GROWTH_ACTIONS_ENABLED=true and verify with one test email to Trey first.
7. After test email passes, use it for first 5-prospect Michigan batch.

Required env vars for live sending:
- EMAIL_PROVIDER_API_KEY
- FROM_EMAIL or OUTREACH_FROM_EMAIL
- Optional: OUTREACH_FROM_NAME=ElevatorIQ
- GROWTH_ACTIONS_ENABLED=true

CEO usage model:
- Open /admin/growth.html from anywhere.
- Read Executive Summary first.
- Review approval cards.
- Click Approve / Needs edits / Reject.
- Agents populate prospects/campaigns/content/QA findings into the backend.
- Approval can either queue work or execute it immediately depending on action type and safe-mode env.

Important safety rules:
- Public/external actions remain approval-gated.
- Production deploy and DB migration still require Trey approval.
- Live outbound email sending requires GROWTH_ACTIONS_ENABLED=true plus explicit Trey approval.
- LinkedIn/content posting and deploy actions are approved/queued but not auto-executable yet.
