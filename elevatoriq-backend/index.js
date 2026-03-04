require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

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
  'https://api.elevatoriq.ai',
  'http://api.elevatoriq.ai',
  'http://localhost:3000',
  'http://localhost:5173',
].filter(Boolean)));

// CORS
app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const distPath = process.env.FRONTEND_DIST_PATH || '/root/elevatoriq-dist';
const hasDist = fs.existsSync(distPath);

console.log(`[init] Serving static files from: ${distPath}`);
console.log(`[init] Static dist present: ${hasDist}`);
if (hasDist) {
  app.use(express.static(distPath));
}

// Routes
const casesRouter = require('./src/routes/cases');
const documentsRouter = require('./src/routes/documents');
const reportsRouter = require('./src/routes/reports');
const promptRouter = require('./src/routes/prompt');
const invoiceRouter = require('./src/routes/invoice');

app.use('/api/cases', casesRouter);
app.use('/api/cases/:id/documents', documentsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/prompt', promptRouter);
app.use('/api/invoice', invoiceRouter);

// Health checks
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'ElevatorIQ Backend', version: '1.2.0' });
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
    'REDIS_HOST',
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
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Export app for Vercel serverless
module.exports = app;

// Listen locally for development
if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`[ElevatorIQ] Backend running on port ${PORT}`);
    console.log(`[ElevatorIQ] Health: http://localhost:${PORT}/health`);
    console.log(`[ElevatorIQ] Readyz: http://localhost:${PORT}/readyz`);
  });
}
