#!/usr/bin/env python3
"""
AutoReach Hub — Unified Entrypoint
Run the web dashboard or CLI tool from a single clean script.

Usage:
  python main.py                  # Launches the Glassmorphic Web Dashboard (default)
  python main.py --port 8080      # Launches web dashboard on custom port
  python main.py --cli [options]  # Runs the command-line interface
"""

import sys
from pathlib import Path

# Add src to Python module path
SRC_DIR = Path(__file__).resolve().parent / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] in ["--cli", "-c"]:
        from autoreach.cli import run_cli
        # Pass remaining arguments to CLI parser
        run_cli(sys.argv[2:])
    else:
        import argparse
        parser = argparse.ArgumentParser(description="AutoReach Hub - Web Dashboard & CLI Launcher")
        parser.add_argument("--host", default="0.0.0.0", help="Host address to bind to (default: 0.0.0.0)")
        parser.add_argument("--port", type=int, default=8080, help="Port to run on (default: 8080)")
        parser.add_argument("--no-debug", action="store_true", help="Disable debug mode")
        args, _ = parser.parse_known_args()

        from autoreach.app import run_server
        print(f"🚀 Starting AutoReach Hub Web Server on http://{args.host}:{args.port}")
        run_server(host=args.host, port=args.port, debug=not args.no_debug)
