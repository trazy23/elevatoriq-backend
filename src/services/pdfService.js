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
  // Single-doc bid reviews
  repair_bid:                  'Repair Bid Review',
  maintenance_bid:             'Maintenance Contract Review',
  modernization_bid:           'Modernization Bid Review',
  new_construction_bid:        'New Construction Bid Review',
  // Comparisons
  bid_comparison:              'New Construction Bid Comparison',
  modernization_comparison:    'Modernization Bid Comparison',
  maintenance_bid_comparison:  'Maintenance Bid Comparison',
  single_modernization:        'Single Bid Review',
  // Contract & invoice
  invoice_review:              'Invoice & Billing Review',
  contract_coverage:           'Contract Coverage Analysis',
};

/** Fallback: snake_case → Title Case for any unmapped type */
function formatReviewLabel(reviewType) {
  if (!reviewType) return 'Document Analysis';
  return REVIEW_LABELS[reviewType] ||
    reviewType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Text → HTML formatter ────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Escape HTML then convert **bold** markdown to <strong> tags */
function inlineFormat(str) {
  return escapeHtml(str).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

/** Strip internal annotation tags like `[Flag: ...]` and `[VALIDATE — ...]` */
function stripAnnotations(str) {
  return str
    .replace(/`\[[^\]]*\]`/g, '')   // `[Flag: ...]`, `[VALIDATE — ...]`, etc.
    .replace(/\s{2,}/g, ' ')         // collapse extra whitespace left behind
    .trim();
}

/** Determine status chip class from status text */
function scopeStatusClass(status) {
  const s = status.toLowerCase();
  if (s.includes('not addressed') || s.includes('not stated') || s.includes('not included')) return 'scope-missing';
  if (s.includes('ambiguous') || s.includes('implied') || s.includes('partial')) return 'scope-partial';
  if (s.includes('included') || s.includes('explicitly')) return 'scope-included';
  return 'scope-neutral';
}

/** Render a collected pipe-table rows array as an HTML scope table */
function renderPipeTable(rows) {
  // rows = array of string arrays (each cell already trimmed)
  // Filter out pure-separator rows (|---|---|)
  const dataRows = rows.filter(r => !r.every(c => /^[-:]+$/.test(c)));
  if (dataRows.length < 2) return '';

  const header = dataRows[0];
  const body   = dataRows.slice(1);

  const isScopeTable = header.some(h => /category|item/i.test(h));
  const statusColIdx = header.findIndex(h => /status/i.test(h));
  const notesColIdx  = header.findIndex(h => /notes|detail/i.test(h));

  let t = '<table class="scope-table"><thead><tr>';
  header.forEach(h => { t += `<th>${escapeHtml(h)}</th>`; });
  t += '</tr></thead><tbody>';

  body.forEach(row => {
    t += '<tr>';
    row.forEach((cell, i) => {
      const clean = stripAnnotations(cell);
      if (isScopeTable && i === statusColIdx) {
        const cls = scopeStatusClass(clean);
        // Strip emoji prefixes (✓ ⚠ etc.) and let CSS handle the indicator
        const label = clean.replace(/^[^\w\s]+\s*/, '').trim();
        t += `<td><span class="scope-chip ${cls}">${escapeHtml(label)}</span></td>`;
      } else {
        t += `<td>${inlineFormat(clean)}</td>`;
      }
    });
    // Pad missing cells
    for (let i = row.length; i < header.length; i++) t += '<td></td>';
    t += '</tr>';
  });

  t += '</tbody></table>';
  return t;
}

function formatBody(raw) {
  const lines = raw.split('\n');
  let html = '';
  let inList = false;
  let sectionCount = 0;
  let tableBuffer = [];   // collecting pipe-table lines

  function closeList() {
    if (inList) { html += '</ul>'; inList = false; }
  }

  function flushTable() {
    if (tableBuffer.length === 0) return;
    const rows = tableBuffer.map(l =>
      l.split('|').slice(1, -1).map(c => c.trim())
    );
    html += renderPipeTable(rows);
    tableBuffer = [];
  }

  for (const line of lines) {
    let trimmed = line.trim();

    // ── Strip markdown header prefixes (##, #) — Claude sometimes outputs these
    const mdHeaderMatch = trimmed.match(/^#{1,3}\s+(.*)/);
    if (mdHeaderMatch) trimmed = mdHeaderMatch[1].trim();

    // ── Strip blockquote prefix (> text) — render as normal paragraph
    if (trimmed.startsWith('> ')) trimmed = trimmed.slice(2).trim();

    // ── Pipe table lines — collect until the table ends
    if (/^\|/.test(trimmed) && trimmed.endsWith('|')) {
      closeList();
      tableBuffer.push(trimmed);
      continue;
    }
    // If we were collecting a table and hit a non-table line, flush it first
    if (tableBuffer.length > 0) {
      flushTable();
    }

    // ── Skip decoration lines (═══) and markdown horizontal rules (---, ***)
    if (/^═{6,}/.test(trimmed) || /^[-*]{3,}$/.test(trimmed)) {
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
      html += `<p class="sub-label"><span class="sub-key">${escapeHtml(subLabelMatch[1])}:</span> ${inlineFormat(stripAnnotations(subLabelMatch[2]))}</p>`;
      continue;
    }

    // ── Bullet points
    if (/^[-•*]\s+/.test(trimmed)) {
      if (!inList) { html += '<ul>'; inList = true; }
      const content = stripAnnotations(trimmed.replace(/^[-•*]\s+/, ''));
      // Bold the part before a colon if present (e.g. "- TK Elevator: includes...")
      const colonIdx = content.indexOf(':');
      if (colonIdx > 0 && colonIdx < 40) {
        const key = content.substring(0, colonIdx);
        const val = content.substring(colonIdx + 1);
        html += `<li><strong>${escapeHtml(key)}:</strong>${inlineFormat(val)}</li>`;
      } else {
        html += `<li>${inlineFormat(content)}</li>`;
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

    // ── Normal paragraph — bold inline **text**; strip backtick annotations
    html += `<p>${inlineFormat(stripAnnotations(trimmed))}</p>`;
  }

  flushTable();
  closeList();
  return html;
}

// ─── Score gauge SVG (dynamic needle position) ───────────────────────────────

function scoreColor(score) {
  if (score == null) return '#6F7478';
  if (score >= 80) return '#00A066';
  if (score >= 50) return '#E8A840';
  return '#E85D5D';
}

function scoreLabel(score) {
  if (score == null) return 'Analysis Complete';
  if (score >= 80) return 'High Performance';
  if (score >= 50) return 'Moderate Inefficiencies';
  return 'High Risk';
}

function scoreDescription(score) {
  if (score == null) return 'Review the findings below for a detailed breakdown.';
  if (score >= 80) return 'System is operating efficiently with no significant cost or risk issues identified.';
  if (score >= 50) return 'Some inefficiencies detected that may result in unnecessary costs or performance risks.';
  return 'Significant issues identified that could lead to excess costs, risk exposure, or poor system performance.';
}

function buildScoreGaugeSvg(score, size) {
  size = size || 110;
  const height = Math.round(size * (15 / 26));
  const cx = 16, cy = 21.5, r = 11;
  const p = score != null ? Math.max(0, Math.min(100, score)) / 100 : 0.5;
  const angle = Math.PI * (1 - p);

  // Needle tip on the arc
  const tipX = (cx + r * Math.cos(angle)).toFixed(2);
  const tipY = (cy - r * Math.sin(angle)).toFixed(2);

  // Tapered needle base — two points perpendicular to needle direction near pivot
  const perpAngle = angle + Math.PI / 2;
  const baseW = 0.75;
  const b1x = (cx + baseW * Math.cos(perpAngle)).toFixed(2);
  const b1y = (cy - baseW * Math.sin(perpAngle)).toFixed(2);
  const b2x = (cx - baseW * Math.cos(perpAngle)).toFixed(2);
  const b2y = (cy + baseW * Math.sin(perpAngle)).toFixed(2);

  const needle = score != null ? scoreColor(score) : '#BFC6CB';
  const arc = '#00A066';

  return `<svg width="${size}" height="${height}" viewBox="3 9 26 15" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="pdf-arc-grad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${arc}" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="${arc}" stop-opacity="0.95"/>
    </linearGradient>
  </defs>
  <path d="M 5 21.5 A 11 11 0 0 1 27 21.5" stroke="url(#pdf-arc-grad)" stroke-width="1.7" stroke-linecap="round"/>
  <line x1="6.5" y1="16" x2="8.6" y2="17.3" stroke="${arc}" stroke-width="1.3" stroke-linecap="round" opacity="0.45"/>
  <line x1="16" y1="10.5" x2="16" y2="13" stroke="${arc}" stroke-width="1.5" stroke-linecap="round" opacity="0.65"/>
  <line x1="25.5" y1="16" x2="23.4" y2="17.3" stroke="${arc}" stroke-width="1.3" stroke-linecap="round" opacity="0.45"/>
  <path d="M ${b1x} ${b1y} L ${tipX} ${tipY} L ${b2x} ${b2y} Z" fill="${needle}" opacity="0.95"/>
  <circle cx="16" cy="21.5" r="1.5" fill="${needle}"/>
</svg>`;
}

// ─── Cover page HTML ──────────────────────────────────────────────────────────

async function buildCoverPage(label, date, downloadUrl, score) {
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

        ${score != null ? `
        <div class="cover-score-block" style="border-left-color:${scoreColor(score)}">
          <div class="cover-score-eyebrow">ElevatorIQ Assessment</div>
          <div class="cover-score-header">
            <div class="cover-score-gauge">${buildScoreGaugeSvg(score, 90)}</div>
            <div class="cover-score-right">
              <div class="cover-score-label" style="color:${scoreColor(score)}">${scoreLabel(score)}</div>
            </div>
          </div>
          <div class="cover-score-desc">${escapeHtml(scoreDescription(score))}</div>
        </div>
        ` : ''}

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

async function wrapInHTML(reportBody, reviewType, downloadUrl, score) {
  const label = formatReviewLabel(reviewType);
  const date  = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const bodyHtml  = formatBody(reportBody);
  const coverHtml = await buildCoverPage(label, date, downloadUrl || `https://${BRAND.domain}`, score != null ? score : null);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
@import url('${TYPOGRAPHY.googleFontsCss2}');

:root {
  --eiq-ink: #0F1112;
  --eiq-ink-mid: #111214;
  --eiq-accent: #00A066;
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
  background: #00A066; height: 4px;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}

.cover-body {
  flex: 1; display: flex; flex-direction: column;
  align-items: flex-start; padding: 0 72px 32px;
}
.cover-report-label {
  font-size: 12px; font-weight: 700; color: #00A066; letter-spacing: 0.18em;
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
  width: 58px; height: 4px; background: #00A066;
  margin-top: 18px; margin-bottom: 34px;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.cover-trust-row {
  display: flex; gap: 28px; flex-wrap: wrap;
}
.cover-trust-item { display: flex; align-items: center; gap: 10px; }
.cover-trust-icon {
  width: 36px; height: 36px; background: #00A066; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.cover-trust-icon svg { width: 18px; height: 18px; }
.cover-trust-text {
  font-size: 14px; color: #333637; line-height: 1.4; font-weight: 500;
}

.cover-score-block {
  margin-top: 24px; margin-bottom: 28px;
  padding: 18px 22px;
  background: #F8F9FA;
  border-radius: 10px;
  border-left: 4px solid #00A066;
  max-width: 460px;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.cover-score-eyebrow {
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.14em; color: #6F7478; margin-bottom: 10px;
}
.cover-score-header {
  display: flex; align-items: center; gap: 16px; margin-bottom: 10px;
}
.cover-score-gauge { flex-shrink: 0; }
.cover-score-right { display: flex; flex-direction: column; justify-content: center; }
.cover-score-label {
  font-family: 'Montserrat', Helvetica, Arial, sans-serif;
  font-size: 18px; font-weight: 800; text-transform: uppercase;
  letter-spacing: 0.06em; line-height: 1.2;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.cover-score-desc {
  font-size: 12px; color: #6F7478; line-height: 1.55;
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
.cover-footer-logo .brand-wordmark-accent { color: #00A066; }
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
.report-header-logo .brand-wordmark-accent { color: #00A066; }
.report-header-right { font-size: 8.5pt; color: #6F7478; text-align: right; line-height: 1.6; }
.report-accent {
  background: #00A066; height: 4px;
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
  font-size: 24pt; font-weight: 800; color: #00A066;
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
  content: '●'; color: #00A066; position: absolute; left: 0; font-size: 8pt;
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

/* ══════════ SCOPE TABLE ══════════ */
.scope-table {
  width: 100%; border-collapse: collapse; margin: 14px 0 18px 0;
  font-size: 9.5pt; table-layout: fixed;
}
.scope-table thead tr { background: #1A1F2A; }
.scope-table thead th {
  color: #ffffff; font-weight: 700; text-transform: uppercase;
  font-size: 8pt; letter-spacing: 0.04em; padding: 8px 10px; text-align: left;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.scope-table thead th:nth-child(1) { width: 28%; }
.scope-table thead th:nth-child(2) { width: 22%; }
.scope-table thead th:nth-child(3) { width: 50%; }
.scope-table tbody tr { border-bottom: 1px solid #E8EAED; }
.scope-table tbody tr:nth-child(even) { background: #F8F9FA; }
.scope-table tbody td {
  padding: 8px 10px; vertical-align: top; color: #2A2F36; line-height: 1.45;
}
.scope-chip {
  display: inline-block; padding: 2px 8px; border-radius: 3px;
  font-size: 8pt; font-weight: 700; white-space: nowrap;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.scope-included { background: #D4F0E4; color: #00704A; }
.scope-partial  { background: #FDF0D4; color: #9A6000; }
.scope-missing  { background: #FDDEDE; color: #B03030; }
.scope-neutral  { background: #EAECEF; color: #4A5060; }

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
.footer-logo .brand-wordmark-accent { color: #00A066; }
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

      const label = formatReviewLabel(reviewType);
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

async function generatePDF(reportBody, caseId, reviewType, downloadUrl, score) {
  const html = await wrapInHTML(reportBody, reviewType, downloadUrl, score);
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

async function generateAndUploadPDF(reportBody, caseId, reviewType, downloadToken, score) {
  const downloadUrl = downloadToken
    ? `https://${BRAND.domain}/api/reports/download/${downloadToken}`
    : `https://${BRAND.domain}`;
  const pdf = await generatePDF(reportBody, caseId, reviewType, downloadUrl, score);
  const key = `reports/${caseId}.pdf`;
  await storageService.uploadBuffer(pdf, key, 'application/pdf');
  return { key, buffer: pdf };
}

/**
 * buildReportFilename — Generate a clean, descriptive PDF filename.
 * Format: ElevatorIQ_<ReviewType>_<Company>_<YYYYMMDD>.pdf
 * e.g.  ElevatorIQ_Repair_Bid_Review_Acme_Corp_20260326.pdf
 */
function buildReportFilename(reviewType, company) {
  const label = formatReviewLabel(reviewType)
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  if (company && typeof company === 'string' && company.trim().length > 0) {
    const safeCompany = company.trim()
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40);
    return `ElevatorIQ_${label}_${safeCompany}_${date}.pdf`;
  }

  return `ElevatorIQ_${label}_${date}.pdf`;
}

module.exports = { generatePDF, generateAndUploadPDF, wrapInHTML, buildReportFilename };
