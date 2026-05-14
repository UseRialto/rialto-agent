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

echo "Starting Rialto Agent web app at http://localhost:3000"
echo "Press Ctrl+C to stop."
npm run dev:web
