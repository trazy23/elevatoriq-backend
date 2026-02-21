# ElevatorIQ API Guide

Base URL (local): `http://localhost:3001`

---

## Full Flow — Submit a Case End-to-End

### Step 1 — Create a Case

```bash
curl -X POST http://localhost:3001/api/cases \
  -H "Content-Type: application/json" \
  -d '{
    "review_type": "maintenance_bid_comparison",
    "customer_email": "client@example.com",
    "state": "MI",
    "market": "Detroit",
    "equipment_type": "traction"
  }'
```

**Required fields:**
- `review_type` — see valid values below
- `customer_email` — where the report PDF gets emailed

**Optional fields:**
- `customer_id` — UUID from customers table (can be omitted)
- `state` — 2-letter state code
- `market` — city/market name
- `equipment_type` — `traction`, `hydraulic`, `escalator`

**Response:**
```json
{ "case_id": "8a05ce68-...", "status": "pending" }
```

Save the `case_id` — you'll need it for the next steps.

---

### Step 2 — Upload Documents

Upload each document one at a time. The field name **must be `file`**.

```bash
curl -X POST http://localhost:3001/api/cases/{CASE_ID}/documents \
  -F "file=@/path/to/bid.pdf"
```

- Accepted formats: **PDF, DOC, DOCX**
- Max file size: **15MB per file**
- File type is auto-detected from the filename (bid/proposal/invoice/contract/etc.)
- Upload as many documents as needed — all are included in the analysis

**Response:**
```json
{
  "document_id": "fbc0a251-...",
  "file_name": "bid_schindler.pdf",
  "auto_detected_type": "proposal"
}
```

---

### Step 3 — Run the Analysis

```bash
curl -X POST http://localhost:3001/api/cases/{CASE_ID}/run
```

**Response:**
```json
{
  "case_id": "8a05ce68-...",
  "status": "processing",
  "message": "Analysis queued"
}
```

Processing takes **2–5 minutes** (Claude API + PDF generation + email send).

---

### Step 4 — Check Status

```bash
curl http://localhost:3001/api/cases/{CASE_ID}/status
```

**Response when complete:**
```json
{
  "id": "8a05ce68-...",
  "status": "complete",
  "created_at": "2026-02-21T06:48:29.923Z",
  "completed_at": "2026-02-21T06:52:20.732Z"
}
```

Status values: `pending` → `processing` → `complete` / `error`

---

### Step 5 — Download the Report (Optional)

Get the download token from the database, then:

```bash
curl http://localhost:3001/api/reports/download/{DOWNLOAD_TOKEN} -o report.pdf
```

Or the user clicks the link in their email — same endpoint, same token.

Tokens expire **7 days** after generation.

---

## Valid Review Types

| Value | Module | Report Type |
|-------|--------|-------------|
| `invoice_review` | A | Invoice line-item audit |
| `contract_coverage` | A | Maintenance contract gap analysis |
| `maintenance_bid_comparison` | C | Side-by-side bid comparison (3-party tested) |
| `modernization_comparison` | B | Multi-proposal modernization comparison |
| `single_modernization` | B | Single modernization proposal evaluation |

---

## All Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Server health check |
| POST | `/api/cases` | Create a new case |
| POST | `/api/cases/:id/documents` | Upload a document to a case |
| POST | `/api/cases/:id/run` | Trigger analysis |
| GET | `/api/cases/:id/status` | Poll case status |
| GET | `/api/reports/download/:token` | Download the PDF report |
