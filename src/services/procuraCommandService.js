const db = require('../db');

const LANES = ['paint', 'electrical', 'flooring', 'jan_san', 'mro'];
const LANE_LABELS = {
  paint: 'Paint',
  electrical: 'Electrical',
  flooring: 'Flooring',
  jan_san: 'Jan/San',
  mro: 'MRO',
};

const TARGET_TITLES = [
  'Procurement Manager', 'Purchasing Manager', 'Facilities Director', 'Operations Manager',
  'Maintenance Manager', 'Director of Facilities', 'Property Operations Manager',
  'Supply Chain Manager', 'Plant Manager', 'Facility Manager'
];

async function ensureSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS procura_agents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      key TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      lane TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle','running','blocked','needs_review','paused','error')),
      current_work TEXT,
      last_output TEXT,
      last_run_at TIMESTAMPTZ,
      next_run_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS procura_opportunities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company TEXT NOT NULL,
      lane TEXT NOT NULL CHECK (lane IN ('paint','electrical','flooring','jan_san','mro','multi')),
      market TEXT DEFAULT 'National',
      buyer_type TEXT,
      decision_maker TEXT,
      title TEXT,
      email TEXT,
      linkedin_url TEXT,
      website_url TEXT,
      source_url TEXT,
      opportunity_signal TEXT,
      estimated_value_band TEXT,
      priority_score INTEGER DEFAULT 0 CHECK (priority_score >= 0 AND priority_score <= 100),
      status TEXT NOT NULL DEFAULT 'researched' CHECK (status IN ('researched','ready_for_approval','approved','queued','sent','replied','follow_up_due','opportunity','quoted','won','lost','not_fit','do_not_contact')),
      approval_status TEXT NOT NULL DEFAULT 'not_requested' CHECK (approval_status IN ('not_requested','pending','approved','needs_edits','rejected')),
      last_contacted_at TIMESTAMPTZ,
      next_follow_up_at TIMESTAMPTZ,
      reply_summary TEXT,
      notes TEXT,
      source TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS procura_campaigns (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      lane TEXT NOT NULL DEFAULT 'multi',
      channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email','linkedin','phone','other')),
      objective TEXT,
      subject TEXT,
      body TEXT,
      cta TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready_for_approval','approved','queued','running','sent','paused','completed','needs_edits','rejected')),
      approval_status TEXT NOT NULL DEFAULT 'not_requested' CHECK (approval_status IN ('not_requested','pending','approved','needs_edits','rejected')),
      owner_agent_key TEXT REFERENCES procura_agents(key),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS procura_campaign_recipients (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      campaign_id UUID NOT NULL REFERENCES procura_campaigns(id) ON DELETE CASCADE,
      opportunity_id UUID REFERENCES procura_opportunities(id) ON DELETE SET NULL,
      email TEXT,
      name TEXT,
      company TEXT,
      personalized_opening TEXT,
      final_subject TEXT,
      final_body TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready_for_approval','approved','queued','sending','sent','failed','replied','do_not_send')),
      provider_message_id TEXT,
      sent_at TIMESTAMPTZ,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS procura_approvals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      item_type TEXT NOT NULL CHECK (item_type IN ('opportunity','campaign','recipient','research','other')),
      item_id UUID,
      title TEXT NOT NULL,
      summary TEXT,
      risk_level TEXT NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low','medium','high')),
      requested_by_agent_key TEXT REFERENCES procura_agents(key),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','needs_edits','rejected','executed','failed')),
      decision_notes TEXT,
      decided_at TIMESTAMPTZ,
      executed_at TIMESTAMPTZ,
      action_type TEXT CHECK (action_type IN ('send_email','queue_campaign','mark_opportunity_approved','none')),
      action_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      action_result JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS procura_activity_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_key TEXT REFERENCES procura_agents(key),
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_procura_opportunities_status ON procura_opportunities(status, approval_status);
    CREATE INDEX IF NOT EXISTS idx_procura_opportunities_lane ON procura_opportunities(lane, priority_score DESC);
    CREATE INDEX IF NOT EXISTS idx_procura_approvals_status ON procura_approvals(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_procura_activity_created ON procura_activity_events(created_at DESC);
  `);
  const agents = [
    ['procura_scout_agent', 'Procura Scout Agent', 'Market Opportunity', 'Finds national buyer opportunities across paint, electrical, flooring, Jan/San, and MRO.'],
    ['procura_apollo_agent', 'Procura Apollo Agent', 'Lead Enrichment', 'Uses Apollo verified emails for procurement/facilities decision makers.'],
    ['procura_outreach_agent', 'Procura Outreach Agent', 'Revenue Outreach', 'Drafts approval-gated Brinker/Procura outreach using Trey Zackery, Brinker Group signature.'],
    ['procura_reply_agent', 'Procura Reply Agent', 'Inbox Monitoring', 'Checks Brinker/Exchange readiness and classifies replies once account access is wired.'],
    ['procura_scoreboard_agent', 'Procura Scoreboard Agent', 'Executive Reporting', 'Summarizes opportunities, approvals, blockers, and next money moves.'],
  ];
  for (const a of agents) {
    await db.query(`INSERT INTO procura_agents (key,name,lane,current_work) VALUES ($1,$2,$3,$4) ON CONFLICT (key) DO NOTHING`, a);
  }
}

async function logActivity({ agentKey='procura_scoreboard_agent', eventType, title, detail=null, payload={} }) {
  await ensureSchema();
  await db.query(`INSERT INTO procura_activity_events (agent_key,event_type,title,detail,payload) VALUES ($1,$2,$3,$4,$5::jsonb)`, [agentKey,eventType,title,detail,JSON.stringify(payload)]);
}

function laneLabel(lane) { return LANE_LABELS[lane] || 'Multi-lane'; }
function scoreOpportunity(row) {
  const text = Object.values(row).join(' ').toLowerCase();
  let s = 65;
  if (/procurement|purchasing|sourcing|facilit|maintenance|operations|plant|property/.test(text)) s += 14;
  if (/director|manager|vp|head|chief|owner|president/.test(text)) s += 8;
  if (/school|university|hospital|healthcare|municipal|government|manufacturing|property|facility|campus|portfolio|hotel|multifamily/.test(text)) s += 8;
  if (row.email) s += 5;
  if (/sales|marketing|student|recruiter|consultant/.test(text)) s -= 18;
  return Math.max(40, Math.min(98, s));
}

async function getSummary() {
  await ensureSchema();
  const [opps, campaigns, approvals, agents, activity] = await Promise.all([
    db.query(`SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE email IS NOT NULL)::int with_email, COUNT(*) FILTER (WHERE status IN ('ready_for_approval') OR approval_status='pending')::int need_review, COUNT(*) FILTER (WHERE status='sent')::int sent, COUNT(*) FILTER (WHERE status='replied')::int replies, COUNT(*) FILTER (WHERE status IN ('opportunity','quoted'))::int active_opportunities, COUNT(*) FILTER (WHERE status='won')::int won FROM procura_opportunities WHERE status NOT IN ('not_fit','do_not_contact') AND approval_status <> 'rejected'`),
    db.query(`SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE status IN ('ready_for_approval') OR approval_status='pending')::int need_review, COUNT(*) FILTER (WHERE status IN ('sent','completed'))::int completed FROM procura_campaigns WHERE status <> 'rejected'`),
    db.query(`SELECT COUNT(*) FILTER (WHERE status='pending')::int pending, COUNT(*) FILTER (WHERE status='needs_edits')::int needs_edits, COUNT(*) FILTER (WHERE status='executed')::int executed, COUNT(*) FILTER (WHERE status='failed')::int failed FROM procura_approvals WHERE status <> 'rejected'`),
    db.query(`SELECT key,name,lane,status,current_work,last_output,last_run_at,next_run_at FROM procura_agents ORDER BY lane,name`),
    db.query(`SELECT agent_key,event_type,title,detail,created_at FROM procura_activity_events ORDER BY created_at DESC LIMIT 20`),
  ]);
  const byLane = await db.query(`SELECT lane, COUNT(*)::int total, COUNT(email)::int with_email, ROUND(AVG(priority_score))::int avg_score FROM procura_opportunities GROUP BY lane ORDER BY lane`);
  const o = opps.rows[0] || {};
  const a = approvals.rows[0] || {};
  const headline = Number(o.total || 0) ? `Procura has ${o.total} buyer/opportunity records across paint, electrical, flooring, Jan/San, and MRO; ${o.with_email} have usable emails.` : 'Procura Opportunity Command is ready; first job is filling the buyer pipeline.';
  const actionCount = Number(a.pending || 0) + Number(a.needs_edits || 0);
  return {
    generated_at: new Date().toISOString(),
    operating_rules: {
      outreach_from: 'Brinker Exchange email once configured in Himalaya',
      signature: 'Trey Zackery, Brinker Group',
      geography: 'National',
      market_filter: 'Market opportunities, not relationship-constrained',
      external_action_guardrail: 'No external emails/commitments without approval of exact item',
    },
    executive_summary: {
      headline,
      traction: `${o.with_email || 0} sendable contacts, ${o.sent || 0} sent, ${o.replies || 0} replies, ${o.active_opportunities || 0} active opportunities, ${o.won || 0} won.`,
      agent_health: agents.rows.map(x => `${x.name}: ${x.status}`).join(' · '),
      recommended_ceo_action: actionCount ? `Review ${actionCount} Procura approval item(s), especially outreach drafts.` : 'No CEO approval items right now. Let the daily machine keep enriching opportunities.',
    },
    opportunities: { ...o, by_lane: byLane.rows },
    campaigns: campaigns.rows[0] || {},
    approvals: a,
    agents: agents.rows,
    recent_activity: activity.rows,
  };
}

async function listApprovals() {
  await ensureSchema();
  const result = await db.query(`SELECT a.*, ag.name AS requested_by_agent_name FROM procura_approvals a LEFT JOIN procura_agents ag ON ag.key=a.requested_by_agent_key WHERE a.status IN ('pending','needs_edits','failed','approved') ORDER BY CASE a.status WHEN 'pending' THEN 1 WHEN 'needs_edits' THEN 2 ELSE 3 END, a.created_at DESC LIMIT 100`);
  return result.rows;
}
async function listOpportunities() { await ensureSchema(); const r=await db.query(`SELECT * FROM procura_opportunities ORDER BY priority_score DESC, created_at DESC LIMIT 200`); return r.rows; }
async function listCampaigns() { await ensureSchema(); const r=await db.query(`SELECT c.*, COUNT(r.id)::int recipient_count, COUNT(r.id) FILTER (WHERE r.status='sent')::int sent_count, COUNT(r.id) FILTER (WHERE r.status='failed')::int failed_count, COALESCE(json_agg(json_build_object('id',r.id,'company',r.company,'email',r.email,'name',r.name,'status',r.status,'final_subject',r.final_subject,'final_body',r.final_body,'personalized_opening',r.personalized_opening) ORDER BY r.created_at) FILTER (WHERE r.id IS NOT NULL),'[]') AS recipient_drafts FROM procura_campaigns c LEFT JOIN procura_campaign_recipients r ON r.campaign_id=c.id GROUP BY c.id ORDER BY c.created_at DESC LIMIT 100`); return r.rows; }

async function updateAgent(key, fields) {
  const sets=[]; const vals=[key];
  for (const [k,v] of Object.entries(fields)) { vals.push(v); sets.push(`${k}=$${vals.length}`); }
  if (!sets.length) return;
  await db.query(`UPDATE procura_agents SET ${sets.join(', ')}, updated_at=NOW() WHERE key=$1`, vals);
}

async function createApprovalIfMissing({ itemType, itemId, title, summary, actionType='none', actionPayload={}, agentKey='procura_scout_agent', riskLevel='medium' }) {
  const found = await db.query(`SELECT id FROM procura_approvals WHERE title=$1 AND status IN ('pending','needs_edits','failed') LIMIT 1`, [title]);
  if (found.rows.length) return found.rows[0];
  const r = await db.query(`INSERT INTO procura_approvals (item_type,item_id,title,summary,risk_level,requested_by_agent_key,action_type,action_payload) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING id`, [itemType,itemId,title,summary,riskLevel,agentKey,actionType,JSON.stringify(actionPayload)]);
  return r.rows[0];
}

async function seedLaneOpportunities() {
  await ensureSchema();
  const seeds = [
    ['jan_san','National school districts and facility operators','Public/institutional facilities','Facilities / Procurement Director','Recurring janitorial chemicals, paper, liners, dispensers, and cleaning supplies; good recurring reorder lane.','Public bid portals, district purchasing pages, facility managers, cooperative purchasing clues.'],
    ['mro','Manufacturing plants and property operators','Operations / Maintenance','Maintenance or Operations Manager','High-frequency maintenance, repair, safety, tools, fasteners, and facility consumables; Grainger-style fulfillment alternative.','Plant/facility teams with purchasing or maintenance leaders.'],
    ['paint','Property operators and public facilities','Facilities / Capital Projects','Facilities or Project Manager','Paint and coatings needs around turns, renovations, maintenance, schools, healthcare, municipal buildings, and property portfolios.','Renovation, facility maintenance, vendor consolidation, repaint cycles.'],
    ['electrical','Facilities, contractors, property portfolios','Facilities / Electrical Maintenance','Facilities or Electrical Manager','Lighting/electrical material opportunities including lamps, fixtures, emergency lighting, controls, and maintenance supplies.','Facility maintenance, lighting upgrades, electrical buyers, contractors.'],
    ['flooring','Property operators, schools, healthcare','Facilities / Capital Projects','Facilities or Project Manager','Flooring material/project supply opportunities for turns, renovations, schools, healthcare, and commercial portfolios.','Renovation cycles, bid requests, facility project managers.'],
  ];
  let inserted=0;
  for (const [lane, company, buyerType, decision, signal, notes] of seeds) {
    const exists = await db.query(`SELECT id FROM procura_opportunities WHERE lower(company)=lower($1) AND lane=$2 LIMIT 1`, [company,lane]);
    if (exists.rows.length) continue;
    await db.query(`INSERT INTO procura_opportunities (company,lane,market,buyer_type,decision_maker,title,opportunity_signal,estimated_value_band,priority_score,status,approval_status,notes,source) VALUES ($1,$2,'National',$3,$4,$4,$5,'Unknown until qualified; likely recurring/category-supply opportunity',78,'researched','not_requested',$6,'procura_seed')`, [company,lane,buyerType,decision,signal,notes]);
    inserted++;
  }
  await logActivity({agentKey:'procura_scout_agent',eventType:'seed_opportunities',title:'Procura lane seed opportunities created',detail:`Created ${inserted} lane seed records for paint/electrical/flooring/Jan-San/MRO.`,payload:{inserted}});
  return { inserted };
}

async function seedBdrMemberAccounts() {
  await ensureSchema();
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
  const score = priority => priority === 'Very High' ? 94 : priority === 'High' ? 88 : 78;
  let inserted = 0;
  let updated = 0;
  for (const [company, industry, lanes, priority, footprint] of members) {
    const notes = `BDR strategic account. Industry: ${industry}. Footprint: ${footprint}. Procura-fit lanes: ${lanes}. Best targets: supplier diversity, indirect procurement, facilities procurement/category managers.`;
    const signal = `Billion Dollar Roundtable member with formal supplier diversity mandate; potential eligible indirect/facility spend across ${lanes}.`;
    const existing = await db.query(`SELECT id FROM procura_opportunities WHERE lower(company)=lower($1) AND source='bdr_member_research' LIMIT 1`, [company]);
    if (existing.rows.length) {
      await db.query(`UPDATE procura_opportunities SET opportunity_signal=$2, notes=$3, priority_score=$4, updated_at=NOW() WHERE id=$1`, [existing.rows[0].id, signal, notes, score(priority)]);
      updated++;
    } else {
      await db.query(`INSERT INTO procura_opportunities (company,lane,market,buyer_type,decision_maker,title,opportunity_signal,estimated_value_band,priority_score,status,approval_status,notes,source,source_url) VALUES ($1,'multi','National',$2,$3,$3,$4,$5,$6,'researched','not_requested',$7,'bdr_member_research',$8)`, [company, `${industry} / enterprise facilities and indirect procurement`, 'Supplier Diversity / Indirect Procurement / Facilities Procurement', signal, 'Enterprise account; pilot value unknown until category/site fit confirmed', score(priority), notes, 'https://www.supplierdiversity.com/blog/the-43-companies-spending-1-billion-or-more-with-diverse-suppliers/']);
      inserted++;
    }
  }
  await createApprovalIfMissing({
    itemType: 'research',
    itemId: null,
    title: 'Approve Procura BDR top-8 contact enrichment push',
    summary: 'BDR attack package is ready. Next execution step: use Apollo to enrich supplier diversity, facilities procurement, and indirect/category contacts for CBRE, CVS Health, Kroger, Walmart, JPMorgan Chase, Bank of America, Kaiser Permanente, and Amazon. No emails will be sent without exact approval.',
    actionType: 'none',
    actionPayload: { top_accounts: ['CBRE','CVS Health','Kroger','Walmart','JPMorgan Chase','Bank of America','Kaiser Permanente','Amazon'], lanes: ['Jan/San','MRO','Paint','Electrical','Flooring'] },
    agentKey: 'procura_apollo_agent',
    riskLevel: 'medium',
  });
  await logActivity({agentKey:'procura_scout_agent', eventType:'bdr_member_research_seeded', title:'BDR member accounts added to Procura Command', detail:`Seeded ${inserted}, updated ${updated} Billion Dollar Roundtable strategic accounts.`, payload:{inserted,updated,total:members.length}});
  return { inserted, updated, total: members.length };
}

function outreachCopy(opportunity) {
  const lane = laneLabel(opportunity.lane);
  const firstName = String(opportunity.decision_maker || opportunity.name || '').split(/\s+/)[0].replace(/[,]/g,'') || 'there';
  const subject = `Procurement support for ${lane} supplies`;
  const body = `Hi ${firstName},\n\nI’m Trey Zackery with Brinker Group. We’re building Procura as a practical sourcing lane for facility and operations teams that need dependable pricing and fulfillment across categories like ${lane}, Jan/San, MRO, paint, electrical, and flooring.\n\nI’m not trying to add noise to your inbox — I’m looking for teams that occasionally need a second source, quote support, or a cleaner way to compare supply options.\n\nIf you’re the right person, is there a current category, recurring item list, or upcoming buy where a second quote would be useful? If not, who usually owns that for your team?\n\nThanks,\nTrey Zackery\nBrinker Group`;
  return { subject, body };
}

async function draftOutreachBatch({ limit=10 }={}) {
  await ensureSchema();
  const prospects = await db.query(`SELECT * FROM procura_opportunities WHERE email IS NOT NULL AND status IN ('researched','ready_for_approval','approved') AND approval_status <> 'rejected' AND id NOT IN (SELECT opportunity_id FROM procura_campaign_recipients WHERE opportunity_id IS NOT NULL) ORDER BY priority_score DESC, created_at DESC LIMIT $1`, [limit]);
  if (!prospects.rows.length) {
    await logActivity({agentKey:'procura_outreach_agent',eventType:'outreach_no_contacts',title:'No sendable Procura contacts yet',detail:'Apollo/web enrichment must add verified emails before outreach drafts can be created.'});
    return { drafted: 0, message: 'No sendable Procura contacts yet.' };
  }
  const campaign = await db.query(`INSERT INTO procura_campaigns (name,lane,channel,objective,subject,body,cta,status,approval_status,owner_agent_key) VALUES ($1,'multi','email',$2,'Procura supply/category support','Approval-gated individualized buyer outreach.','Ask for current category / recurring item list / second quote need.','ready_for_approval','pending','procura_outreach_agent') RETURNING *`, [`Procura ${prospects.rows.length}-target buyer batch ${new Date().toISOString().slice(0,10)}`, 'Market-test Procura sourcing/procurement opportunity across paint, electrical, flooring, Jan/San, and MRO.']);
  let recipients=0;
  for (const p of prospects.rows) {
    const copy = outreachCopy(p);
    await db.query(`INSERT INTO procura_campaign_recipients (campaign_id,opportunity_id,email,name,company,personalized_opening,final_subject,final_body,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ready_for_approval')`, [campaign.rows[0].id,p.id,p.email,p.decision_maker,p.company,`${p.company} appears relevant for ${laneLabel(p.lane)} / facilities procurement.`,copy.subject,copy.body]);
    recipients++;
  }
  await createApprovalIfMissing({ itemType:'campaign', itemId:campaign.rows[0].id, title:`Approve Procura outreach campaign: ${recipients}-target batch`, summary:`${recipients} individualized Brinker/Procura outreach drafts are ready.\n\nSender/signature: Trey Zackery, Brinker Group.\nGeography: national.\nLanes: paint, electrical, flooring, Jan/San, MRO.\n\nApproval will queue/send only after exact review. No EVP title used.`, actionType:'queue_campaign', actionPayload:{ campaign_id: campaign.rows[0].id, recipients }, agentKey:'procura_outreach_agent', riskLevel:'high' });
  await logActivity({agentKey:'procura_outreach_agent',eventType:'outreach_drafted',title:'Procura outreach batch drafted',detail:`Drafted ${recipients} approval-gated buyer emails.`,payload:{campaign_id:campaign.rows[0].id,recipients}});
  return { drafted: recipients, campaign_id: campaign.rows[0].id, message: `Drafted ${recipients} Procura outreach emails for approval.` };
}

