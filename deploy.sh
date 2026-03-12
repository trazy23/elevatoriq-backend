#!/bin/bash
set -e

echo "🚀 Deploying ElevatorIQ Backend to DigitalOcean"

# Update system
sudo apt-get update -qq
sudo apt-get install -y -qq curl git nodejs npm

# Clone repo
cd /root
rm -rf elevatoriq-backend 2>/dev/null || true
git clone https://github.com/trazy23/elevatoriq-backend.git
cd elevatoriq-backend

# Install deps
npm ci --omit=dev

# Create .env if needed (will use defaults from .env.example)
if [ ! -f .env ]; then
  cp .env.example .env
  echo "⚠️  .env created from .env.example — update values as needed"
fi

# Install PM2 for process management
sudo npm install -g pm2

# Start app with PM2
pm2 start index.js --name "elevatoriq-backend" --log /root/logs/elevatoriq.log
pm2 save
sudo pm2 startup

# Output status
echo "✅ Backend deployed!"
pm2 status
echo "🔗 API running on port 3001"
echo "📊 Health: http://$(hostname -I | awk '{print $1}'):3001/health"
