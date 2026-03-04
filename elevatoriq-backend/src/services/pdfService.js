const puppeteer = require('puppeteer');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const storageService = require('./storageService');
const { BRAND, COLORS, TYPOGRAPHY, logoWordmarkHtml } = require('./reportBranding');

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
      color: { dark: COLORS.ink, light: COLORS.white },
    });
  } catch (e) {
    console.warn('[PDF] QR code generation failed:', e.message);
  }

  return `
    <div class="cover">
      <!-- Dark top band -->
      <div class="cover-header">
        <div class="cover-logo">${logoWordmarkHtml('cover-wordmark')}</div>
        <div class="cover-logo-tag">${escapeHtml(BRAND.tagline)}</div>
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
        <div class="cover-url">${escapeHtml(BRAND.domain)}</div>
      </div>

      <!-- Bottom footer bar -->
      <div class="cover-footer">
        <div class="cover-footer-left">
          <span class="cover-footer-logo">${logoWordmarkHtml('cover-footer-wordmark')}</span>
          <span class="cover-footer-tag">${escapeHtml(BRAND.footerTagline)}</span>
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
  const coverHtml = await buildCoverPage(label, date, downloadUrl || `https://${BRAND.domain}`);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
@import url('${TYPOGRAPHY.googleFontsCss2}');

:root {
  --eiq-ink: ${COLORS.ink};
  --eiq-ink-mid: ${COLORS.inkMid};
  --eiq-accent: ${COLORS.accent};
  --eiq-white: ${COLORS.white};
  --eiq-gray-100: ${COLORS.gray100};
  --eiq-gray-300: ${COLORS.gray300};
  --eiq-gray-400: ${COLORS.gray400};
  --eiq-gray-500: ${COLORS.gray500};
  --eiq-gray-600: ${COLORS.gray600};
  --eiq-risk: ${COLORS.risk};
  --eiq-caution: ${COLORS.caution};
}

/* ══════════ RESET ══════════ */
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: ${TYPOGRAPHY.sans}; font-size: 10.5pt; color: var(--eiq-ink-mid); background: white; line-height: 1.65; }
.brand-wordmark { font-family: ${TYPOGRAPHY.sans}; font-weight: 700; letter-spacing: -0.03em; color: var(--eiq-white); }
.brand-wordmark-accent { color: var(--eiq-accent); }

/* ══════════ COVER PAGE ══════════ */
.cover {
  width: 100%; height: 100vh;
  display: flex; flex-direction: column;
  page-break-after: always;
  background: white;
}
.cover-header {
  background: var(--eiq-ink);
  padding: 40px 52px 28px;
}
.cover-logo {
  font-size: 38pt; font-weight: 800; color: white; letter-spacing: -1.5px; line-height: 1;
}
.cover-logo span { color: var(--eiq-accent); }
.cover-logo-tag {
  font-size: 10pt; color: var(--eiq-gray-500); margin-top: 8px; letter-spacing: 0.04em; font-style: italic;
}
.cover-accent-bar { background: var(--eiq-accent); height: 4px; }

