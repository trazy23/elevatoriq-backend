/**
 * ElevatorIQ — Scope Generator PDF Service
 * Generates branded Bid Standardization Framework PDFs
 * Reuses the Puppeteer pipeline from pdfService.js
 */

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
const { BRAND, COLORS, TYPOGRAPHY, logoWordmarkHtml } = require('./reportBranding');

// ─── Work type display labels ─────────────────────────────────────────────────

const WORK_TYPE_LABELS = {
  maintenance:      'Maintenance Contract\nBid Framework',
  repair:           'Repair Work\nBid Framework',
  modernization:    'Modernization\nBid Framework',
  rfi_document:     'Assessment\nRequest for Information',
  modernization_readiness_guide: 'Modernization\nReadiness Guide',
};

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Body formatter — parse structured plain text into HTML ──────────────────

function formatScopeBody(raw) {
  const lines = raw.split('\n');
  let html = '';
  let inList = false;
  let sectionCount = 0;

  function closeList() {
    if (inList) { html += '</ul>'; inList = false; }
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip decoration lines (═══ or ---)
    if (/^[═─=\-]{6,}$/.test(trimmed)) {
      closeList();
      continue;
    }

    // Section header: SECTION N — TITLE or SECTION N: TITLE
    if (/^SECTION\s+\d+\s*[—:\-]/.test(trimmed)) {
      closeList();
      sectionCount++;
      const title = trimmed.replace(/^SECTION\s+\d+\s*[—:\-]\s*/i, '');
      const num = String(sectionCount).padStart(2, '0');
      html += `
        <div class="section-block">
          <div class="section-number">${num}</div>
          <h2 class="section-title">${escapeHtml(title)}</h2>
        </div>`;
      continue;
    }

    // Checkbox lines: □ item or [ ] item
    if (/^[□\[\]✓✗]\s/.test(trimmed) || /^\[ \]/.test(trimmed)) {
      if (!inList) { html += '<ul class="checklist">'; inList = true; }
      const content = trimmed.replace(/^[□✓✗]\s+/, '').replace(/^\[ \]\s*/, '').replace(/^\[x\]\s*/i, '');
      const colonIdx = content.indexOf(':');
      if (colonIdx > 0 && colonIdx < 50) {
        const key = content.substring(0, colonIdx);
        const val = content.substring(colonIdx + 1);
        html += `<li class="check-item"><span class="check-box">□</span><span><strong>${escapeHtml(key)}:</strong>${escapeHtml(val)}</span></li>`;
      } else {
        html += `<li class="check-item"><span class="check-box">□</span><span>${escapeHtml(content)}</span></li>`;
      }
      continue;
    }

    // Bullet points: • or -
    if (/^[•\-\*]\s+/.test(trimmed)) {
      if (!inList) { html += '<ul>'; inList = true; }
      const content = trimmed.replace(/^[•\-\*]\s+/, '');
      const colonIdx = content.indexOf(':');
      if (colonIdx > 0 && colonIdx < 50) {
        const key = content.substring(0, colonIdx);
        const val = content.substring(colonIdx + 1);
        html += `<li><strong>${escapeHtml(key)}:</strong>${escapeHtml(val)}</li>`;
      } else {
        html += `<li>${escapeHtml(content)}</li>`;
      }
      continue;
    }

    closeList();

    // Empty line
    if (trimmed === '') {
      html += '<div class="gap"></div>';
      continue;
    }

    // Flag callout blocks — lines starting with known flag keywords
    const flagMatch = trimmed.match(/^(NO CONSULTANT FLAG|PROPRIETARY COMPONENT FLAG|PREVAILING WAGE FLAG|PHASING FLAG|RESPONSE TIME PREMIUM FLAG|SHUTDOWN \+ CONTRACT FLAG|NOTE:):\s*(.*)/i);
    if (flagMatch) {
      html += `
        <div class="flag-block">
          <div class="flag-label">${escapeHtml(flagMatch[1])}</div>
          <div class="flag-body">${escapeHtml(flagMatch[2])}</div>
        </div>`;
      continue;
    }

    // Document header block: ELEVATOR BID STANDARDIZATION FRAMEWORK
    if (/^ELEVATOR (BID|ASSESSMENT|MODERNIZATION)/i.test(trimmed)) {
      html += `<h1 class="doc-title">${escapeHtml(trimmed)}</h1>`;
      continue;
    }

    // ALL-CAPS sub-headers
    if (
      trimmed === trimmed.toUpperCase() &&
      trimmed.length > 4 &&
      trimmed.length < 90 &&
      /[A-Z]{3}/.test(trimmed) &&
      !trimmed.startsWith('[') &&
      !trimmed.startsWith('(')
    ) {
      html += `<h3 class="sub-heading">${escapeHtml(trimmed)}</h3>`;
      continue;
    }

    // Label lines ending with colon
    if (trimmed.endsWith(':') && trimmed.length < 80 && !trimmed.includes('.')) {
      html += `<p class="label-line">${escapeHtml(trimmed)}</p>`;
      continue;
    }

    // Italic / note lines
    if (trimmed.startsWith('*') && trimmed.endsWith('*') && trimmed.length > 4) {
      html += `<p class="note-line">${escapeHtml(trimmed.slice(1, -1))}</p>`;
      continue;
    }

    // Normal paragraph
    const withBold = escapeHtml(trimmed).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html += `<p>${withBold}</p>`;
  }

  closeList();
  return html;
}

