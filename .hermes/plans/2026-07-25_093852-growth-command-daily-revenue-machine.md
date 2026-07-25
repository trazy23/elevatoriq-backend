# Growth Command Daily Revenue Machine Plan

## Goal
Turn ElevatorIQ Growth Command from an approval dashboard into a daily revenue operating system that finds qualified prospects, enriches contacts, drafts outreach/content, gets Trey approval only where required, executes approved actions, proves execution, monitors replies, follows up, tracks uploads/revenue, and reports daily.

## Operating principle
Trey is the visionary. Kirsten/Hermes is the integrator/executor.

No more generic blockers. If access is missing, open the account login in the browser and ask Trey to log in there. If Trey does not respond to a blocking question, ping Telegram with the exact question and the default path.

External/public actions remain approval-gated unless Trey explicitly approves a specific recurring automation rule.

## Current verified context
- Backend repo: `/Users/treyzackery/.openclaw/workspace/repos/elevatoriq-backend`
- Frontend repo: `/Users/treyzackery/.openclaw/workspace/repos/elevatoriq`
- Production admin: `https://api.elevatoriq.ai/admin/growth.html`
- Email account via Himalaya is configured as `elevatoriq` and is default.
- LinkedIn browser bridge path exists and has been set up locally.
- Backend working tree currently has untracked `scripts/` from bridge work.
- Frontend working tree was clean at plan time.

## Definitive tool stack

### Required now
1. ElevatorIQ Growth Command backend and database
   - Purpose: approval queue, agents, prospects, campaigns, content, activity, metrics.
   - Status: already exists; needs daily revenue workflows added/hardened.

2. Render Postgres
   - Purpose: source of truth for prospects, contacts, approvals, campaigns, reply states, uploads, revenue, and daily reports.
   - Status: already used by production.

3. Resend
   - Purpose: transactional/campaign sending from ElevatorIQ provider path.
   - Status: email execution is reportedly configured; must be retested end-to-end.

4. Himalaya `elevatoriq` account
   - Purpose: durable Gmail/Workspace inbox monitoring, sent-folder verification, reply/bounce checks.
   - Status: installed and account present.

5. LinkedIn browser bridge
   - Purpose: publish approved ElevatorIQ LinkedIn Company Page posts using logged-in Chrome session.
   - Status: installed; must be tested with one approved live post.

6. Hermes cron jobs
   - Purpose: daily prospecting, reply monitoring, follow-up checks, daily report, weekly optimization.
   - Status: available; jobs need creation after workflows are implemented.

7. Telegram delivery
   - Purpose: ping Trey when approval/input is needed and no response occurs; daily digest if configured to origin/Telegram.
   - Status: available through Hermes gateway/origin delivery.

### Strongly recommended
8. Apollo
   - Purpose: contact enrichment, verified decision-maker emails, LinkedIn/profile data.
   - Required capability: browser access at minimum; API/export if available is better.
   - Execution: open Apollo login in browser if needed. If Trey has Apollo but not API/export rights, use browser-assisted research/export workflow.

9. Google Sheets or HubSpot
   - Preferred: HubSpot if account/tier supports sales pipeline and sequences.
   - MVP fallback: Render Postgres + Growth Command dashboard as CRM, optionally mirrored to Google Sheets.
   - Purpose: make pipeline stages and follow-ups visible/actionable.

10. Plausible/GA4/PostHog or existing site analytics
   - Purpose: connect outreach/content to page visits, uploads, checkout starts, paid unlocks.
   - MVP fallback: backend event table for upload/checkout/payment events.

### Optional later
11. Buffer
   - Purpose: more stable social scheduling than browser bridge.
   - Use if LinkedIn browser bridge proves fragile or if Trey wants scheduled queue management.

12. Hunter/Snov/Clay
   - Purpose: backup enrichment if Apollo is unavailable or insufficient.

13. HubSpot Sales Sequences
   - Purpose: controlled 3-touch sales cadence if Trey’s tier supports it.

## Build phases

### Phase 0: Baseline audit and safety contract
Objective: confirm the current machine is truly executable before adding complexity.

