require('dotenv').config();
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3001;

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'ElevatorIQ Backend' });
});

app.get('/readyz', (req, res) => {
  res.json({ status: 'ready' });
});

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
