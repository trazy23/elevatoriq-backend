#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
require('dotenv').config({ path: path.join(os.homedir(), '.hermes', 'secrets', 'elevatoriq-render.env') });
const procura = require('../src/services/procuraCommandService');
procura.getSummary().then(s => {
  console.log(JSON.stringify({
    total: s.opportunities.total,
    with_email: s.opportunities.with_email,
    pending: s.approvals.pending,
    headline: s.executive_summary.headline
  }, null, 2));
  process.exit(0);
}).catch(e => { console.error(e.stack || e.message); process.exit(1); });