Steps:
1. Check backend/frontend git status.
2. Inspect current Growth Command schema, services, approval execution, content agent, outreach agent, prospecting agent, and bridge scripts.
3. Verify production `/health`, `/readyz`, and Growth summary with admin key.
4. Verify execution readiness states show email/social correctly.
5. Verify launchd LinkedIn bridge state and logs.
6. Verify Himalaya can list inbox/sent for the `elevatoriq` account.
7. Document exactly what is already working vs what is not.

Tests:
- `node --check` on changed JS files.
- `npm test` backend.
- Live readiness endpoint checks.
- Bridge dry-run LinkedIn poster test.
- Himalaya inbox and sent-folder read test.

Exit criteria:
- Dashboard cannot lie: every approval is done/queued/blocked/draft_only/failed/needs_edits with proof.

### Phase 1: End-to-end execution proof
Objective: prove approvals actually create external outcomes.

Steps:
1. Create or select one low-risk LinkedIn post.
2. Ask Trey for explicit public-post approval.
3. Approve it in Growth Command.
4. Confirm bridge publishes it.
5. Capture proof URL/screenshot/status in database and dashboard.
6. Create one email test campaign to an internal/test recipient first.
7. Send via approved execution path.
8. Verify provider result and Sent folder.

Tests:
- LinkedIn post proof visible in dashboard.
- Email sent proof visible in dashboard.
- No duplicate sends.
- Failed publish/send returns actionable status.

Exit criteria:
- One LinkedIn approval posts externally with proof.
- One email approval sends with proof.

### Phase 2: Prospect and contact enrichment engine
Objective: produce sendable leads, not just company names.

Required fields:
- Company
- Website
- Location/market
- Buyer type
- Elevator relevance
- Decision maker name
- Decision maker title
- Verified email
- LinkedIn profile if available
- Source/proof URL
- Outreach angle
- Confidence score
- Status/stage

Steps:
1. Add/confirm database fields for company contacts and enrichment state.
2. Build enrichment providers in priority order:
   a. Apollo browser/API/export if available
   b. Google/web research fallback
   c. Company website contact extraction
   d. Email-pattern inference only if clearly labeled unverified
3. Block job boards and garbage sources.
4. Deduplicate companies and contacts.
5. Require verified email before live-send campaign approval.
6. Create `contact_enrichment_needed` approval when records are not sendable.

Tests:
- Run prospecting agent and inspect 25 records.
- Confirm no job-board companies.
- Confirm verified vs unverified emails are separated.
- Confirm sendable campaign excludes missing-email contacts.

Exit criteria:
- Growth Command can produce 25 qualified prospects/day, with a target of at least 10 verified sendable contacts/day at MVP stage.

### Phase 3: Pipeline CRM inside Growth Command
Objective: make revenue progress trackable and actionable.

Stages:
- New prospect
- Qualified
- Contact enriched
- Drafted
- Approved to contact
- Sent
- Opened/clicked if available
- Replied
- Warm
- Upload requested
- Upload received
- Paid
- Follow-up due
- Not fit
- Unsubscribed/bounced

Steps:
1. Add/confirm pipeline stage fields.
2. Update dashboard to show pipeline counts and next actions.
3. Add per-contact timeline/activity log.
4. Add follow-up due date and owner/agent assignment.
5. Add stage transitions from sends, replies, uploads, and payments.

Tests:
- Seed/test a prospect through all non-external states.
- Verify dashboard pipeline counts match database.
- Verify no stuck `approved` limbo.

Exit criteria:
- Trey can see where every prospect is and what action happens next.

### Phase 4: Outreach drafting and approved send execution
Objective: turn sendable prospects into personalized approved outbound.

Steps:
1. Generate recipient-level drafts, not generic batch copy.
2. Use ElevatorIQ brand signature unless Trey says otherwise.
3. Show exact target, subject, body, and source notes in approval queue.
4. On approval, send individual emails, not bulk BCC.
5. Verify provider result and Sent folder.
6. Update contact stage and next follow-up date.
7. Prevent duplicate sends.

Initial cadence:
- Start with 5-10/day until deliverability and reply quality are proven.
- Then increase only if bounce/spam/reply data supports it.

Tests:
- Internal send test.
- Small approved real batch.
- Sent-folder verification.
- Duplicate-send guard test.
- All-skipped/no-email guard test.

Exit criteria:
- Approved campaigns reliably send to verified contacts and update the pipeline.

