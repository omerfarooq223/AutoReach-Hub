#!/usr/bin/env bash

# AutoReach Hub - 1-Click Launcher for macOS & Linux
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "=================================================="
echo "  🚀 Starting AutoReach Hub"
echo "  Excel to WhatsApp & Email Automation"
echo "=================================================="

# Check for Python 3
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 was not found on your system. Please install Python 3.9+ from https://python.org"
    exit 1
fi

# Set up virtual environment if not present
if [ ! -d ".venv" ]; then
    echo "📦 Creating virtual environment (.venv)..."
    python3 -m venv .venv
fi

# Activate virtual environment
source .venv/bin/activate

# Install / update dependencies
echo "🔍 Checking dependencies..."
pip install -r requirements.txt --quiet

# Open browser after 1.5 seconds in background
(sleep 1.5 && (open "http://127.0.0.1:5001" 2>/dev/null || xdg-open "http://127.0.0.1:5001" 2>/dev/null || true)) &

echo ""
echo "✨ AutoReach Hub is running at: http://127.0.0.1:5001"
echo "Press Ctrl+C to stop the server anytime."
echo "=================================================="
echo ""

# Start the Flask app
python3 app.py
