# Parser API Consumer Readiness Audit

_Date: 2026-02-25_

## Scope

Target repo:
- `elevatoriq-backend/elevatoriq-backend`

## Current Readiness Summary

**Status:** Improved for bid-analysis handoff; still requires production hardening tasks.

### What is now in place

- Stable parser route: `POST /api/invoice/parse`
- PDF-only upload validation with 15 MB limit
- Structured success response now includes:
  - raw parsed payload (`data`)
  - normalized handoff mapping (`normalized`)
  - explicit confidence metadata (`confidence`)
- Structured error semantics with machine-readable codes and retryability hints
- JSON schema validation for success and error contracts
- Expanded tests for parser edge cases and endpoint behavior

### Remaining Gaps / Risks

1. Confidence scoring is heuristic-only (`heuristic_v1`) and not calibrated against labeled invoice outcomes.
2. Currency is currently defaulted to `USD` in normalized mapping.
3. OCR fallback is still not integrated for image-only PDFs.
4. No rate limiting / auth requirement currently enforced on parser route.
5. Observability is basic (logs only) without parse-quality metrics dashboards.

---

## Integration Rollout Recommendation

1. Keep consumer integration behind `PARSER_API_ENABLED=false` default.
2. Validate normalized mapping and confidence distribution in staging against representative invoices.
3. Establish acceptance thresholds for `confidence.overall_score` before auto-ingest into bid analysis.
4. Enable in production for limited tenant slice and monitor errors by `error.code`.
5. Expand to full rollout after confidence calibration and OCR strategy are finalized.

---

## Checklist

- [x] API contract now includes normalized output map
- [x] API contract now includes explicit confidence metadata
- [x] Error responses now follow machine-readable semantics
- [x] Parser/route tests expanded for edge cases and schema failure paths
- [x] Runbook updated with new response/error contracts
- [ ] Confidence thresholds calibrated with real production invoices
- [ ] OCR fallback strategy implemented
- [ ] Endpoint auth + rate limiting finalized
- [ ] Metrics/alerts added for parser quality and failure trends

---

## Blockers for Production Readiness

1. **Confidence calibration gap:** current scoring is heuristic and requires validation against true labels.
2. **OCR dependency:** scanned PDFs still fail with `UNREADABLE_DOCUMENT` without upstream OCR.
3. **Security controls:** parser route lacks mandatory auth and abuse protection controls.
4. **Observability:** missing operational dashboards/alerts for confidence drift and error-code spikes.