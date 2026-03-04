require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

// CORS — allow elevatoriq.ai frontend
app.use(cors({
  origin: [
    'https://elevatoriq.ai',
    'http://localhost:3000', // local dev
    'http://localhost:5173', // Vite dev
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
const casesRouter = require('../src/routes/cases');
const documentsRouter = require('../src/routes/documents');
const reportsRouter = require('../src/routes/reports');
const invoiceRouter = require('../src/routes/invoice');

app.use('/api/cases', casesRouter);
app.use('/api/cases/:id/documents', documentsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/invoice', invoiceRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'ElevatorIQ Backend', version: '1.1' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Export Express app directly for Vercel
module.exports = app;