.cover-body {
  flex: 1; display: flex; flex-direction: column; justify-content: center;
  align-items: flex-start; padding: 52px 52px 32px;
}
.cover-report-label {
  font-size: 9pt; font-weight: 700; color: var(--eiq-accent); letter-spacing: 0.18em;
  text-transform: uppercase; margin-bottom: 16px;
}
.cover-report-type {
  font-size: 28pt; font-weight: 800; color: var(--eiq-ink); letter-spacing: -0.8px;
  line-height: 1.15; max-width: 520px; margin-bottom: 18px;
}
.cover-date {
  font-size: 11pt; color: var(--eiq-gray-400); margin-bottom: 40px;
}
.cover-divider {
  width: 60px; height: 3px; background: var(--eiq-accent); margin-bottom: 40px; border-radius: 2px;
}
.cover-trust-row {
  display: flex; gap: 32px;
}
.cover-trust-item { display: flex; align-items: flex-start; gap: 10px; }
.cover-trust-icon {
  width: 26px; height: 26px; background: var(--eiq-accent); border-radius: 50%;
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
.cover-qr-label { font-size: 8.5pt; color: var(--eiq-gray-400); line-height: 1.5; }
.cover-url { font-size: 9pt; color: var(--eiq-gray-300); letter-spacing: 0.04em; }

.cover-footer {
  background: var(--eiq-ink); padding: 16px 52px;
  display: flex; justify-content: space-between; align-items: center;
}
.cover-footer-left { display: flex; align-items: center; gap: 20px; }
.cover-footer-logo { font-size: 14pt; font-weight: 800; color: white; letter-spacing: -0.5px; }
.cover-footer-logo span { color: var(--eiq-accent); }
.cover-footer-tag { font-size: 8pt; color: var(--eiq-gray-500); font-style: italic; }
.cover-footer-right { font-size: 7.5pt; color: var(--eiq-gray-500); }

/* ══════════ REPORT HEADER (pages 2+) ══════════ */
.report-header {
  background: var(--eiq-ink);
  padding: 14px 44px;
  display: flex; justify-content: space-between; align-items: center;
}
.report-header-logo { font-size: 15pt; font-weight: 800; color: white; letter-spacing: -0.5px; }
.report-header-logo span { color: var(--eiq-accent); }
.report-header-right { font-size: 8.5pt; color: var(--eiq-gray-500); text-align: right; line-height: 1.6; }
.report-accent { background: var(--eiq-accent); height: 3px; }

/* ══════════ CONTENT ══════════ */
.content { padding: 32px 48px 48px; }

p { margin: 6px 0; color: var(--eiq-ink-mid); }

/* Section block */
.section-block {
  display: flex; align-items: flex-start; gap: 14px;
  margin: 34px 0 12px 0;
  padding-bottom: 10px;
  border-bottom: 2px solid var(--eiq-ink);
  page-break-after: avoid;
}
.section-number {
  font-size: 22pt; font-weight: 800; color: var(--eiq-accent);
  line-height: 1; flex-shrink: 0; letter-spacing: -1px;
  margin-top: -4px;
}
h2.section-title {
  font-size: 14pt; font-weight: 800; color: var(--eiq-ink);
  letter-spacing: -0.3px; line-height: 1.2;
  text-decoration: underline; text-decoration-color: var(--eiq-accent);
  text-underline-offset: 4px;
}

h3.sub-heading {
  font-size: 9pt; font-weight: 700; color: white;
  background: var(--eiq-ink);
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
li { margin: 5px 0; color: var(--eiq-ink-mid); }
li strong { color: var(--eiq-ink); }

.gap { height: 8px; }

/* ── Risk blocks ── */
.risk-block {
  display: flex; align-items: flex-start; gap: 12px;
  border-left: 4px solid; padding: 12px 16px;
  margin: 14px 0; border-radius: 0 6px 6px 0;
  page-break-inside: avoid;
}
.risk-high   { border-color: var(--eiq-risk); background: #fef2f2; }
.risk-med    { border-color: var(--eiq-caution); background: #fffbeb; }
.risk-low    { border-color: var(--eiq-gray-400); background: #f9fafb; }

.risk-badge {
  font-size: 7.5pt; font-weight: 800; padding: 3px 9px;
  border-radius: 3px; color: white; letter-spacing: 0.08em;
  text-transform: uppercase; white-space: nowrap; flex-shrink: 0; margin-top: 1px;
}
.risk-high .risk-badge { background: var(--eiq-risk); }
.risk-med  .risk-badge { background: var(--eiq-caution); }
.risk-low  .risk-badge { background: var(--eiq-gray-400); }
.risk-title { font-size: 10.5pt; font-weight: 700; color: #111827; }

.sub-label { margin: 4px 0 4px 18px; color: #374151; font-size: 10pt; }
.sub-key { font-weight: 700; color: #111827; }

/* ══════════ REPORT FOOTER ══════════ */
.report-footer {
  background: var(--eiq-ink); margin-top: 48px;
  padding: 18px 44px;
  display: flex; justify-content: space-between; align-items: center;
}
.footer-logo { font-size: 14pt; font-weight: 800; color: white; letter-spacing: -0.5px; }
.footer-logo span { color: var(--eiq-accent); }
.footer-tagline { font-size: 8pt; color: var(--eiq-gray-500); font-style: italic; margin-top: 3px; }
.footer-right { text-align: right; font-size: 8pt; color: var(--eiq-gray-500); line-height: 1.8; }
.footer-disclaimer {
  font-size: 7pt; color: var(--eiq-gray-400); padding: 10px 44px;
  border-top: 1px solid var(--eiq-ink-mid); background: var(--eiq-ink); text-align: center;
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
  <div class="report-header-logo">${logoWordmarkHtml('report-header-wordmark')}</div>
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
    <div class="footer-logo">${logoWordmarkHtml('report-footer-wordmark')}</div>
    <div class="footer-tagline">${escapeHtml(BRAND.footerTagline)}</div>
  </div>
  <div class="footer-right">
    ${escapeHtml(BRAND.domain)} &nbsp;·&nbsp; Independent Elevator Intelligence<br/>
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

function stripForPlainText(raw) {
  return String(raw || '')
    .replace(/^═{6,}.*$/gm, '')
    .replace(/^SECTION\s+\d+\s*[—-]\s*/gm, '\nSECTION: ')
    .replace(/^\[(HIGH|MEDIUM|LOW)\]\s*/gm, '$1: ')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .trim();
}

function generateFallbackPDF(reportBody, reviewType, downloadUrl) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const label = REVIEW_LABELS[reviewType] || reviewType;
      doc.fontSize(20).text(BRAND.name, { align: 'left' });
      doc.moveDown(0.3);
      doc.fontSize(11).fillColor('#666666').text(BRAND.tagline);
      doc.moveDown();
      doc.fillColor('#000000').fontSize(16).text('Independent Analysis Report');
      doc.fontSize(12).text(label);
      doc.fontSize(10).fillColor('#666666').text(new Date().toLocaleString());
      doc.moveDown();
      doc.fillColor('#000000').fontSize(11).text('Secure download URL:');
      doc.fillColor('#1f2937').fontSize(10).text(downloadUrl);
      doc.moveDown();
      doc.fillColor('#000000').fontSize(11).text('Report Body');
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor('#111111').text(stripForPlainText(reportBody), {
        width: 500,
        align: 'left',
      });
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

async function generatePDF(reportBody, caseId, reviewType, downloadUrl) {
  const html = await wrapInHTML(reportBody, reviewType, downloadUrl);
  let browser;
  try {
    browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      timeout: 60000,
      protocolTimeout: 180000,
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
    return await page.pdf({
      format: 'Letter',
      margin: { top: '0.4in', bottom: '0.6in', left: '0.4in', right: '0.4in' },
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `<div style="width:100%; font-size:7pt; color:${COLORS.gray300}; display:flex; justify-content:space-between; padding:0 44px; font-family:${TYPOGRAPHY.sans}; box-sizing:border-box;">
        <span>${BRAND.name} &mdash; Confidential</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>`,
    });
  } catch (err) {
    console.warn('[PDF] Puppeteer unavailable; using fallback renderer:', err.message);
    return generateFallbackPDF(reportBody, reviewType, downloadUrl);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function generateAndUploadPDF(reportBody, caseId, reviewType, downloadToken) {
  const downloadUrl = downloadToken
    ? `https://${BRAND.domain}/api/reports/download/${downloadToken}`
    : `https://${BRAND.domain}`;
  const pdf = await generatePDF(reportBody, caseId, reviewType, downloadUrl);
  const key = `reports/${caseId}.pdf`;
  await storageService.uploadBuffer(pdf, key, 'application/pdf');
  return { key, buffer: pdf };
}

module.exports = { generatePDF, generateAndUploadPDF, wrapInHTML };
