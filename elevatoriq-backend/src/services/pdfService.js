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
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'DM Sans', Helvetica, Arial, sans-serif;
    font-size: 10.5pt;
    color: #1a1f2a;
    background: white;
    line-height: 1.65;
  }

  /* ── Header ── */
  .header {
    background: #0B0E13;
    padding: 28px 44px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }
  .logo {
    font-size: 22pt;
    font-weight: 700;
    color: white;
    letter-spacing: -0.5px;
  }
  .logo span { color: #00B876; }
  .header-meta {
    text-align: right;
    color: #9AA0AE;
    font-size: 9pt;
    line-height: 1.7;
  }
  .header-meta strong {
    display: block;
    color: #E8EAF0;
    font-size: 10.5pt;
    font-weight: 600;
    margin-bottom: 4px;
  }

  /* ── Content ── */
  .content {
    padding: 36px 48px 48px;
    max-width: 780px;
    margin: 0 auto;
  }

  p {
    margin: 7px 0;
    color: #2d3340;
  }

  h2.section-title {
    font-size: 13pt;
    font-weight: 700;
    color: #0B0E13;
    letter-spacing: -0.3px;
    margin: 28px 0 10px 0;
    padding-bottom: 7px;
    border-bottom: 2px solid #00B876;
  }

  h3.sub-heading {
    font-size: 10pt;
    font-weight: 600;
    color: #3E4452;
    margin: 18px 0 6px 0;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  hr.section-rule {
    border: none;
    border-top: 1px solid #E8EAF0;
    margin: 6px 0;
  }

  ul {
    padding-left: 20px;
    margin: 8px 0 8px 0;
  }
  li {
    margin: 4px 0;
    color: #2d3340;
  }

  .spacer { height: 6px; }

  /* ── Risk blocks ── */
  .risk-block {
    border-left: 3px solid;
    padding: 10px 14px;
    margin: 12px 0;
    border-radius: 0 6px 6px 0;
    page-break-inside: avoid;
  }
  .risk-high {
    border-color: #E85D5D;
    background: #fff5f5;
  }
  .risk-medium {
    border-color: #E8A840;
    background: #fffbf0;
  }
  .risk-low {
    border-color: #9AA0AE;
    background: #f8f9fa;
  }
  .risk-badge {
    display: inline-block;
    font-family: 'DM Mono', monospace;
    font-size: 8.5pt;
    font-weight: 500;
    padding: 1px 7px;
    border-radius: 3px;
    margin-right: 6px;
    color: white;
  }
  .risk-high .risk-badge { background: #E85D5D; }
  .risk-medium .risk-badge { background: #E8A840; }
  .risk-low .risk-badge { background: #9AA0AE; }

  /* ── Sub-labels ── */
  .sub-label {
    margin: 4px 0 4px 14px;
    color: #3E4452;
    font-size: 10pt;
  }
  .sub-label strong {
    color: #0B0E13;
  }

  /* ── Footer ── */
  .footer {
    margin-top: 40px;
    padding: 16px 48px;
    border-top: 1px solid #E8EAF0;
    display: flex;
    justify-content: space-between;
    font-size: 8pt;
    color: #9AA0AE;
  }

  /* ── Print ── */
  @media print {
    .header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .risk-block { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    h2.section-title { page-break-after: avoid; }
    .risk-block { page-break-inside: avoid; }
  }
</style>
</head>
<body>

<div class="header">
  <div class="logo">Elevator<span>IQ</span></div>
  <div class="header-meta">
    <strong>${escapeHtml(label)}</strong>
    ${escapeHtml(date)}<br/>
    Secure · Confidential · No vendor affiliations<br/>
    Generated by ElevatorIQ domain logic v1.1
  </div>
</div>

<div class="content">
  ${bodyHtml}
</div>

<div class="footer">
  <span>ElevatorIQ — Independent Elevator Intelligence</span>
  <span>This analysis is for decision support only. Verify all figures before contract execution.</span>
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
