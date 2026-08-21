import os
from pathlib import Path
from dotenv import load_dotenv

# Path references
PACKAGE_DIR = Path(__file__).resolve().parent
BASE_DIR = PACKAGE_DIR.parent.parent  # Repository root

# Load .env from repository root if present
load_dotenv(BASE_DIR / ".env")

# Microsoft 365 / Graph API Configuration
MS_CLIENT_ID = os.getenv("MS_CLIENT_ID", "04b07795-8ddb-461a-bbee-02f9e1bf7b46")
MS_AUTHORITY = os.getenv("MS_AUTHORITY", "https://login.microsoftonline.com/organizations")
MS_SCOPES = ["https://graph.microsoft.com/Mail.Send", "https://graph.microsoft.com/User.Read"]
TOKEN_CACHE_FILE = BASE_DIR / ".token_cache.bin"

# Default SMTP Configuration
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USE_SSL = os.getenv("SMTP_USE_SSL", "false").lower() == "true"
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() == "true"
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
DEFAULT_FROM_NAME = os.getenv("DEFAULT_FROM_NAME", "AutoReach Dispatcher")
DEFAULT_REPLY_TO = os.getenv("DEFAULT_REPLY_TO", "")

# WhatsApp Configuration
DEFAULT_COUNTRY_CODE = os.getenv("DEFAULT_COUNTRY_CODE", "92")  # Pakistan +92 by default

# Google Gemini AI API Key
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# Upload directory
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
