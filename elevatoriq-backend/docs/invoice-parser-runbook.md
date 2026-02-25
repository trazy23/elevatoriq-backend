# Invoice Parser API Runbook

## Endpoint
- **Route:** `POST /api/invoice/parse`
- **Content-Type:** `multipart/form-data`
- **Required field:** `file` (PDF only)
- **Max upload size:** 15MB

## Expected Success Response
```json
{
  "success": true,
  "file_name": "invoice.pdf",
  "extracted_characters": 3812,
  "data": {
    "vendor": "Acme Elevator Services",
    "elevator_brand": "OTIS",
    "elevator_model": "Gen2 MRL",
    "line_items": [
      {
        "description": "Door roller replacement",
        "quantity": 2,
        "unit_price": 125,
        "total": 250
      }
    ],
    "totals": {
      "subtotal": 550,
      "tax": 33,
      "total": 583
    }
  },
  "normalized": {
    "supplier_name": "Acme Elevator Services",
    "oem_brand": "OTIS",
    "oem_model": "Gen2 MRL",
    "currency": "USD",
    "totals": {
      "subtotal_amount": 550,
      "tax_amount": 33,
      "invoice_total_amount": 583
    },
    "line_items": [
      {
        "index": 0,
        "title": "Door roller replacement",
        "quantity": 2,
        "unit_amount": 125,
        "line_total": 250,
        "category_hint": "parts_or_other"
      }
    ],
    "bid_analysis": {
      "inferred_service_scope": ["Door roller replacement"],
      "inferred_vendor_slug": "acme_elevator_services"
    }
  },
  "confidence": {
    "overall": "high",
    "overall_score": 0.905,
    "fields": {
      "vendor": 0.86,
      "elevator_brand": 0.88,
      "elevator_model": 0.78,
      "totals_subtotal": 0.92,
      "totals_tax": 0.84,
      "totals_total": 0.95,
      "line_items_count": 0.62
    },
    "methodology": "heuristic_v1"
  }
}
```

## Validation & Error Semantics
- `400` + `MISSING_FILE` when no file is provided.
- `400` + `UNSUPPORTED_OR_INVALID_UPLOAD` when uploaded file is not a PDF.
- `413` + `FILE_TOO_LARGE` when file exceeds 15MB.
- `422` + `UNREADABLE_DOCUMENT` when text extraction fails (image-only/empty PDF).
- `500` + `PARSED_DATA_SCHEMA_INVALID` when parsed payload fails schema validation.
- `500` + `PARSE_RESPONSE_SCHEMA_INVALID` when response contract generation fails schema validation.
- `500` + `PARSER_RUNTIME_FAILURE` for unexpected server runtime failures.

Error shape:
```json
{
  "success": false,
  "error": {
    "code": "UNREADABLE_DOCUMENT",
    "message": "PDF appears to be image-based or empty — no extractable text found.",
    "http_status": 422,
    "retryable": false
  }
}
```

## Parsing Reliability Improvements
Current parser improvements include:
- US + EU currency parsing (`$1,234.56`, `1.234,56`, `(250.00)`).
- Vendor extraction via labels (`Vendor`, `Supplier`, `From`, `Bill From`) + header fallback.
- Brand canonicalization (`OTIS`, `SCHINDLER`, `TK ELEVATOR`, etc.).
- Model extraction from multiple label patterns.
- More tolerant line-item extraction for table-like rows and free-form invoice lines.
- Subtotal inference from line items when subtotal label is absent.
- Normalized output map for bid-analysis handoff.
- Explicit field-level and overall confidence metadata.

## Troubleshooting
1. **422 for valid-looking PDF**
   - Verify PDF has selectable text (not scanned image).
   - Run OCR upstream before sending to parser.

2. **Missing line items in output**
   - Check source formatting: line item rows must include at least one parseable amount.
   - Confirm totals rows are not mislabeled as line items.

3. **Schema validation 500s**
   - Inspect backend logs for Ajv validation errors.
   - Ensure parser returns only expected fields in `data`, `normalized`, and `confidence`.

## Smoke Test (curl)
```bash
curl -X POST http://localhost:3001/api/invoice/parse \
  -F "file=@./fixtures/sample-invoice.pdf;type=application/pdf"
```

## Test Commands
```bash
npm test
node --test test/invoiceParserService.test.js
node --test test/invoiceRoute.test.js
```