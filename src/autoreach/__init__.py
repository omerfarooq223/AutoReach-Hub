"""
AutoReach Hub — Smart Multi-Channel Outreach & Automation Platform
"""

__version__ = "2.4.0"
__author__ = "Muhammad Umar Farooq"

from .app import app, run_server
from .cli import run_cli

__all__ = ["app", "run_server", "run_cli", "__version__"]
