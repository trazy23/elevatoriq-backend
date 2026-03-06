let puppeteer;
let chromium;
try {
  chromium = require('@sparticuz/chromium');
  puppeteer = require('puppeteer-core');
} catch {
  puppeteer = require('puppeteer');
  chromium = null;
}
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
            <div class="cover-trust-icon"><svg viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.75 9L7.5 12.75L14.25 5.25" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
            <div class="cover-trust-text">Independent<br/>Analysis</div>
          </div>
          <div class="cover-trust-item">
            <div class="cover-trust-icon"><svg viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.75 9L7.5 12.75L14.25 5.25" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
            <div class="cover-trust-text">Confidential<br/>Report</div>
          </div>
          <div class="cover-trust-item">
            <div class="cover-trust-icon"><svg viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.75 9L7.5 12.75L14.25 5.25" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
            <div class="cover-trust-text">No Vendor<br/>Affiliations</div>
          </div>
          <div class="cover-trust-item">
            <div class="cover-trust-icon"><svg viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.75 9L7.5 12.75L14.25 5.25" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
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
  --eiq-ink: #0F1112;
  --eiq-ink-mid: #111214;
  --eiq-accent: #00B77A;
  --eiq-white: #FFFFFF;
  --eiq-body: #33363A;
  --eiq-muted: #6F7478;
  --eiq-light-gray: #BFC6CB;
  --eiq-risk: #E85D5D;
  --eiq-caution: #E8A840;
}

/* ══════════ RESET ══════════ */
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 10.5pt; color: var(--eiq-body); background: white; line-height: 1.65; }
.brand-wordmark { font-family: 'Montserrat', Helvetica, Arial, sans-serif; font-weight: 800; letter-spacing: -0.02em; color: var(--eiq-white); }
.brand-wordmark-accent { color: var(--eiq-accent); }

