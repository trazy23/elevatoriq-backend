const puppeteer = require('puppeteer');
const QRCode = require('qrcode');
const storageService = require('./storageService');

const REVIEW_LABELS = {
  modernization_comparison:    'Modernization Bid Comparison',
  maintenance_bid_comparison:  'Maintenance Bid Comparison',
  invoice_review:              'Invoice & Billing Review',
  contract_coverage:           'Contract Coverage Analysis',
  single_modernization:        'Single Bid Review',
};

// ─── Text → HTML formatter ────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatBody(raw) {
  const lines = raw.split('\n');
  let html = '';
  let inList = false;
  let sectionCount = 0;

  function closeList() {
    if (inList) { html += '</ul>'; inList = false; }
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // ── Skip decoration lines (═══)
    if (/^═{6,}/.test(trimmed)) {
      closeList();
      continue;
    }

    // ── Section header: SECTION N — TITLE
    if (/^SECTION \d+\s*[—-]/.test(trimmed)) {
      closeList();
      sectionCount++;
      const title = trimmed.replace(/^SECTION \d+\s*[—-]\s*/, '');
      html += `
        <div class="section-block">
          <div class="section-number">0${sectionCount}</div>
          <h2 class="section-title">${escapeHtml(title)}</h2>
        </div>`;
      continue;
    }

    // ── Risk signal: [HIGH] / [MEDIUM] / [LOW]
    if (/^\[(HIGH|MEDIUM|LOW)\]/.test(trimmed)) {
      closeList();
      const sev = trimmed.match(/^\[(HIGH|MEDIUM|LOW)\]/)[1];
      const rest = trimmed.replace(/^\[(HIGH|MEDIUM|LOW)\]\s*/, '');
      const cls = sev === 'HIGH' ? 'risk-high' : sev === 'MEDIUM' ? 'risk-med' : 'risk-low';
      html += `
        <div class="risk-block ${cls}">
          <span class="risk-badge">${sev}</span>
          <span class="risk-title">${escapeHtml(rest)}</span>
        </div>`;
      continue;
    }

    // ── Sub-labels: "Finding:", "Risk:", "Recommendation:", etc.
    const subLabelMatch = trimmed.match(/^(Finding|Risk|Recommendation|Assessment|Confidence|Explanation|Commentary|Note):\s*(.*)/);
    if (subLabelMatch) {
      closeList();
      html += `<p class="sub-label"><span class="sub-key">${escapeHtml(subLabelMatch[1])}:</span> ${escapeHtml(subLabelMatch[2])}</p>`;
      continue;
    }

    // ── Bullet points
    if (/^[-•*]\s+/.test(trimmed)) {
      if (!inList) { html += '<ul>'; inList = true; }
      const content = trimmed.replace(/^[-•*]\s+/, '');
      // Bold the part before a colon if present (e.g. "- TK Elevator: includes...")
      const colonIdx = content.indexOf(':');
      if (colonIdx > 0 && colonIdx < 40) {
        const key = content.substring(0, colonIdx);
        const val = content.substring(colonIdx + 1);
        html += `<li><strong>${escapeHtml(key)}:</strong>${escapeHtml(val)}</li>`;
      } else {
        html += `<li>${escapeHtml(content)}</li>`;
      }
      continue;
    }

    closeList();

    // ── Empty line
    if (trimmed === '') {
      html += '<div class="gap"></div>';
      continue;
    }

    // ── ALL-CAPS sub-headers (e.g. "PRICE BREAKDOWN", "VENDOR: TK ELEVATOR")
    if (
      trimmed === trimmed.toUpperCase() &&
      trimmed.length > 4 &&
      trimmed.length < 90 &&
      /[A-Z]{3}/.test(trimmed) &&
      !trimmed.startsWith('[')
    ) {
      html += `<h3 class="sub-heading">${escapeHtml(trimmed)}</h3>`;
      continue;
    }

    // ── Bold lines that end with colon (vendor intros, category headers)
    if (trimmed.endsWith(':') && trimmed.length < 80 && !trimmed.includes('.')) {
      html += `<p class="label-line">${escapeHtml(trimmed)}</p>`;
      continue;
    }

    // ── Normal paragraph — bold inline **text**
    const withBold = escapeHtml(trimmed).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html += `<p>${withBold}</p>`;
  }

  closeList();
  return html;
}

