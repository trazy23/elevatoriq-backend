# ElevatorIQ Report Types

There are three modules, five review types. Each produces a different structured report.

---

## Module C — Bid Comparison
**`maintenance_bid_comparison`** and **`modernization_comparison`**

**8-Section Report:**
1. Executive Summary — headline findings, price spread, key flags
2. Price Comparison — base bids, alternates/adders, scope-adjusted effective prices, escalation clauses
3. Product Quality & Manufacturer Assessment — per-vendor deep dive on drive tech, controller lock-in, cab finishes, proprietary vs. open architecture, service network
4. Scope Comparison Matrix — row-by-row normalized comparison (hoistway prep, hoist beam, flooring, OT rates, reinspection fees, storage fees, warranty, phone/cellular, etc.)
5. Risk Signals & Red Flags — HIGH/MEDIUM/LOW rated flags with findings and recommendations
6. Schedule Comparison — lead times, installation timelines, payment milestones
7. Recommended Questions — questions the owner should ask each vendor before award
8. Bottom Line Recommendation — summary verdict with ranked considerations

**Best used when:** Client has 2–4 competitive bids for the same project scope.

**Tested with:** 3 real bids (TK Elevator, Schindler, KONE) — produced 13-page report.

---

## Module A — Invoice & Contract Review
**`invoice_review`** | **`contract_coverage`**

**6-Section Report:**
1. Executive Summary
2. Document Overview & Scope Assessment
3. Line Item Analysis — labor rates, parts markup, unbundled charges
4. Contract Coverage Assessment — what's included vs. excluded
5. Risk & Red Flag Summary
6. Recommendations

**Best used when:**
- `invoice_review` — Client received a maintenance invoice and wants to know if they're being overcharged
- `contract_coverage` — Client has a maintenance contract and wants to know what's actually covered (and what's not)

---

## Module B — Modernization / Single Proposal
**`single_modernization`**

**7-Section Report:**
1. Executive Summary
2. Proposal Scope Review
3. Product & Equipment Assessment
4. Pricing Analysis — against anonymized market patterns
5. Contract Terms & Risk Flags
6. Recommended Questions / Negotiation Points
7. Bottom Line Assessment

**Best used when:** Client received a single modernization or new installation proposal and wants an independent review before signing.

---

## What Affects Report Quality

- **More document content = better analysis.** Full proposals with specs, alternates, T&Cs produce much richer reports than summary sheets.
- **Multiple documents in one case** are all analyzed together — Claude sees all uploaded files in one prompt.
- **The Rulebook** (`rulebook_v1.txt`) is the core of what makes ElevatorIQ analysis domain-specific. Updates to the Rulebook directly improve output quality.

---

## Updating the Rulebook

1. Edit `ElevatorIQ_Rulebook_v1.md` (source of truth)
2. Copy to `elevatoriq-backend/rulebook_v1.txt`:
   ```bash
   cp /Users/treyzackery/OpenClawSandbox/ElevatorIQ_Rulebook_v1.md \
      /Users/treyzackery/OpenClawSandbox/elevatoriq-backend/rulebook_v1.txt
   ```
3. Restart the backend — Rulebook is loaded at startup
