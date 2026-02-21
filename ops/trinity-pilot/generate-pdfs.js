const puppeteer = require('/Users/treyzackery/OpenClawSandbox/elevatoriq-backend/node_modules/puppeteer');
const path = require('path');

const dir = '/Users/treyzackery/OpenClawSandbox/ops/trinity-pilot';

const docs = [
  { html: 'research-brief.html',  pdf: 'Trinity_Health_Oakland_Research_Brief.pdf' },
  { html: 'pilot-agreement.html', pdf: 'ElevatorIQ_Pilot_Agreement_Trinity_Health_Oakland.pdf' },
  { html: 'value-brief.html',     pdf: 'ElevatorIQ_Value_Brief_Hospital.pdf' },
  { html: 'meeting-guide.html',   pdf: 'ElevatorIQ_Meeting_Guide_Rocky_Alazazi.pdf' },
];

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });

  for (const doc of docs) {
    const page = await browser.newPage();
    await page.goto(`file://${path.join(dir, doc.html)}`, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: path.join(dir, doc.pdf),
      format: 'Letter',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      displayHeaderFooter: false,
    });
    await page.close();
    console.log(`✓ Generated: ${doc.pdf}`);
  }

  await browser.close();
  console.log('\nAll PDFs generated.');
})();
