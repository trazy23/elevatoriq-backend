# Parser API Consumer Readiness Audit

_Date: 2026-02-25_

## Scope

Requested audit target path was `/repos/elevatoriq`, but only `/repos/elevatoriq-backend` exists in this workspace. This audit was performed against:

- `elevatoriq-backend/elevatoriq-backend`

## Current Readiness Summary

**Status:** Partially ready for a frontend/client to consume `POST /api/invoice/parse`.

### What is already in place

- Stable parser route exists: `POST /api/invoice/parse`
- File upload contract enforced with `multer` memory storage
- PDF-only validation with 15 MB limit
- Structured JSON response shape is implemented and documented in README
- Basic route-level error handling exists (400/422/500 patterns)
- Local frontend CORS origins include `localhost:3000` and `localhost:5173`

### Gaps / Risks identified

1. **No dedicated consumer client module** in repo to standardize request/response handling.
2. **No explicit contract artifact** (schema/interface) that frontend teams can import/reference.
3. **No parser-integration feature flag** for safe staged rollout in consuming apps.
4. **No `.env.example`** in app directory despite README suggesting one.
5. **Potential deployment mismatch risk** due to hardcoded static dist path (`/root/elevatoriq-dist`) in `index.js`.

---

## Environment Config Notes (for consumer integration)

These vars are added for safe parser API consumption and rollout control:

- `PARSER_API_ENABLED` (default: `false`)
  - Feature toggle for parser API integration.
  - Accepted truthy values in stub: `true`, `1`, `yes`, `on`.

- `PARSER_API_BASE_URL` (default: `http://localhost:3001`)
  - Base URL for backend parser API.

- `PARSER_API_TIMEOUT_MS` (default: `30000`)
  - Request timeout in milliseconds.

- `PARSER_API_BEARER_TOKEN` (optional)
  - Optional bearer auth token for environments where parser endpoint is protected.

> Note: Existing backend endpoint does not currently require bearer auth by default; token support is included for forward compatibility.

---

## Integration Rollout Recommendation

1. Ship client code with `PARSER_API_ENABLED=false` by default.
2. Enable in local dev/staging only.
3. Validate response mapping and error behavior against real PDFs.
4. Enable in production for small cohort/tenant slice.
5. Monitor 4xx/5xx + parsing quality, then fully enable.

---

## Checklist

- [x] Environment configuration notes documented
- [x] API client contract artifact added
- [x] Feature-flagged integration stub added
- [x] Basic tests for flag and request behavior added
- [ ] Consumer app wires the stub into upload UX
- [ ] Auth strategy confirmed for production parser endpoint
- [ ] Monitoring/alerts defined for parse failures

---

## Blockers

1. **Missing target repo path** (`/repos/elevatoriq` not present) — work completed in `elevatoriq-backend`.
2. **Auth contract not finalized** (public vs bearer-protected parser endpoint in prod).
3. **No consuming frontend codebase present in workspace** to complete end-to-end wiring.
