# ElevatorIQ launch hardening report — 2026-07-06

Status: local-only changes prepared. No commit, push, deploy, Stripe config, or production env changes performed.

## Fixed locally

1. Stripe webhook fail-closed
- `src/routes/payments.js`
- In production, missing `STRIPE_WEBHOOK_SECRET` now returns 500 and refuses unsigned events.
- Dev/local fallback remains available outside production.
- `/readyz` now includes `STRIPE_WEBHOOK_SECRET` in full-pipeline readiness.

2. Case creation validation and abuse protection
- `src/routes/cases.js`
- Empty case creation now returns 400.
- A valid email is required before case creation.
- Free submissions now run through Turnstile verification when configured.
- Production without `TURNSTILE_SECRET_KEY` fails closed for free submissions.
- Existing disposable-domain block remains.
- Existing free-eligibility checks are now enforced for normalized email/IP caps.

3. Render proxy/rate-limit handling
- `index.js`
- Added `app.set('trust proxy', 1)` so Express/rate limiting can use the first proxy hop real client IP.

4. Admin key leakage
- `src/routes/admin.js`
- Admin API no longer accepts `?key=` query-string auth.
- `admin/index.html`
- Admin dashboard now sends `x-admin-key` headers instead of putting the key in URLs.

5. Report download token expiry
- `src/routes/reports.js`
- Expired `token_expires_at` now returns 404 before touching storage.

6. Env documentation
- `.env.example`
- Added Stripe, admin key, and Turnstile variable names.

7. Regression tests
- `test/launchHardening.test.js`
- Added tests for webhook fail-closed, empty case rejection, admin query-key rejection, expired report token rejection, and trust proxy.

8. Test stability
- `index.js`
- Cron jobs are skipped when `NODE_ENV=test` so requiring the app in tests does not hang the test runner.

## Validation

Command run:
`npm test`

Result:
34 tests passed, 0 failed.

## Changed files

- `.env.example`
- `admin/index.html`
- `index.js`
- `src/routes/admin.js`
- `src/routes/cases.js`
- `src/routes/payments.js`
- `src/routes/reports.js`
- `src/services/botCheckService.js`
- `test/launchHardening.test.js`
- `docs/launch-hardening-report-2026-07-06.md`

## Still required before production deploy

1. Add/confirm Render env vars:
- `STRIPE_WEBHOOK_SECRET`
- `TURNSTILE_SECRET_KEY`
- `ADMIN_API_KEY`
- Stripe price/key vars as applicable

2. Add the frontend Turnstile site key/widget before enabling broad free-submission traffic, or keep free runs/access paths controlled.

3. Rotate the admin key after deploy because old query-string usage may have left it in logs/history.

4. Run Stripe test-mode end-to-end:
- upload preview
- checkout
- webhook
- paid unlock
- analysis
- PDF/email
- valid download works
- expired token fails

5. Commit/push/deploy only after Trey approves.
