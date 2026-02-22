export default function handler(req, res) {
  // Simple health check for testing
  if (req.url === '/health' || req.url === '/api/health') {
    return res.status(200).json({ status: 'ok', service: 'ElevatorIQ Backend', version: '1.1' });
  }
  
  // For now, return 200 on all other routes to test connectivity
  return res.status(200).json({ message: 'ElevatorIQ Backend running', path: req.url });
}
