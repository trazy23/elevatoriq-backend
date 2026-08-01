require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const { runAggregation } = require('./src/workers/aggregationJob');
const db = require('./src/db');
const { addJob } = require('./src/workers/analysisWorker');

const app = express();
app.set('trust proxy', 1);

function parseCsvEnv(value = '') {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const allowedOrigins = Array.from(new Set([
  ...parseCsvEnv(process.env.CORS_ORIGINS),
  process.env.FRONTEND_ORIGIN,
  process.env.API_ORIGIN,
  'https://elevatoriq.ai',
  'https://www.elevatoriq.ai',
  'https://api.elevatoriq.ai',
  'http://api.elevatoriq.ai',
  'http://localhost:3000',
  'http://localhost:5173',
].filter(Boolean)));

// CORS
app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key'],
}));

// Routes
const casesRouter = require('./src/routes/cases');
const documentsRouter = require('./src/routes/documents');
const reportsRouter = require('./src/routes/reports');
const promptRouter = require('./src/routes/prompt');
const invoiceRouter = require('./src/routes/invoice');
const adminRouter = require('./src/routes/admin');
const { router: paymentsRouter, handleStripeWebhook } = require('./src/routes/payments');
const scopeGeneratorRouter = require('./src/routes/scope-generator');
const subscribeRouter = require('./src/routes/subscribe');
const portfolioRouter = require('./src/routes/portfolio');

// Stripe webhook — MUST use raw body and MUST be registered before express.json().
// If express.json() runs first, Stripe signature verification receives a parsed object
// instead of the original Buffer and real webhooks fail.
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), handleStripeWebhook);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Serve admin dashboard at /admin
app.use('/admin', express.static(path.join(__dirname, 'admin')));

const distPath = process.env.FRONTEND_DIST_PATH || '/root/elevatoriq-dist';
const hasDist = fs.existsSync(distPath);

console.log(`[init] Serving static files from: ${distPath}`);
console.log(`[init] Static dist present: ${hasDist}`);
if (hasDist) {
  app.use(express.static(distPath));
}

app.use('/api/cases', casesRouter);
app.use('/api/cases/:id/documents', documentsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/prompt', promptRouter);
app.use('/api/invoice', invoiceRouter);
app.use('/api/admin', adminRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/v1/scope-generator', scopeGeneratorRouter);
app.use('/api/subscribe', subscribeRouter);
app.use('/api/portfolio', portfolioRouter);

// Health checks
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'ElevatorIQ Backend', version: '1.2.0' });
});

// Public queue status — returns active/waiting counts without sensitive data.
// Used by the frontend to show queue position messaging.
app.get('/api/queue-status', async (req, res) => {
  try {
    const { getQueueStatus } = require('./src/workers/analysisWorker');
    const status = await getQueueStatus();
    // Only expose counts publicly, not backend details
    res.json({
      active: status.active,
      waiting: status.waiting,
      concurrency: status.concurrency,
    });
  } catch (err) {
    res.json({ active: 0, waiting: 0, concurrency: 2 });
  }
});

app.get('/readyz', (req, res) => {
  const requiredForCoreApi = [
    'DATABASE_URL',
    // Backward-compat for legacy env naming in existing deployments
    ...(process.env.DATABASE_URL ? [] : ['DATABASE_URL_']),
  ];

  const requiredForFullPipeline = [
    'ANTHROPIC_API_KEY',
    'AWS_BUCKET',
    'AWS_REGION',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'EMAIL_PROVIDER_API_KEY',
    'FROM_EMAIL',
    'STRIPE_WEBHOOK_SECRET',
    ...(process.env.NODE_ENV === 'production' ? ['TURNSTILE_SECRET_KEY'] : []),
    ...(process.env.REDIS_ENABLED === 'true' ? ['REDIS_HOST'] : []),
  ];

  const missingCore = requiredForCoreApi.filter((key) => !process.env[key]);
  const missingFull = requiredForFullPipeline.filter((key) => !process.env[key]);

  const ready = missingCore.length === 0;
  const fullPipelineReady = ready && missingFull.length === 0;

  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not_ready',
    full_pipeline_status: fullPipelineReady ? 'ready' : 'degraded',
    checks: {
      core_api: {
        required: requiredForCoreApi,
        missing: missingCore,
      },
      full_pipeline: {
        required: requiredForFullPipeline,
        missing: missingFull,
        queue_backend: process.env.REDIS_ENABLED === 'true' ? 'redis_bull' : 'semaphore_fallback',
      },
      frontend_static: {
        dist_path: distPath,
        available: hasDist,
      },
      cors_origins: allowedOrigins,
    },
  });
});

// SPA fallback — serve index.html for client-side routes (MUST be after API routes)
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API route not found' });
  }

  if (!hasDist) {
    return res.status(404).json({ error: 'Frontend bundle unavailable on API host' });
  }

  const indexPath = path.join(distPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error('[SPA fallback] Error serving index.html:', err.message);
      res.status(500).json({ error: 'Could not serve index.html' });
    }
  });
});

