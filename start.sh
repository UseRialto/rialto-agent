#!/bin/zsh
set -e

cd "$(dirname "$0")"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required to run Rialto Agent."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "Installing root dependencies..."
  npm install
fi

if [ ! -d "apps/web/node_modules" ]; then
  echo "Installing web dependencies..."
  npm install --prefix apps/web
fi

port_pids=$(lsof -tiTCP:3000 -sTCP:LISTEN 2>/dev/null || true)
if [ -n "$port_pids" ]; then
  echo "Stopping stale process on localhost:3000..."
  kill $port_pids 2>/dev/null || true
  sleep 1
fi

next_pids=$(ps -axo pid=,command= | awk '/next dev --webpack|next-server/ && !/awk/ { print $1 }')
if [ -n "$next_pids" ]; then
  echo "Stopping stale Next.js dev process..."
  kill $next_pids 2>/dev/null || true
  sleep 1
fi

remaining_pids=$(lsof -tiTCP:3000 -sTCP:LISTEN 2>/dev/null || true)
if [ -n "$remaining_pids" ]; then
  echo "Force-stopping process still holding localhost:3000..."
  kill -9 $remaining_pids 2>/dev/null || true
  sleep 1
fi

echo "Starting Rialto Agent web app at http://localhost:3000"
echo "Press Ctrl+C to stop."
npm run dev:web