// ─── Cover page HTML ──────────────────────────────────────────────────────────

async function buildCoverPage(label, date, downloadUrl) {
  let qrDataUrl = '';
  try {
    qrDataUrl = await QRCode.toDataURL(downloadUrl, {
      width: 110,
      margin: 1,
      color: { dark: '#0B0E13', light: '#FFFFFF' },
    });
  } catch (e) {
    console.warn('[PDF] QR code generation failed:', e.message);
  }

  return `
    <div class="cover">
      <!-- Dark top band -->
      <div class="cover-header">
        <div class="cover-logo">Elevator<span>IQ</span></div>
        <div class="cover-logo-tag">Structured intelligence, not guesswork.</div>
      </div>
      <div class="cover-accent-bar"></div>

      <!-- Center content -->
      <div class="cover-body">
        <div class="cover-report-label">Independent Analysis Report</div>
        <div class="cover-report-type">${escapeHtml(label)}</div>
        <div class="cover-date">${escapeHtml(date)}</div>

        <div class="cover-divider"></div>

        <div class="cover-trust-row">
          <div class="cover-trust-item">
            <div class="cover-trust-icon">✓</div>
            <div class="cover-trust-text">Independent<br/>Analysis</div>
          </div>
          <div class="cover-trust-item">
            <div class="cover-trust-icon">✓</div>
            <div class="cover-trust-text">Confidential<br/>Report</div>
          </div>
          <div class="cover-trust-item">
            <div class="cover-trust-icon">✓</div>
            <div class="cover-trust-text">No Vendor<br/>Affiliations</div>
          </div>
          <div class="cover-trust-item">
            <div class="cover-trust-icon">✓</div>
            <div class="cover-trust-text">Domain Expert<br/>Intelligence</div>
          </div>
        </div>
      </div>

      <!-- QR section -->
      <div class="cover-qr-section">
        ${qrDataUrl ? `
          <div class="cover-qr-block">
            <img src="${qrDataUrl}" class="cover-qr-img" alt="Download QR"/>
            <div class="cover-qr-label">Scan to access<br/>your secure report</div>
          </div>
        ` : ''}
        <div class="cover-url">elevatoriq.ai</div>
      </div>

      <!-- Bottom footer bar -->
      <div class="cover-footer">
        <div class="cover-footer-left">
          <span class="cover-footer-logo">Elevator<span>IQ</span></span>
          <span class="cover-footer-tag">"Upload. Analyze. Decide."</span>
        </div>
        <div class="cover-footer-right">
          Secure · Confidential · No Vendor Affiliations
        </div>
      </div>
    </div>
  `;
}

// ─── Full HTML document ───────────────────────────────────────────────────────

