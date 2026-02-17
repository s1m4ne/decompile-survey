#!/bin/bash

# Screening App Startup Script
# Usage: ./start.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Ensure Homebrew binaries are in PATH
export PATH="/opt/homebrew/bin:$PATH"

echo "Starting Screening App..."

# Clear any activated venv to avoid conflicts with uv
unset VIRTUAL_ENV

# Start backend
echo "Starting backend on http://localhost:8000"
cd backend
.venv/bin/uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!
cd ..

# Start frontend
echo "Starting frontend on http://localhost:5173"
cd frontend
npm install --silent
npm run dev &
FRONTEND_PID=$!
cd ..

# Trap to kill both processes on exit
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT

echo ""
echo "========================================"
echo "  Screening App is running!"
echo "  Open http://localhost:5173 in your browser"
echo "  Press Ctrl+C to stop"
echo "========================================"
echo ""

# Wait for any process to exit
wait