// ─── Cover page ───────────────────────────────────────────────────────────────

function buildScopeCoverPage(workType, outputPath, frameworkId, property, date) {
  const typeLabel = WORK_TYPE_LABELS[outputPath] || WORK_TYPE_LABELS[workType] || 'Bid Standardization Framework';
  const [line1, line2] = typeLabel.split('\n');

  return `
    <div class="cover">
      <div class="cover-header">
        <div class="cover-logo">${logoWordmarkHtml('cover-wordmark')}</div>
        <div class="cover-logo-tag">Vendor-Neutral Elevator Intelligence</div>
      </div>
      <div class="cover-accent-bar"></div>

      <div class="cover-body">
        <div class="cover-report-label">Procurement Planning Document</div>
        <div class="cover-report-type">${escapeHtml(line1)}<br/><span style="color:#00B77A">${escapeHtml(line2 || '')}</span></div>
        <div class="cover-meta">
          <div class="cover-meta-row"><span class="cover-meta-key">Framework ID</span><span class="cover-meta-val">${escapeHtml(frameworkId)}</span></div>
          <div class="cover-meta-row"><span class="cover-meta-key">Property</span><span class="cover-meta-val">${escapeHtml(property || '—')}</span></div>
          <div class="cover-meta-row"><span class="cover-meta-key">Generated</span><span class="cover-meta-val">${escapeHtml(date)}</span></div>
          <div class="cover-meta-row"><span class="cover-meta-key">Work Type</span><span class="cover-meta-val">${escapeHtml(workType.charAt(0).toUpperCase() + workType.slice(1))}</span></div>
        </div>

        <div class="cover-divider"></div>

        <div class="cover-trust-row">
          <div class="cover-trust-item">
            <div class="cover-trust-icon"><svg viewBox="0 0 18 18" fill="none"><path d="M3.75 9L7.5 12.75L14.25 5.25" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
            <div class="cover-trust-text">Owner Intent<br/>Document</div>
          </div>
          <div class="cover-trust-item">
            <div class="cover-trust-icon"><svg viewBox="0 0 18 18" fill="none"><path d="M3.75 9L7.5 12.75L14.25 5.25" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
            <div class="cover-trust-text">Bid<br/>Standardization</div>
          </div>
          <div class="cover-trust-item">
            <div class="cover-trust-icon"><svg viewBox="0 0 18 18" fill="none"><path d="M3.75 9L7.5 12.75L14.25 5.25" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
            <div class="cover-trust-text">No Vendor<br/>Affiliations</div>
          </div>
          <div class="cover-trust-item">
            <div class="cover-trust-icon"><svg viewBox="0 0 18 18" fill="none"><path d="M3.75 9L7.5 12.75L14.25 5.25" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
            <div class="cover-trust-text">Procurement<br/>Intelligence</div>
          </div>
        </div>

        <div class="cover-notice">
          This document is a procurement planning tool — not a construction specification or engineering design.
          Final component selection, field verification, and code compliance are the responsibility of the contractor.
        </div>
      </div>

      <div class="cover-footer">
        <div class="cover-footer-left">
          <span class="cover-footer-logo">${logoWordmarkHtml('cover-footer-wordmark')}</span>
          <span class="cover-footer-tag">"Standardize the ask. Compare real bids."</span>
        </div>
        <div class="cover-footer-right">elevatoriq.ai &nbsp;·&nbsp; Independent Elevator Intelligence</div>
      </div>
    </div>
  `;
}