/* ══════════ COVER PAGE ══════════ */
.cover {
  width: 100%; min-height: 100vh;
  display: flex; flex-direction: column;
  page-break-after: always;
  background: white;
}
.cover-header {
  background: #0F1112;
  height: 96px; min-height: 96px;
  padding: 0 72px;
  display: flex; flex-direction: column; justify-content: center;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.cover-logo {
  font-family: 'Montserrat', Helvetica, Arial, sans-serif;
  font-size: 44px; font-weight: 800; color: white;
  letter-spacing: -0.02em; line-height: 1;
}
.cover-logo-tag {
  font-size: 14px; color: rgba(255,255,255,0.55); margin-top: 4px; font-style: italic;
}
.cover-accent-bar {
  background: #00B77A; height: 4px;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}

.cover-body {
  flex: 1; display: flex; flex-direction: column;
  align-items: flex-start; padding: 0 72px 32px;
}
.cover-report-label {
  font-size: 12px; font-weight: 700; color: #00B77A; letter-spacing: 0.18em;
  text-transform: uppercase; margin-top: 56px;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.cover-report-type {
  font-family: 'Montserrat', Helvetica, Arial, sans-serif;
  font-size: 48px; font-weight: 700; color: #111214;
  line-height: 1.1; max-width: 580px; margin-top: 14px;
}
.cover-date {
  font-size: 14px; color: #6F7478; margin-top: 14px;
}
.cover-divider {
  width: 58px; height: 4px; background: #00B77A;
  margin-top: 18px; margin-bottom: 34px;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.cover-trust-row {
  display: flex; gap: 28px; flex-wrap: wrap;
}
.cover-trust-item { display: flex; align-items: center; gap: 10px; }
.cover-trust-icon {
  width: 36px; height: 36px; background: #00B77A; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.cover-trust-icon svg { width: 18px; height: 18px; }
.cover-trust-text {
  font-size: 14px; color: #333637; line-height: 1.4; font-weight: 500;
}

.cover-qr-section {
  padding: 0 72px 28px;
  display: flex; align-items: flex-end; justify-content: space-between;
}
.cover-qr-block { display: flex; align-items: center; gap: 14px; }
.cover-qr-img { width: 90px; height: 90px; border: 1px solid #E5E7EB; border-radius: 6px; padding: 4px; }
.cover-qr-label { font-size: 12px; color: #6F7478; line-height: 1.5; }
.cover-url { font-size: 13px; color: #BFC6CB; letter-spacing: 0.02em; }

.cover-footer {
  background: #0F1112; height: 64px; min-height: 64px;
  padding: 0 72px;
  display: flex; justify-content: space-between; align-items: center;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.cover-footer-left { display: flex; align-items: center; gap: 16px; }
.cover-footer-logo {
  font-family: 'Montserrat', Helvetica, Arial, sans-serif;
  font-size: 15pt; font-weight: 800; color: white; letter-spacing: -0.02em;
}
.cover-footer-logo .brand-wordmark-accent { color: #00B77A; }
.cover-footer-tag { font-size: 8pt; color: #6F7478; font-style: italic; }
.cover-footer-right { font-size: 7.5pt; color: #6F7478; }

/* ══════════ REPORT HEADER (pages 2+) ══════════ */
.report-header {
  background: #0F1112;
  padding: 14px 72px;
  display: flex; justify-content: space-between; align-items: center;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.report-header-logo {
  font-family: 'Montserrat', Helvetica, Arial, sans-serif;
  font-size: 15pt; font-weight: 800; color: white; letter-spacing: -0.02em;
}
.report-header-logo .brand-wordmark-accent { color: #00B77A; }
.report-header-right { font-size: 8.5pt; color: #6F7478; text-align: right; line-height: 1.6; }
.report-accent {
  background: #00B77A; height: 4px;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}

/* ══════════ CONTENT ══════════ */
.content { padding: 32px 72px 48px; }

p { margin: 6px 0; color: var(--eiq-body); font-family: 'Inter', Helvetica, Arial, sans-serif; }

/* Section block */
.section-block {
  display: flex; align-items: flex-start; gap: 14px;
  margin: 34px 0 12px 0;
  padding-bottom: 10px;
  border-bottom: 2px solid #111214;
  page-break-after: avoid;
  page-break-inside: avoid;
}
.section-number {
  font-family: 'Montserrat', Helvetica, Arial, sans-serif;
  font-size: 24pt; font-weight: 800; color: #00B77A;
  line-height: 1; flex-shrink: 0; letter-spacing: -1px;
  margin-top: -4px;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
h2.section-title {
  font-family: 'Montserrat', Helvetica, Arial, sans-serif;
  font-size: 14pt; font-weight: 700; color: #111214;
  letter-spacing: -0.3px; line-height: 1.2;
}

h3.sub-heading {
  font-size: 9pt; font-weight: 700; color: white;
  background: #111214;
  padding: 5px 12px;
  margin: 20px 0 8px 0;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  border-radius: 12px;
  display: inline-block;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}

.label-line {
  font-weight: 700; color: #111214; margin: 12px 0 4px 0; font-size: 10.5pt;
  border-bottom: 1px solid #E5E7EB; padding-bottom: 3px;
}

ul { padding-left: 22px; margin: 8px 0; list-style: none; }
li {
  margin: 5px 0; color: var(--eiq-body);
  padding-left: 16px; position: relative;
}
li::before {
  content: '●'; color: #00B77A; position: absolute; left: 0; font-size: 8pt;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
li strong { color: #111214; }

.gap { height: 8px; }

/* ── Risk blocks ── */
.risk-block {
  display: flex; align-items: flex-start; gap: 12px;
  border-left: 4px solid; padding: 12px 16px;
  margin: 14px 0; border-radius: 0 6px 6px 0;
  page-break-inside: avoid;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.risk-high   { border-color: #E85D5D; background: #fef2f2; }
.risk-med    { border-color: #E8A840; background: #fffbeb; }
.risk-low    { border-color: #6F7478; background: #f9fafb; }

.risk-badge {
  font-size: 7.5pt; font-weight: 800; padding: 3px 9px;
  border-radius: 9999px; color: white; letter-spacing: 0.08em;
  text-transform: uppercase; white-space: nowrap; flex-shrink: 0; margin-top: 1px;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.risk-high .risk-badge { background: #E85D5D; }
.risk-med  .risk-badge { background: #E8A840; }
.risk-low  .risk-badge { background: #6F7478; }
.risk-title { font-size: 10.5pt; font-weight: 700; color: #111214; }

.sub-label { margin: 4px 0 4px 18px; color: var(--eiq-body); font-size: 10pt; }
.sub-key { font-weight: 700; color: #111214; }

/* ══════════ REPORT FOOTER ══════════ */
.report-footer {
  background: #0F1112; margin-top: 48px;
  padding: 18px 72px;
  display: flex; justify-content: space-between; align-items: center;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.footer-logo {
  font-family: 'Montserrat', Helvetica, Arial, sans-serif;
  font-size: 14pt; font-weight: 800; color: white; letter-spacing: -0.02em;
}
.footer-logo .brand-wordmark-accent { color: #00B77A; }
.footer-tagline { font-size: 8pt; color: #6F7478; font-style: italic; margin-top: 3px; }
.footer-right { text-align: right; font-size: 8pt; color: #6F7478; line-height: 1.8; }
.footer-disclaimer {
  font-size: 7pt; color: #6F7478; padding: 10px 72px;
  border-top: 1px solid #1A1F2A; background: #0F1112; text-align: center;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}

/* ══════════ PRINT ══════════ */
@media print {
  .section-block { page-break-after: avoid; }
  .risk-block    { page-break-inside: avoid; }
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

async function getBrowserArgs() {
  if (chromium) {
    return {
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    };
  }
  return {
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  };
}

async function generatePDF(reportBody, caseId, reviewType, downloadUrl) {
  const html = await wrapInHTML(reportBody, reviewType, downloadUrl);
  let browser;
  try {
    const launchArgs = await getBrowserArgs();
    browser = await puppeteer.launch({
      ...launchArgs,
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
      footerTemplate: `<div style="width:100%; font-size:7pt; color:#BFC6CB; display:flex; justify-content:space-between; padding:0 72px; font-family:'Inter',Helvetica,Arial,sans-serif; box-sizing:border-box;">
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
