const puppeteer = require('puppeteer');
const storageService = require('./storageService');

const REVIEW_LABELS = {
  modernization_comparison: 'Modernization Bid Comparison',
  maintenance_bid_comparison: 'Maintenance Bid Comparison',
  invoice_review: 'Invoice Review',
  contract_coverage: 'Contract Coverage Summary',
  single_modernization: 'Single Bid Review',
};

function formatText(raw) {
  const lines = raw.split('\n');
  let html = '';
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Section dividers (═══)
    if (/^═{10,}/.test(trimmed)) {
      if (inList) { html += '</ul>'; inList = false; }
      html += '<hr class="section-rule">';
      continue;
    }

    // Section headers (SECTION N — TITLE)
    if (/^SECTION \d+\s*—/.test(trimmed)) {
      if (inList) { html += '</ul>'; inList = false; }
      const title = trimmed.replace(/^SECTION \d+\s*—\s*/, '');
      html += `<h2 class="section-title">${escapeHtml(title)}</h2>`;
      continue;
    }

    // Risk signal severity tags [HIGH] [MEDIUM] [LOW]
    if (/^\[(HIGH|MEDIUM|LOW)\]/.test(trimmed)) {
      if (inList) { html += '</ul>'; inList = false; }
      const severity = trimmed.match(/^\[(HIGH|MEDIUM|LOW)\]/)[1];
      const rest = trimmed.replace(/^\[(HIGH|MEDIUM|LOW)\]\s*/, '');
      const cls = severity === 'HIGH' ? 'risk-high' : severity === 'MEDIUM' ? 'risk-medium' : 'risk-low';
      html += `<div class="risk-block ${cls}"><span class="risk-badge">${severity}</span> ${escapeHtml(rest)}</div>`;
      continue;
    }

    // Sub-labels like "Finding:", "Risk:", "Recommendation:"
    if (/^(Finding|Risk|Recommendation|Assessment|Confidence|Explanation):/.test(trimmed)) {
      if (inList) { html += '</ul>'; inList = false; }
      const [label, ...rest] = trimmed.split(':');
      html += `<p class="sub-label"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(rest.join(':').trim())}</p>`;
      continue;
    }

    // Bullet points
    if (/^[-•*]\s+/.test(trimmed)) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${escapeHtml(trimmed.replace(/^[-•*]\s+/, ''))}</li>`;
      continue;
    }

    // Close list if needed
    if (inList && trimmed !== '') {
      html += '</ul>';
      inList = false;
    }

    // Bold lines (all caps header-like lines)
    if (trimmed === trimmed.toUpperCase() && trimmed.length > 4 && trimmed.length < 80 && /[A-Z]/.test(trimmed)) {
      html += `<h3 class="sub-heading">${escapeHtml(trimmed)}</h3>`;
      continue;
    }

    // Empty lines
    if (trimmed === '') {
      if (inList) { html += '</ul>'; inList = false; }
      html += '<div class="spacer"></div>';
      continue;
    }

    // Normal paragraph
    html += `<p>${escapeHtml(trimmed)}</p>`;
  }

  if (inList) html += '</ul>';
  return html;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapInHTML(reportBody, reviewType = '') {
  const label = REVIEW_LABELS[reviewType] || reviewType;
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const bodyHtml = formatText(reportBody);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: Helvetica, Arial, sans-serif;
    font-size: 10.5pt;
    color: #1a1f2a;
    background: white;
    line-height: 1.65;
  }

  /* ══ COVER HEADER ══ */
  .header {
    background: #0B0E13;
    padding: 0;
  }
  .header-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 22px 44px 18px;
  }
  .logo-block { display: flex; flex-direction: column; }
  .logo {
    font-size: 26pt;
    font-weight: 800;
    color: white;
    letter-spacing: -1px;
    line-height: 1;
  }
  .logo span { color: #00B876; }
  .logo-tagline {
    font-size: 8.5pt;
    color: #6B7280;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    margin-top: 4px;
    font-weight: 400;
  }
  .header-badge {
    background: rgba(0,184,118,0.12);
    border: 1px solid rgba(0,184,118,0.3);
    border-radius: 6px;
    padding: 10px 18px;
    text-align: right;
  }
  .header-badge .report-type {
    font-size: 10pt;
    font-weight: 700;
    color: #00B876;
    letter-spacing: 0.02em;
    display: block;
  }
  .header-badge .report-date {
    font-size: 8.5pt;
    color: #9AA0AE;
    margin-top: 3px;
    display: block;
  }
  .header-strip {
    background: #00B876;
    height: 3px;
  }
  .header-sub {
    background: #131720;
    padding: 10px 44px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .trust-pills { display: flex; gap: 18px; }
  .trust-pill {
    font-size: 8pt;
    color: #6B7280;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .trust-pill::before {
    content: '✓ ';
    color: #00B876;
    font-weight: 700;
  }
  .powered-by {
    font-size: 7.5pt;
    color: #4B5563;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  /* ══ CONTENT ══ */
  .content {
    padding: 36px 48px 48px;
    max-width: 780px;
    margin: 0 auto;
  }

  p { margin: 7px 0; color: #2d3340; }

  h2.section-title {
    font-size: 12.5pt;
    font-weight: 700;
    color: #0B0E13;
    letter-spacing: -0.2px;
    margin: 30px 0 10px 0;
    padding: 8px 12px 8px 14px;
    background: #f4f6f9;
    border-left: 4px solid #00B876;
    border-radius: 0 4px 4px 0;
  }

  h3.sub-heading {
    font-size: 9.5pt;
    font-weight: 700;
    color: #3E4452;
    margin: 18px 0 6px 0;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  hr.section-rule {
    border: none;
    border-top: 1px solid #E8EAF0;
    margin: 4px 0;
  }

  ul { padding-left: 20px; margin: 8px 0; }
  li { margin: 4px 0; color: #2d3340; }

  .spacer { height: 6px; }

  /* ══ RISK BLOCKS ══ */
  .risk-block {
    border-left: 4px solid;
    padding: 11px 16px;
    margin: 12px 0;
    border-radius: 0 6px 6px 0;
    page-break-inside: avoid;
  }
  .risk-high   { border-color: #DC2626; background: #fef2f2; }
  .risk-medium { border-color: #D97706; background: #fffbeb; }
  .risk-low    { border-color: #6B7280; background: #f9fafb; }

  .risk-badge {
    display: inline-block;
    font-size: 7.5pt;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 3px;
    margin-right: 7px;
    color: white;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .risk-high   .risk-badge { background: #DC2626; }
  .risk-medium .risk-badge { background: #D97706; }
  .risk-low    .risk-badge { background: #6B7280; }

  /* ══ SUB-LABELS ══ */
  .sub-label {
    margin: 4px 0 4px 16px;
    color: #4B5563;
    font-size: 10pt;
  }
  .sub-label strong { color: #111827; }

  /* ══ FOOTER ══ */
  .footer {
    background: #0B0E13;
    margin-top: 48px;
    padding: 20px 44px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .footer-left { display: flex; flex-direction: column; gap: 3px; }
  .footer-logo {
    font-size: 13pt;
    font-weight: 800;
    color: white;
    letter-spacing: -0.5px;
  }
  .footer-logo span { color: #00B876; }
  .footer-tagline {
    font-size: 8pt;
    color: #4B5563;
    letter-spacing: 0.06em;
    font-style: italic;
  }
  .footer-right {
    text-align: right;
    font-size: 7.5pt;
    color: #4B5563;
    line-height: 1.8;
  }
  .footer-disclaimer {
    font-size: 7pt;
    color: #374151;
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid #1F2937;
    text-align: center;
  }

  /* ══ PRINT ══ */
  @media print {
    .header       { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .header-strip { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .header-sub   { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .risk-block   { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .footer       { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    h2.section-title { page-break-after: avoid; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>

<!-- ══ HEADER ══ -->
<div class="header">
  <div class="header-top">
    <div class="logo-block">
      <div class="logo">Elevator<span>IQ</span></div>
      <div class="logo-tagline">Structured intelligence, not guesswork.</div>
    </div>
    <div class="header-badge">
      <span class="report-type">${escapeHtml(label)}</span>
      <span class="report-date">${escapeHtml(date)}</span>
    </div>
  </div>
  <div class="header-strip"></div>
  <div class="header-sub">
    <div class="trust-pills">
      <span class="trust-pill">Independent</span>
      <span class="trust-pill">Confidential</span>
      <span class="trust-pill">No Vendor Affiliations</span>
    </div>
    <div class="powered-by">ElevatorIQ Domain Logic v1.1</div>
  </div>
</div>

<!-- ══ BODY ══ -->
<div class="content">
  ${bodyHtml}
</div>

<!-- ══ FOOTER ══ -->
<div class="footer">
  <div class="footer-left">
    <div class="footer-logo">Elevator<span>IQ</span></div>
    <div class="footer-tagline">"Upload. Analyze. Decide."</div>
  </div>
  <div class="footer-right">
    elevatoriq.ai<br/>
    Independent Elevator Intelligence<br/>
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

async function generatePDF(reportBody, caseId, reviewType) {
  const html = wrapInHTML(reportBody, reviewType);
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'Letter',
      margin: { top: '0.5in', bottom: '0.65in', left: '0.5in', right: '0.5in' },
      printBackground: true,
    });
    return pdf;
  } finally {
    await browser.close();
  }
}

async function generateAndUploadPDF(reportBody, caseId, reviewType) {
  const pdf = await generatePDF(reportBody, caseId, reviewType);
  const key = `reports/${caseId}.pdf`;
  await storageService.uploadBuffer(pdf, key, 'application/pdf');
  return { key, buffer: pdf };
}

module.exports = { generatePDF, generateAndUploadPDF, wrapInHTML };
