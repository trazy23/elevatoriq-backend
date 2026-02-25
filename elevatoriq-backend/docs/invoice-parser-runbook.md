# Invoice Parser API Runbook

## Endpoint
- **Route:** `POST /api/invoice/parse`
- **Content-Type:** `multipart/form-data`
- **Required field:** `file` (PDF only)
- **Max upload size:** 15MB

## Expected Response
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
  }
}
```

## Validation & Error Behavior
- `400` when no file is provided.
- `400` when uploaded file is not a PDF.
- `413` when file exceeds 15MB.
- `422` when text extraction fails (image-only/empty PDF).
- `500` when parsed payload or response fails schema validation.

## Parsing Reliability Improvements
Current parser improvements include:
- US + EU currency parsing (`$1,234.56`, `1.234,56`, `(250.00)`).
- Vendor extraction via labels (`Vendor`, `Supplier`, `From`, `Bill From`) + header fallback.
- Brand canonicalization (`OTIS`, `SCHINDLER`, `TK ELEVATOR`, etc.).
- Model extraction from multiple label patterns.
- More tolerant line-item extraction for table-like rows and free-form invoice lines.
- Subtotal inference from line items when subtotal label is absent.

## Troubleshooting
1. **422 for valid-looking PDF**
   - Verify PDF has selectable text (not scanned image).
   - Run OCR upstream before sending to parser.

2. **Missing line items in output**
   - Check source formatting: line item rows must include at least one parseable amount.
   - Confirm totals rows are not mislabeled as line items.

3. **Schema validation 500s**
   - Inspect backend logs for Ajv validation errors.
   - Ensure parser returns only expected fields in `data` and line item objects.

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
