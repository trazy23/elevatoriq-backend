#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const backendRoot = path.join(__dirname, '..');
const envPath = process.env.EIQ_BRIDGE_ENV_FILE || path.join(os.homedir(), '.hermes', 'secrets', 'elevatoriq-render.env');
require('dotenv').config({ path: fs.existsSync(envPath) ? envPath : path.join(backendRoot, '.env') });
const db = require('../src/db');
const procura = require('../src/services/procuraCommandService');

const members = [
['Apple','Technology','MRO, electrical, jan/san, flooring','Medium','Corporate campuses, retail stores, data centers'],
['Dell','Technology','MRO, electrical, jan/san','Medium','Offices, labs, distribution, data center ops'],
['Google','Technology','Electrical, MRO, jan/san, flooring','Medium','Large campuses/data centers'],
['IBM','Technology','MRO, electrical, jan/san','Medium','Offices, labs, data centers'],
['Meta Platforms','Technology','Electrical, MRO, jan/san, flooring','Medium','Campuses/data centers'],
['Microsoft','Technology','Electrical, MRO, jan/san, flooring','Medium','Campuses/data centers/offices'],
['Ford','Automotive','MRO, jan/san, paint, electrical, flooring','High','Plants, offices, dealership ecosystem'],
['General Motors','Automotive','MRO, jan/san, paint, electrical, flooring','High','Plants, offices, dealership ecosystem'],
['Honda North America','Automotive','MRO, jan/san, paint, electrical','High','Plants/offices'],
['Stellantis','Automotive','MRO, jan/san, paint, electrical, flooring','High','Plants/offices/dealer ecosystem'],
['Toyota Motor North America','Automotive','MRO, jan/san, paint, electrical','High','Plants/offices/dealer ecosystem'],
['CVS Health','Retail/Healthcare','Jan/san, MRO, flooring, electrical, paint','Very High','Stores, clinics, distribution, corporate offices'],
['Kroger','Retail/Grocery','Jan/san, MRO, flooring, electrical, paint','Very High','Stores, warehouses, offices'],
['The Home Depot','Retail/Home Improvement','MRO, electrical, jan/san, paint, flooring','High','Stores, distribution, Pro/customer channel'],
['Walmart','Retail','Jan/san, MRO, flooring, electrical, paint','Very High','Stores, clubs, DCs, corporate campuses'],
['Bank of America','Financial Services','Jan/san, MRO, flooring, paint, electrical','Very High','Branches, offices, campuses'],
['Citi','Financial Services','Jan/san, MRO, flooring, paint, electrical','High','Branches/offices/campuses'],
['JPMorgan Chase','Financial Services','Jan/san, MRO, flooring, paint, electrical','Very High','Branches, offices, operations centers'],
['AT&T','Telecom','Electrical, MRO, jan/san, flooring','High','Offices, retail, network facilities'],
['Comcast NBCUniversal','Telecom/Media','Electrical, MRO, jan/san, flooring, paint','High','Offices, studios, retail/service facilities'],
['Verizon','Telecom','Electrical, MRO, jan/san, flooring','High','Retail, offices, network facilities'],
['Duke Energy','Energy/Utility','Electrical, MRO, jan/san, paint, flooring','High','Offices, service centers, plants'],
['Entergy','Energy/Utility','Electrical, MRO, jan/san, paint','High','Offices, plants, service centers'],
['Exelon','Energy/Utility','Electrical, MRO, jan/san, paint','High','Offices, utility operations, plants'],
['ExxonMobil','Energy','MRO, electrical, jan/san, paint','Medium','Campuses, plants, refineries, offices'],
['Pacific Gas and Electric','Energy/Utility','Electrical, MRO, jan/san, paint','High','Utility ops, offices, service centers'],
['Abbott','Healthcare/Pharma','MRO, jan/san, electrical, flooring','Medium','Manufacturing, labs, offices'],
['Bristol Myers Squibb','Healthcare/Pharma','MRO, jan/san, electrical, flooring','Medium','Labs, manufacturing, offices'],
['Johnson & Johnson','Healthcare/Pharma','MRO, jan/san, electrical, flooring','Medium','Manufacturing, labs, offices'],
['Kaiser Permanente','Healthcare','Jan/san, MRO, flooring, electrical, paint','Very High','Hospitals, medical offices, admin'],
['Medtronic','Healthcare/MedTech','MRO, jan/san, electrical, flooring','Medium','Manufacturing, labs, offices'],
['Merck','Healthcare/Pharma','MRO, jan/san, electrical, flooring','Medium','Manufacturing, labs, offices'],
['Boeing','Industrial/Aerospace','MRO, electrical, jan/san, paint, flooring','High','Manufacturing, hangars, offices'],
['Caterpillar','Industrial','MRO, electrical, jan/san, paint','High','Plants, offices, dealer ecosystem'],
['Cummins','Industrial','MRO, electrical, jan/san, paint','High','Manufacturing, offices'],
['Adient','Industrial/Automotive Seating','MRO, jan/san, electrical, flooring','High','Manufacturing/offices'],
['Amazon','Ecommerce/Logistics/Tech','MRO, jan/san, flooring, electrical, paint','Very High','Fulfillment centers, offices, data centers'],
['Avis Budget Group','Travel/Rental','Jan/san, MRO, flooring, paint, electrical','High','Rental locations, maintenance, offices'],
['CDW','Technology Reseller','MRO, jan/san, electrical','Medium','Offices, distribution, customer procurement channel'],
['CBRE','Commercial Real Estate/FM','Jan/san, MRO, flooring, electrical, paint','Very High','Manages client buildings/facilities'],
['Coca-Cola','Beverage/CPG','MRO, jan/san, flooring, electrical, paint','High','Plants, warehouses, offices'],
['Procter & Gamble','CPG/Manufacturing','MRO, jan/san, electrical, flooring, paint','High','Plants, offices, labs'],
['T-Mobile','Telecom/Retail','Electrical, MRO, jan/san, flooring, paint','High','Retail, offices, network facilities'],
];
const priorityScore = p => p === 'Very High' ? 94 : p === 'High' ? 88 : 78;
(async () => {
  await procura.ensureSchema();
  let inserted = 0, updated = 0;
  for (const [company, industry, lanes, priority, footprint] of members) {
    const notes = `BDR strategic account. Industry: ${industry}. Footprint: ${footprint}. Procura-fit lanes: ${lanes}. Best initial targets: supplier diversity, indirect procurement, facilities procurement/category managers.`;
    const signal = `Billion Dollar Roundtable member with formal supplier diversity mandate; potential eligible indirect/facility spend across ${lanes}.`;
    const existing = await db.query(`SELECT id FROM procura_opportunities WHERE lower(company)=lower($1) AND source='bdr_member_research' LIMIT 1`, [company]);
    if (existing.rows.length) {
      await db.query(`UPDATE procura_opportunities SET opportunity_signal=$2, notes=$3, priority_score=$4, updated_at=NOW() WHERE id=$1`, [existing.rows[0].id, signal, notes, priorityScore(priority)]);
      updated++;
    } else {
      await db.query(`INSERT INTO procura_opportunities (company,lane,market,buyer_type,decision_maker,title,opportunity_signal,estimated_value_band,priority_score,status,approval_status,notes,source,source_url) VALUES ($1,'multi','National',$2,$3,$3,$4,$5,$6,'researched','not_requested',$7,'bdr_member_research',$8)`, [company, `${industry} / enterprise facilities and indirect procurement`, 'Supplier Diversity / Indirect Procurement / Facilities Procurement', signal, 'Enterprise account; pilot value unknown until category/site fit confirmed', priorityScore(priority), notes, 'https://www.supplierdiversity.com/blog/the-43-companies-spending-1-billion-or-more-with-diverse-suppliers/']);
      inserted++;
    }
  }
  await procura.logActivity({agentKey:'procura_scout_agent', eventType:'bdr_member_research_seeded', title:'BDR member accounts added to Procura Command', detail:`Seeded ${inserted}, updated ${updated} Billion Dollar Roundtable strategic accounts.`, payload:{inserted,updated,total:members.length}});
  console.log(JSON.stringify({ok:true, inserted, updated, total:members.length}, null, 2));
  process.exit(0);
})().catch(err => { console.error(err.stack || err.message); process.exit(1); });