### Phase 5: Reply and bounce monitor
Objective: stop letting replies/follow-ups die.

Reply classes:
- Interested
- Asked question
- Wrong person
- Referral given
- Not now
- Not interested
- Unsubscribe
- Bounce
- Out of office
- Spam/deliverability warning

Steps:
1. Build weekday mailbox checker via Himalaya.
2. Match inbound messages to contacts/campaigns.
3. Classify replies.
4. Draft responses/follow-ups.
5. Queue approval when response is external or nuanced.
6. Auto-update bounces/unsubscribes as suppression records.
7. Create follow-up tasks when no response after approved interval.

Tests:
- Read inbox safely.
- Classify sample replies.
- Match thread/contact.
- Suppress bounce/unsubscribe contacts.
- Queue follow-up approval without sending automatically.

Exit criteria:
- Every reply/bounce changes pipeline state and creates the next action.

### Phase 6: Upload/payment/revenue attribution
Objective: know whether the machine makes money.

Events to track:
- Outreach sent
- LinkedIn post published
- Site visit/click if available
- Upload started
- Upload completed
- Preview viewed
- Checkout started
- Paid unlock
- Revenue
- Source/contact/campaign/post attribution where possible

Steps:
1. Inspect existing event/payment/case tables.
2. Add missing attribution parameters or events.
3. Add dashboard revenue scoreboard.
4. Tie upload/payment records back to campaign/source where possible.
5. Add daily and weekly metrics queries.

Tests:
- Simulate/verify event creation.
- Verify checkout/payment status links to revenue totals.
- Verify dashboard metrics match database.

Exit criteria:
- Daily report can show real activity-to-revenue path, not vanity activity.

### Phase 7: Daily autonomous cadence
Objective: make Growth Command run every business day.

Daily jobs:
1. Morning prospect/enrichment run.
2. Outreach draft generation.
3. Reply/bounce monitor.
4. Follow-up due checker.
5. LinkedIn content draft/post queue checker.
6. Daily Growth Command report to Trey.

Daily report format:
- Done
- Working
- Need approval
- Blocked I already tried to solve
- Revenue/uploads/replies/sends/posts
- Top next action

Execution rules:
- Drafting/research can run autonomously.
- Sending and public posting require approval unless Trey approves a specific recurring rule.
- If approval/input is needed and Trey does not respond, ping Telegram with exact ask and default path.

Tests:
- Create cron jobs with self-contained prompts.
- Run jobs manually once.
- Verify output delivery.
- Verify no recursive cron creation.

Exit criteria:
- Growth Command creates a daily work queue and daily report without Trey babysitting it.

### Phase 8: Weekly optimization loop
Objective: make the machine learn.

Weekly report answers:
- Best lead source
- Best buyer persona
- Best subject line/opening angle
- Reply quality
- Objections
- Upload/payment conversion
- Content performance
- What changes next week

Tests:
- Run weekly report from actual database records.
- Verify recommendations tie to data.

Exit criteria:
- Weekly adjustments improve targeting/copy/cadence based on observed results.

## Approval checkpoints
Trey approval required before:
- Public LinkedIn posting.
- External email sending.
- New paid subscription/tool purchase.
- Database migration applied to production.
- Production deploy.
- Stripe/payment configuration changes.

Trey approval not required for:
- Reading code/config/logs.
- Local tests.
- Local scripts.
- Drafting copy/prospects.
- Browser login handoff pages.
- Dry-run posting/sending tests that do not go external.

## Immediate execution order after approval
1. Phase 0 audit.
2. Fix any broken execution proof/status issues.
3. Phase 1: run one LinkedIn and one internal/test email proof.
4. Open Apollo in browser if needed and determine available enrichment capability.
5. Build Phase 2 enrichment engine.
6. Add pipeline/follow-up/reply monitoring.
7. Create daily/weekly Hermes cron cadence.

## Open questions
Only two questions can materially change execution:
1. Should the durable CRM be HubSpot, or should Growth Command/Postgres remain the CRM for now?
   - Default if no answer: keep Growth Command/Postgres as CRM now; add HubSpot later.
2. Can Apollo be used via API/export, or browser only?
   - Default if no answer: open Apollo browser and use browser/export workflow if available.
