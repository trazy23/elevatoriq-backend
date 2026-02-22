require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors({
  origin: [
    'https://elevatoriq.ai',
    'https://www.elevatoriq.ai',
    'http://localhost:3000',
    'http://localhost:5173',
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'ElevatorIQ Backend', version: '1.1' });
});

// API Routes
const casesRouter = require('../src/routes/cases');
const documentsRouter = require('../src/routes/documents');
const reportsRouter = require('../src/routes/reports');

app.use('/api/cases', casesRouter);
app.use('/api/cases/:id/documents', documentsRouter);
app.use('/api/reports', reportsRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Export for Vercel serverless
module.exports = app;