// Error handler
app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({
      code: 'request_body_too_large',
      error: 'Request body too large. Upload documents as PDF, DOC, or DOCX files up to 50 MB each.',
    });
  }

  if (err?.name === 'MulterError' && err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      code: 'file_too_large',
      error: 'File exceeds the 50 MB upload limit. Please compress the file or upload a smaller PDF, DOC, or DOCX.',
    });
  }

  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Export app for Vercel serverless
module.exports = app;

// Schedule daily aggregation job — runs at 3:00 AM every day
// Only runs if DATABASE_URL is present (i.e., production or staging)
if (process.env.DATABASE_URL && process.env.NODE_ENV !== 'test') {
  cron.schedule('0 3 * * *', () => {
    console.log('[Cron] Running daily aggregation job...');
    runAggregation()
      .then((version) => console.log(`[Cron] Aggregation complete. New version: ${version}`))
      .catch((err) => console.error('[Cron] Aggregation failed:', err.message));
  }, { timezone: 'America/Chicago' });
  console.log('[Cron] Aggregation job scheduled for 3:00 AM CT daily');

  // Schedule nurture email processing — runs every hour
  cron.schedule('0 * * * *', () => {
    console.log('[Cron] Processing nurture email queue...');
    const { processNurtureQueue } = require('./src/services/nurtureService');
    processNurtureQueue()
      .then(({ processed, failed }) => {
        console.log(`[Cron] Nurture processing complete: ${processed} sent, ${failed} failed`);
      })
      .catch((err) => console.error('[Cron] Nurture processing failed:', err.message));
  });
  console.log('[Cron] Nurture email processing scheduled every hour');
}

// ─── Orphan recovery: find and re-queue stuck cases ──────────────────────────
// Cases stuck in 'processing' or 'pending' with no completed report after
// STALE_THRESHOLD minutes are assumed to have been killed mid-flight.
// Called at startup AND on a 10-minute cron to catch cases orphaned between deploys.
async function recoverOrphanedJobs(source = 'Startup') {
  const STALE_THRESHOLD_MINUTES = 8; // 8 min: longer than typical Claude + PDF pipeline, shorter than user wait tolerance
  try {
    const result = await db.query(
      `SELECT c.id, c.status, c.created_at
       FROM cases c
       LEFT JOIN reports r ON r.case_id = c.id
       WHERE c.status NOT IN ('complete', 'failed')
         AND c.payment_status != 'pending_payment'
         AND r.id IS NULL
         AND c.created_at < NOW() - INTERVAL '${STALE_THRESHOLD_MINUTES} minutes'
       ORDER BY c.created_at ASC`,
    );
    if (result.rows.length === 0) {
      console.log(`[${source}] No orphaned jobs found.`);
      return { recovered: 0 };
    }
    console.log(`[${source}] Recovering ${result.rows.length} orphaned job(s)...`);
    let recovered = 0;
    for (const row of result.rows) {
      try {
        const ageMinutes = Math.round((Date.now() - new Date(row.created_at).getTime()) / 60000);
        console.log(`[${source}] Re-queuing case: ${row.id} (status: ${row.status}, age: ${ageMinutes}m)`);
        await db.query(`UPDATE cases SET status='pending' WHERE id=$1`, [row.id]);
        await addJob(row.id);
        recovered++;
      } catch (jobErr) {
        console.error(`[${source}] Failed to re-queue case ${row.id}:`, jobErr.message);
      }
    }
    console.log(`[${source}] Recovery complete: ${recovered}/${result.rows.length} re-queued.`);
    return { recovered };
  } catch (err) {
    console.warn(`[${source}] Orphan recovery check failed (non-fatal):`, err.message);
    return { recovered: 0, error: err.message };
  }
}

// ─── 10-minute health check cron ─────────────────────────────────────────────
// Render free tier kills in-flight workers on each deploy. Between deploys,
// a case could sit stuck indefinitely. This cron proactively recovers them
// without needing a new deploy or manual Supabase intervention.
if (process.env.DATABASE_URL && process.env.NODE_ENV !== 'test') {
  cron.schedule('*/10 * * * *', () => {
    recoverOrphanedJobs('HealthCheck')
      .then(({ recovered }) => {
        if (recovered > 0) {
          console.log(`[HealthCheck] Recovered ${recovered} stuck case(s).`);
        }
      })
      .catch((err) => console.error('[HealthCheck] Cron failed:', err.message));
  });
  console.log('[Cron] Stuck-case health check scheduled every 10 minutes');
}

// Listen locally for development
if (require.main === module) {
  // Render will set PORT automatically
  const PORT = process.env.PORT || 3001;
  const { runMigrations } = require('./src/migrate');

  // Apply any outstanding migrations before accepting traffic.
  // If migrations fail hard, refuse to start — a server running
  // against a broken schema is worse than one that won't start.
  runMigrations()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`[ElevatorIQ] Backend running on port ${PORT}`);
        console.log(`[ElevatorIQ] Health: http://localhost:${PORT}/health`);
        console.log(`[ElevatorIQ] Readyz: http://localhost:${PORT}/readyz`);
        // Delay slightly so DB connections are warm before scanning
        setTimeout(() => recoverOrphanedJobs('Startup'), 5000);
      });
    })
    .catch((err) => {
      console.error('[Startup] Migration failed — refusing to start:', err.message);
      process.exit(1);
    });
}