async function wrapInHTML(reportBody, reviewType, downloadUrl) {
  const label = REVIEW_LABELS[reviewType] || reviewType;
  const date  = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const bodyHtml  = formatBody(reportBody);
  const coverHtml = await buildCoverPage(label, date, downloadUrl || 'https://elevatoriq.ai');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>

/* ══════════ RESET ══════════ */
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Helvetica, Arial, sans-serif; font-size: 10.5pt; color: #1a1f2a; background: white; line-height: 1.65; }

/* ══════════ COVER PAGE ══════════ */
.cover {
  width: 100%; height: 100vh;
  display: flex; flex-direction: column;
  page-break-after: always;
  background: white;
}
.cover-header {
  background: #0B0E13;
  padding: 40px 52px 28px;
}
.cover-logo {
  font-size: 38pt; font-weight: 800; color: white; letter-spacing: -1.5px; line-height: 1;
}
.cover-logo span { color: #00B876; }
.cover-logo-tag {
  font-size: 10pt; color: #4B5563; margin-top: 8px; letter-spacing: 0.04em; font-style: italic;
}
.cover-accent-bar { background: #00B876; height: 4px; }

.cover-body {
  flex: 1; display: flex; flex-direction: column; justify-content: center;
  align-items: flex-start; padding: 52px 52px 32px;
}
.cover-report-label {
  font-size: 9pt; font-weight: 700; color: #00B876; letter-spacing: 0.18em;
  text-transform: uppercase; margin-bottom: 16px;
}
.cover-report-type {
  font-size: 28pt; font-weight: 800; color: #0B0E13; letter-spacing: -0.8px;
  line-height: 1.15; max-width: 520px; margin-bottom: 18px;
}
.cover-date {
  font-size: 11pt; color: #6B7280; margin-bottom: 40px;
}
.cover-divider {
  width: 60px; height: 3px; background: #00B876; margin-bottom: 40px; border-radius: 2px;
}
.cover-trust-row {
  display: flex; gap: 32px;
}
.cover-trust-item { display: flex; align-items: flex-start; gap: 10px; }
.cover-trust-icon {
  width: 26px; height: 26px; background: #00B876; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: white; font-size: 11pt; font-weight: 800; flex-shrink: 0;
  line-height: 1;
}
.cover-trust-text {
  font-size: 9pt; color: #374151; line-height: 1.4; font-weight: 500;
}

.cover-qr-section {
  padding: 0 52px 28px;
  display: flex; align-items: flex-end; justify-content: space-between;
}
.cover-qr-block { display: flex; align-items: center; gap: 14px; }
.cover-qr-img { width: 90px; height: 90px; border: 1px solid #E5E7EB; border-radius: 6px; padding: 4px; }
.cover-qr-label { font-size: 8.5pt; color: #6B7280; line-height: 1.5; }
.cover-url { font-size: 9pt; color: #9CA3AF; letter-spacing: 0.04em; }

.cover-footer {
  background: #0B0E13; padding: 16px 52px;
  display: flex; justify-content: space-between; align-items: center;
}
.cover-footer-left { display: flex; align-items: center; gap: 20px; }
.cover-footer-logo { font-size: 14pt; font-weight: 800; color: white; letter-spacing: -0.5px; }
.cover-footer-logo span { color: #00B876; }
.cover-footer-tag { font-size: 8pt; color: #4B5563; font-style: italic; }
.cover-footer-right { font-size: 7.5pt; color: #4B5563; }

/* ══════════ REPORT HEADER (pages 2+) ══════════ */
.report-header {
  background: #0B0E13;
  padding: 14px 44px;
  display: flex; justify-content: space-between; align-items: center;
}
.report-header-logo { font-size: 15pt; font-weight: 800; color: white; letter-spacing: -0.5px; }
.report-header-logo span { color: #00B876; }
.report-header-right { font-size: 8.5pt; color: #4B5563; text-align: right; line-height: 1.6; }
.report-accent { background: #00B876; height: 3px; }

/* ══════════ CONTENT ══════════ */
.content { padding: 32px 48px 48px; }

p { margin: 6px 0; color: #1F2937; }

/* Section block */
.section-block {
  display: flex; align-items: flex-start; gap: 14px;
  margin: 34px 0 12px 0;
  padding-bottom: 10px;
  border-bottom: 2px solid #0B0E13;
  page-break-after: avoid;
}
.section-number {
  font-size: 22pt; font-weight: 800; color: #00B876;
  line-height: 1; flex-shrink: 0; letter-spacing: -1px;
  margin-top: -4px;
}
h2.section-title {
  font-size: 14pt; font-weight: 800; color: #0B0E13;
  letter-spacing: -0.3px; line-height: 1.2;
  text-decoration: underline; text-decoration-color: #00B876;
  text-underline-offset: 4px;
}

h3.sub-heading {
  font-size: 9pt; font-weight: 700; color: white;
  background: #0B0E13;
  padding: 5px 10px;
  margin: 20px 0 8px 0;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  border-radius: 3px;
  display: inline-block;
}

.label-line {
  font-weight: 700; color: #111827; margin: 12px 0 4px 0; font-size: 10.5pt;
  border-bottom: 1px solid #E5E7EB; padding-bottom: 3px;
}

ul { padding-left: 22px; margin: 8px 0; }
li { margin: 5px 0; color: #1F2937; }
li strong { color: #0B0E13; }

.gap { height: 8px; }

/* ── Risk blocks ── */
.risk-block {
  display: flex; align-items: flex-start; gap: 12px;
  border-left: 4px solid; padding: 12px 16px;
  margin: 14px 0; border-radius: 0 6px 6px 0;
  page-break-inside: avoid;
}
.risk-high   { border-color: #DC2626; background: #fef2f2; }
.risk-med    { border-color: #D97706; background: #fffbeb; }
.risk-low    { border-color: #6B7280; background: #f9fafb; }

.risk-badge {
  font-size: 7.5pt; font-weight: 800; padding: 3px 9px;
  border-radius: 3px; color: white; letter-spacing: 0.08em;
  text-transform: uppercase; white-space: nowrap; flex-shrink: 0; margin-top: 1px;
}
.risk-high .risk-badge { background: #DC2626; }
.risk-med  .risk-badge { background: #D97706; }
.risk-low  .risk-badge { background: #6B7280; }
.risk-title { font-size: 10.5pt; font-weight: 700; color: #111827; }

.sub-label { margin: 4px 0 4px 18px; color: #374151; font-size: 10pt; }
.sub-key { font-weight: 700; color: #111827; }

/* ══════════ REPORT FOOTER ══════════ */
.report-footer {
  background: #0B0E13; margin-top: 48px;
  padding: 18px 44px;
  display: flex; justify-content: space-between; align-items: center;
}
.footer-logo { font-size: 14pt; font-weight: 800; color: white; letter-spacing: -0.5px; }
.footer-logo span { color: #00B876; }
.footer-tagline { font-size: 8pt; color: #4B5563; font-style: italic; margin-top: 3px; }
.footer-right { text-align: right; font-size: 8pt; color: #4B5563; line-height: 1.8; }
.footer-disclaimer {
  font-size: 7pt; color: #6B7280; padding: 10px 44px;
  border-top: 1px solid #1F2937; background: #0B0E13; text-align: center;
}

/* ══════════ PRINT ══════════ */
@media print {
  .cover                { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .cover-header         { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .cover-footer         { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .cover-trust-icon     { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .report-header        { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .report-accent        { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .risk-block           { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .risk-badge           { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h3.sub-heading        { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .report-footer        { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .footer-disclaimer    { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .section-block        { page-break-after: avoid; }
  .risk-block           { page-break-inside: avoid; }
}

</style>
</head>
<body>

${coverHtml}

<!-- ══ REPORT HEADER (page 2+) ══ -->
<div class="report-header">
  <div class="report-header-logo">Elevator<span>IQ</span></div>
  <div class="report-header-right">
    ${escapeHtml(label)}<br/>
    ${escapeHtml(date)}
  </div>
</div>
<div class="report-accent"></div>

<!-- ══ BODY ══ -->
<div class="content">
  ${bodyHtml}
</div>

<!-- ══ REPORT FOOTER ══ -->
<div class="report-footer">
  <div>
    <div class="footer-logo">Elevator<span>IQ</span></div>
    <div class="footer-tagline">"Upload. Analyze. Decide."</div>
  </div>
  <div class="footer-right">
    elevatoriq.ai &nbsp;·&nbsp; Independent Elevator Intelligence<br/>
    Secure · Confidential · No Vendor Affiliations
  </div>
</div>
<div class="footer-disclaimer">
  This report is generated for decision-support purposes only. All findings should be verified against original contract documents before execution.
  ElevatorIQ is an independent platform with no affiliation to any elevator manufacturer, contractor, or service provider.
</div>

</body>
</html>`;
}

// ─── PDF generation ───────────────────────────────────────────────────────────

async function generatePDF(reportBody, caseId, reviewType, downloadUrl) {
  const html = await wrapInHTML(reportBody, reviewType, downloadUrl);
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    timeout: 60000,
    protocolTimeout: 180000,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
    const pdf = await page.pdf({
      format: 'Letter',
      margin: { top: '0.4in', bottom: '0.6in', left: '0.4in', right: '0.4in' },
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `<div style="width:100%; font-size:7pt; color:#9CA3AF; display:flex; justify-content:space-between; padding:0 44px; font-family:Helvetica,Arial,sans-serif; box-sizing:border-box;">
        <span>ElevatorIQ &mdash; Confidential</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>`,
    });
    return pdf;
  } finally {
    await browser.close();
  }
}

async function generateAndUploadPDF(reportBody, caseId, reviewType, downloadToken) {
  const downloadUrl = downloadToken
    ? `https://elevatoriq.ai/api/reports/download/${downloadToken}`
    : 'https://elevatoriq.ai';
  const pdf = await generatePDF(reportBody, caseId, reviewType, downloadUrl);
  const key = `reports/${caseId}.pdf`;
  await storageService.uploadBuffer(pdf, key, 'application/pdf');
  return { key, buffer: pdf };
}

module.exports = { generatePDF, generateAndUploadPDF, wrapInHTML };