async function runAgent(agentKey, options={}) {
  await ensureSchema();
  const found = await db.query(`SELECT key FROM procura_agents WHERE key=$1`, [agentKey]);
  if (!found.rows.length) return { ok:false, status:404, error:'Procura agent not found' };
  await updateAgent(agentKey, { status:'running', current_work:'Manual/daily run started.', last_run_at:new Date() });
  try {
    let result;
    if (agentKey === 'procura_scout_agent') result = await seedLaneOpportunities();
    else if (agentKey === 'procura_outreach_agent') result = await draftOutreachBatch(options);
    else if (agentKey === 'procura_scoreboard_agent') { result = await getSummary(); await logActivity({eventType:'scoreboard_refresh',title:'Procura scoreboard refreshed',detail:result.executive_summary.headline}); }
    else if (agentKey === 'procura_apollo_agent') { await logActivity({agentKey,eventType:'apollo_manual_needed',title:'Apollo bridge is local-script driven',detail:'Run scripts/procura-apollo-bridge.js from local machine so it can use logged-in Chrome.'}); result = { message:'Use local Procura Apollo bridge for browser-based Apollo enrichment.' }; }
    else { result = { message:'Agent placeholder ready; no external actions performed.' }; await logActivity({agentKey,eventType:'agent_run',title:`${agentKey} checked in`,detail:result.message}); }
    await updateAgent(agentKey, { status:'idle', current_work:'Run complete.', last_output: result.message || JSON.stringify(result).slice(0,500) });
    return { ok:true, result };
  } catch (err) {
    await updateAgent(agentKey, { status:'error', current_work:'Run failed.', last_output:err.message });
    return { ok:false, status:500, error:err.message };
  }
}

