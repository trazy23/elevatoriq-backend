require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

// CORS — allow elevatoriq.ai frontend and API subdomain
app.use(cors({
  origin: [
    'https://elevatoriq.ai',
    'https://api.elevatoriq.ai',
    'http://api.elevatoriq.ai',
    'http://localhost:3000', // local dev
    'http://localhost:5173', // Vite dev
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files
const path = require('path');
app.use(express.static(path.join(__dirname, '../elevatoriq-dist')));

// Routes
const casesRouter = require('./src/routes/cases');
const documentsRouter = require('./src/routes/documents');
const reportsRouter = require('./src/routes/reports');
const promptRouter = require('./src/routes/prompt');

app.use('/api/cases', casesRouter);
app.use('/api/cases/:id/documents', documentsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/prompt', promptRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'ElevatorIQ Backend', version: '1.1' });
});

// SPA fallback — serve index.html for client-side routes (MUST be after API routes)
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  res.sendFile(path.join(__dirname, '../elevatoriq-dist/index.html'));
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
  });
}