// ─── Full HTML document ───────────────────────────────────────────────────────

function wrapScopeInHTML(documentText, workType, outputPath, frameworkId, property) {
  const date  = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const bodyHtml   = formatScopeBody(documentText);
  const coverHtml  = buildScopeCoverPage(workType, outputPath, frameworkId, property, date);
  const typeLabel  = (WORK_TYPE_LABELS[outputPath] || 'Bid Framework').replace('\n', ' ');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
@import url('${TYPOGRAPHY.googleFontsCss2}');

:root {
  --eiq-ink: #0F1112;
  --eiq-accent: #00B77A;
  --eiq-body: #33363A;
  --eiq-muted: #6F7478;
  --eiq-light: #BFC6CB;
  --eiq-white: #FFFFFF;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Inter', Helvetica, Arial, sans-serif; font-size: 10.5pt; color: var(--eiq-body); background: white; line-height: 1.65; }
.brand-wordmark { font-family: 'Montserrat', Helvetica, Arial, sans-serif; font-weight: 800; letter-spacing: -0.02em; color: var(--eiq-white); }
.brand-wordmark-accent { color: var(--eiq-accent); }

/* ══ COVER ══ */
.cover { width: 100%; min-height: 100vh; display: flex; flex-direction: column; page-break-after: always; background: white; }
.cover-header {
  background: #0F1112; height: 96px; min-height: 96px;
  padding: 0 72px; display: flex; flex-direction: column; justify-content: center;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.cover-logo { font-family: 'Montserrat', Helvetica, Arial, sans-serif; font-size: 44px; font-weight: 800; color: white; letter-spacing: -0.02em; line-height: 1; }
.cover-logo-tag { font-size: 14px; color: rgba(255,255,255,0.5); margin-top: 4px; font-style: italic; }
.cover-accent-bar { background: #00B77A; height: 4px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

.cover-body { flex: 1; display: flex; flex-direction: column; align-items: flex-start; padding: 0 72px 32px; }
.cover-report-label {
  font-size: 11px; font-weight: 700; color: #00B77A; letter-spacing: 0.18em;
  text-transform: uppercase; margin-top: 48px;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.cover-report-type {
  font-family: 'Montserrat', Helvetica, Arial, sans-serif;
  font-size: 42px; font-weight: 700; color: #111214;
  line-height: 1.1; max-width: 560px; margin-top: 12px;
}

.cover-meta { margin-top: 24px; display: flex; flex-direction: column; gap: 6px; }
.cover-meta-row { display: flex; gap: 16px; font-size: 12px; }
.cover-meta-key { color: #6F7478; width: 100px; font-weight: 600; flex-shrink: 0; }
.cover-meta-val { color: #111214; font-weight: 500; }

.cover-divider { width: 58px; height: 4px; background: #00B77A; margin: 24px 0 28px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

.cover-trust-row { display: flex; gap: 24px; flex-wrap: wrap; }
.cover-trust-item { display: flex; align-items: center; gap: 10px; }
.cover-trust-icon {
  width: 34px; height: 34px; background: #00B77A; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.cover-trust-icon svg { width: 16px; height: 16px; }
.cover-trust-text { font-size: 13px; color: #333637; line-height: 1.4; font-weight: 500; }

.cover-notice {
  margin-top: 28px; font-size: 10px; color: #6F7478;
  max-width: 480px; line-height: 1.6;
  border-left: 3px solid #E5E7EB; padding-left: 12px;
  font-style: italic;
}

.cover-footer {
  background: #0F1112; height: 60px; min-height: 60px; padding: 0 72px;
  display: flex; justify-content: space-between; align-items: center;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.cover-footer-left { display: flex; align-items: center; gap: 16px; }
.cover-footer-logo { font-family: 'Montserrat', Helvetica, Arial, sans-serif; font-size: 14pt; font-weight: 800; color: white; letter-spacing: -0.02em; }
.cover-footer-logo .brand-wordmark-accent { color: #00B77A; }
.cover-footer-tag { font-size: 8pt; color: #6F7478; font-style: italic; }
.cover-footer-right { font-size: 7.5pt; color: #6F7478; }

/* ══ REPORT HEADER (page 2+) ══ */
.report-header {
  background: #0F1112; padding: 14px 72px;
  display: flex; justify-content: space-between; align-items: center;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.report-header-logo { font-family: 'Montserrat', Helvetica, Arial, sans-serif; font-size: 14pt; font-weight: 800; color: white; letter-spacing: -0.02em; }
.report-header-logo .brand-wordmark-accent { color: #00B77A; }
.report-header-right { font-size: 8.5pt; color: #6F7478; text-align: right; line-height: 1.6; }
.report-accent { background: #00B77A; height: 4px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

/* ══ CONTENT ══ */
.content { padding: 32px 72px 48px; }

p { margin: 6px 0; color: var(--eiq-body); }

h1.doc-title {
  font-family: 'Montserrat', Helvetica, Arial, sans-serif;
  font-size: 16pt; font-weight: 700; color: #111214;
  margin: 0 0 24px 0; letter-spacing: -0.3px;
  padding-bottom: 12px; border-bottom: 2px solid #00B77A;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}

.section-block {
  display: flex; align-items: flex-start; gap: 14px;
  margin: 32px 0 10px 0; padding-bottom: 10px;
  border-bottom: 2px solid #111214;
  page-break-after: avoid; page-break-inside: avoid;
}
.section-number {
  font-family: 'Montserrat', Helvetica, Arial, sans-serif;
  font-size: 22pt; font-weight: 800; color: #00B77A;
  line-height: 1; flex-shrink: 0; letter-spacing: -1px; margin-top: -2px;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
h2.section-title { font-family: 'Montserrat', Helvetica, Arial, sans-serif; font-size: 13pt; font-weight: 700; color: #111214; letter-spacing: -0.3px; line-height: 1.2; }

h3.sub-heading {
  font-size: 8.5pt; font-weight: 700; color: white;
  background: #111214; padding: 5px 12px; margin: 18px 0 8px 0;
  letter-spacing: 0.1em; text-transform: uppercase; border-radius: 12px;
  display: inline-block;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}

.label-line { font-weight: 700; color: #111214; margin: 12px 0 4px 0; font-size: 10.5pt; border-bottom: 1px solid #E5E7EB; padding-bottom: 3px; }

ul { padding-left: 22px; margin: 8px 0; list-style: none; }
li { margin: 5px 0; color: var(--eiq-body); padding-left: 16px; position: relative; }
li::before { content: '●'; color: #00B77A; position: absolute; left: 0; font-size: 8pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
li strong { color: #111214; }

ul.checklist { padding-left: 0; }
li.check-item {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 5px 10px; margin: 4px 0;
  border: 1px solid #E5E7EB; border-radius: 5px;
  background: #FAFBFC;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
li.check-item::before { display: none; }
.check-box { color: #00B77A; font-size: 13pt; line-height: 1; flex-shrink: 0; margin-top: -1px; }

/* Flag callout blocks */
.flag-block {
  border-left: 4px solid #E8A840; background: #FFFBEB;
  padding: 12px 16px; margin: 14px 0; border-radius: 0 6px 6px 0;
  page-break-inside: avoid;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.flag-label { font-size: 8pt; font-weight: 800; color: #B45309; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 5px; }
.flag-body { font-size: 10pt; color: #78350F; line-height: 1.6; }

.note-line { font-style: italic; color: var(--eiq-muted); font-size: 9.5pt; margin: 6px 0; }
.gap { height: 8px; }

/* ══ FOOTER ══ */
.report-footer {
  background: #0F1112; margin-top: 48px; padding: 18px 72px;
  display: flex; justify-content: space-between; align-items: center;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.footer-logo { font-family: 'Montserrat', Helvetica, Arial, sans-serif; font-size: 13pt; font-weight: 800; color: white; letter-spacing: -0.02em; }
.footer-logo .brand-wordmark-accent { color: #00B77A; }
.footer-tagline { font-size: 8pt; color: #6F7478; font-style: italic; margin-top: 3px; }
.footer-right { text-align: right; font-size: 8pt; color: #6F7478; line-height: 1.8; }
.footer-disclaimer {
  font-size: 7pt; color: #6F7478; padding: 10px 72px;
  border-top: 1px solid #1A1F2A; background: #0F1112; text-align: center;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}

@media print {
  .section-block { page-break-after: avoid; }
  .flag-block { page-break-inside: avoid; }
  li.check-item { page-break-inside: avoid; }
}
</style>
</head>
<body>

${coverHtml}

<div class="report-header">
  <div class="report-header-logo">${logoWordmarkHtml('report-header-wordmark')}</div>
  <div class="report-header-right">
    ${escapeHtml(typeLabel)}<br/>
    Framework ID: ${escapeHtml(frameworkId)} &nbsp;·&nbsp; ${escapeHtml(date)}
  </div>
</div>
<div class="report-accent"></div>

<div class="content">
  ${bodyHtml}
</div>

<div class="report-footer">
  <div>
    <div class="footer-logo">${logoWordmarkHtml('report-footer-wordmark')}</div>
    <div class="footer-tagline">"Standardize the ask. Compare real bids."</div>
  </div>
  <div class="footer-right">
    elevatoriq.ai &nbsp;·&nbsp; Independent Elevator Intelligence<br/>
    Framework ID: ${escapeHtml(frameworkId)}
  </div>
</div>
<div class="footer-disclaimer">
  This document is a preliminary procurement planning tool and does not constitute a construction specification or engineering design.
  ElevatorIQ is a decision-support platform. Scope must be field-verified by qualified professionals.
  ElevatorIQ assumes no responsibility for project outcomes, contractor selection, or work quality.
</div>

</body>
</html>`;
}

// ─── PDF generation ───────────────────────────────────────────────────────────

function generateFallbackScopePDF(documentText, frameworkId, workType) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'LETTER', margin: 60 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(22).font('Helvetica-Bold').fillColor('#0F1112').text('ElevatorIQ', { align: 'left' });
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica').fillColor('#00B77A').text('BID STANDARDIZATION FRAMEWORK');
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor('#6F7478').text(`Framework ID: ${frameworkId}`);
      doc.fontSize(9).text(`Work Type: ${workType}`);
      doc.fontSize(9).text(`Generated: ${new Date().toLocaleDateString()}`);
      doc.moveDown();
      doc.moveTo(60, doc.y).lineTo(550, doc.y).stroke('#00B77A');
      doc.moveDown();

      // Body
      doc.fontSize(9.5).font('Helvetica').fillColor('#33363A').text(
        documentText.replace(/[□□]/g, '[ ]'),
        { width: 490, align: 'left' }
      );

      // Footer
      doc.moveDown(2);
      doc.fontSize(7.5).fillColor('#6F7478').text(
        'This document is a preliminary procurement planning tool and does not constitute a construction specification or engineering design. ElevatorIQ assumes no responsibility for project outcomes.',
        { align: 'center', width: 490 }
      );

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
  return { args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] };
}

/**
 * Generate a branded PDF buffer for a scope generator output.
 * @param {string} documentText  - The raw Claude-generated document text
 * @param {string} workType      - e.g. 'maintenance', 'repair', 'modernization'
 * @param {string} outputPath    - e.g. 'bid_framework', 'rfi_document'
 * @param {string} frameworkId   - e.g. 'EIQ-2026-0042'
 * @param {string} property      - Building name/address for cover page
 * @returns {Promise<Buffer>}
 */
async function generateScopePDF(documentText, workType, outputPath, frameworkId, property) {
  const html = wrapScopeInHTML(documentText, workType, outputPath, frameworkId, property);
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
      footerTemplate: `<div style="width:100%;font-size:7pt;color:#BFC6CB;display:flex;justify-content:space-between;padding:0 72px;font-family:'Inter',Helvetica,Arial,sans-serif;box-sizing:border-box;">
        <span>ElevatorIQ &mdash; Bid Framework &mdash; Confidential</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>`,
    });
  } catch (err) {
    console.warn('[ScopePDF] Puppeteer failed, using fallback:', err.message);
    return generateFallbackScopePDF(documentText, frameworkId, workType);
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { generateScopePDF, wrapScopeInHTML };