async function approveItem(id, notes='') {
  await ensureSchema();
  const r = await db.query(`SELECT * FROM procura_approvals WHERE id=$1`, [id]);
  if (!r.rows.length) return { ok:false, status:404, error:'Approval not found' };
  const item = r.rows[0];
  let result = { status:'recorded', message:'Approval recorded. External Procura sending still requires Exchange sending path to be explicitly wired/tested.' };
  if (item.action_type === 'mark_opportunity_approved' && item.item_id) {
    await db.query(`UPDATE procura_opportunities SET status='approved', approval_status='approved', updated_at=NOW() WHERE id=$1`, [item.item_id]);
    result = { status:'done', message:'Opportunity marked approved.' };
  } else if (item.action_type === 'queue_campaign' && item.item_id) {
    await db.query(`UPDATE procura_campaigns SET status='approved', approval_status='approved', updated_at=NOW() WHERE id=$1`, [item.item_id]);
    await db.query(`UPDATE procura_campaign_recipients SET status='approved', updated_at=NOW() WHERE campaign_id=$1 AND status='ready_for_approval'`, [item.item_id]);
    result = { status:'queued', message:'Procura campaign approved inside command center. Sending is not automatic until Exchange SMTP path is connected and tested.' };
  }
  await db.query(`UPDATE procura_approvals SET status='executed', decision_notes=$2, decided_at=NOW(), executed_at=NOW(), action_result=$3::jsonb, updated_at=NOW() WHERE id=$1`, [id, notes, JSON.stringify(result)]);
  await logActivity({agentKey:item.requested_by_agent_key || 'procura_scoreboard_agent',eventType:'approval_executed',title:item.title,detail:result.message,payload:{approval_id:id,result}});
  return { ok:true, result };
}
async function rejectItem(id, status='needs_edits', notes='') { await ensureSchema(); await db.query(`UPDATE procura_approvals SET status=$2, decision_notes=$3, decided_at=NOW(), updated_at=NOW() WHERE id=$1`, [id,status,notes]); return { ok:true, message: status==='needs_edits'?'Marked needs edits. Edit/resubmit in Procura Command.':'Rejected.' }; }
async function editApprovalItem(id, body={}) { await ensureSchema(); const summary=body.summary || body.email_body || ''; const payload = {}; if (body.email_subject) payload.subject=body.email_subject; if (body.email_body) payload.body=body.email_body; await db.query(`UPDATE procura_approvals SET summary=COALESCE(NULLIF($2,''),summary), action_payload=action_payload || $3::jsonb, status='pending', decision_notes=$4, updated_at=NOW() WHERE id=$1`, [id,summary,JSON.stringify(payload),body.notes || 'Edited/resubmitted in Procura Command']); return { ok:true, message:'Edited and resubmitted for approval.' }; }

module.exports = { LANES, TARGET_TITLES, ensureSchema, getSummary, listApprovals, listOpportunities, listCampaigns, seedBdrMemberAccounts, runAgent, approveItem, rejectItem, editApprovalItem, logActivity, scoreOpportunity };
