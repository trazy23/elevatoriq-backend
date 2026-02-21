# ElevatorIQ — Operations Reference

**This folder contains everything you need to run, test, and manage ElevatorIQ.**

---

## What ElevatorIQ Does

Users upload elevator documents (bids, invoices, contracts, modernization proposals) → Claude AI analyzes them against the Rulebook → a structured PDF report is generated and emailed to the user.

---

## Three Report Types (Modules)

| Module | Review Type (API value) | Use Case |
|--------|------------------------|----------|
| **A** | `invoice_review` | Reviewing an elevator invoice for overcharges, unbundled line items, labor rate flags |
| **A** | `contract_coverage` | Reviewing a maintenance contract for gaps, exclusions, lock-in clauses |
| **B** | `single_modernization` | Evaluating a single modernization or new installation proposal |
| **B** | `modernization_comparison` | Comparing multiple modernization proposals |
| **C** | `maintenance_bid_comparison` | Comparing multiple maintenance or new installation bids (most tested — 13-page output) |

---

## Key Files

| File/Folder | What It Is |
|-------------|-----------|
| `elevatoriq-backend/` | The full Node.js backend |
| `elevatoriq-backend/.env` | All secrets and config (never commit this) |
| `elevatoriq-backend/rulebook_v1.txt` | The Rulebook Claude uses as its system prompt |
| `ElevatorIQ_Rulebook_v1.md` | Source Rulebook (edit this, then copy to `rulebook_v1.txt`) |
| `ElevatorIQ_Landing_v6.jsx` | Frontend component (not yet wired to backend) |
| `ops/` | This folder — operational reference |

---

## Quick Links

- See `run.md` to start the backend locally
- See `api-guide.md` for how to submit a case end-to-end
- See `email.md` for email config and the sending address
- See `credentials.md` for a map of all API keys
- See `deploy.md` for Railway/Render deployment steps
- See `report-types.md` for what each report module produces
