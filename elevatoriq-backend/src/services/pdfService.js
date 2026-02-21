const puppeteer = require('puppeteer');
const storageService = require('./storageService');

function wrapInHTML(reportBody, reviewType = '') {
  // Convert simple markdown-style formatting to HTML
  const escaped = reportBody
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const lines = escaped.split('\n').map(line => {
    if (line.startsWith('# ')) return `<h1>${line.slice(2)}</h1>`;
    if (line.startsWith('## ')) return `<h2>${line.slice(3)}</h2>`;
    if (line.startsWith('### ')) return `<h3>${line.slice(4)}</h3>`;
    if (line.startsWith('**') && line.endsWith('**')) return `<strong>${line.slice(2, -2)}</strong>`;
    if (line.startsWith('- ') || line.startsWith('* ')) return `<li>${line.slice(2)}</li>`;
    if (line.trim() === '') return '<br/>';
    return `<p>${line}</p>`;
  });

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 11pt;
    color: #1a1a2e;
    margin: 0;
    padding: 0;
    line-height: 1.6;
  }
  .header {
    background: #0B0E13;
    color: white;
    padding: 28px 40px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .header h1 { margin: 0; font-size: 20pt; letter-spacing: -0.5px; }
  .header h1 span { color: #00B876; }
  .header .meta { font-size: 9pt; color: #9AA0AE; text-align: right; }
  .content { padding: 32px 48px; max-width: 720px; margin: 0 auto; }
  h1 { font-size: 16pt; color: #0B0E13; margin-top: 28px; }
  h2 { font-size: 13pt; color: #0B0E13; border-bottom: 1px solid #E8EAF0; padding-bottom: 6px; margin-top: 24px; }
  h3 { font-size: 11pt; color: #3E4452; margin-top: 16px; }
  p { margin: 8px 0; color: #3E4452; }
  li { margin: 4px 0; color: #3E4452; }
  ul { padding-left: 20px; }
  .footer {
    margin-top: 48px;
    padding: 16px 48px;
    border-top: 1px solid #E8EAF0;
    font-size: 8pt;
    color: #9AA0AE;
    display: flex;
    justify-content: space-between;
  }
  strong { color: #0B0E13; }
</style>
</head>
<body>
<div class="header">
  <h1>Elevator<span>IQ</span></h1>
  <div class="meta">
    ${reviewType}<br/>
    Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}<br/>
    Secure · Confidential · No vendor affiliations
  </div>
</div>
<div class="content">
  ${lines.join('\n')}
</div>
<div class="footer">
  <span>ElevatorIQ Analysis Report</span>
  <span>Generated using ElevatorIQ domain logic v1.1 · Independent analysis only</span>
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
      margin: { top: '0.75in', bottom: '0.75in', left: '0.75in', right: '0.75in' },
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
