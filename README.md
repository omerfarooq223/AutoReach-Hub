# 🚀 AutoReach Hub - Smart Multi-Channel Dispatcher

An enterprise-ready automation suite designed to read Excel/CSV contact files, clean and extract phone numbers and email addresses, generate smart copy with **Google Gemini AI**, and dispatch personalized messages via:
1. **Microsoft 365 / Institutional Email** (via Microsoft Graph API & Device Code OAuth2)
2. **Standard SMTP Email** (Gmail App Passwords, custom SMTP servers, with custom `Reply-To`)
3. **WhatsApp Click-to-Chat & Batch Launcher** (`wa.me` links pre-filled with dynamic text)

---

## ✨ Features

- **🪄 Google Gemini AI Assistant:** Integrated AI Copywriter to generate personalized Email Subject lines, Email Bodies, and WhatsApp messages in seconds based on custom prompts and selectable tones (Professional, Friendly, Urgent, Academic, Persuasive).
- **📊 Smart Column Detection & Normalizer:** Auto-detects `Name`, `Phone`, and `Email` columns from any `.xlsx`, `.xls`, or `.csv` file.
- **🌍 International Phone Formatting:** Converts local numbers (e.g. `03001234567` or `0300-1234567`) to international digits (`923001234567`) while supporting global country codes (+1, +44, +971, etc.).
- **🏷️ Dynamic Message Templating:** Use any column header as a placeholder (e.g., `{Name}`, `{Email}`, `{RollNumber}`, `{Department}`, `{MeetingTime}`, `{DueAmount}`).
- **🔐 Microsoft 365 OAuth2 Integration:** Seamless SSO & MFA authentication via Microsoft Device Code Flow (`microsoft.com/devicelogin`). Sent emails are directly recorded in your official **Sent Items** folder.
- **💬 WhatsApp Direct Dispatch:** One-click launch of WhatsApp Web or Desktop with personalized pre-filled messages—no ban risk.
- **📱 Universal Compatibility:** Responsive design optimized for Mac, Windows, Linux, Android, and iOS (iPhone/iPad).
- **🖥️ Dual Interfaces:** Modern Glassmorphic Web Dashboard UI + Command-Line CLI tool.

---

## 🛠️ Quick Start

### 1. Set Up Virtual Environment & Dependencies

```bash
# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install requirements
pip install -r requirements.txt
```

### 2. Configure Gemini AI API Key (Optional)
Create a `.env` file or enter it in the Web UI:
```env
GEMINI_API_KEY=your_gemini_api_key_here
```

### 3. Generate Sample Contacts (Optional)

```bash
python3 create_sample_excel.py
```

---

## 🖥️ Method 1: Interactive Web Dashboard (Recommended)

Start the local web application:

```bash
./run.sh          # on Mac / Linux
run.bat           # on Windows
```
Or manually:
```bash
python3 app.py
```
Then open your browser at **`http://127.0.0.1:8080`**.

### Using the Web Dashboard:
1. **Google Gemini AI Assistant:** Enter a prompt (e.g. *"Draft an urgent fee payment reminder with discount details"*) and click **"Generate Drafts"**.
2. **Sign in with Microsoft 365 (M365):** Click **"Microsoft 365: Connect"** in the top bar. Copy the one-time code and authenticate at `microsoft.com/devicelogin`.
3. **Load Contacts:** Drag and drop your `.xlsx`/`.csv` file or click **"Load Sample Data"**.
4. **Dispatch:**
   - Click **"Send All Emails"** to dispatch batch emails.
   - Click **"Launch All WhatsApp"** to open WhatsApp chats with pre-filled messages.
   - Or trigger single actions row-by-row in the table.

---

## 📱 Mobile Access (Android / iPhone)

While running on your computer, open your mobile browser and go to:
👉 **`http://<YOUR_COMPUTER_IP>:8080`** (e.g., `http://192.168.100.198:8080`)
- Tapping **"WA"** launches the native **WhatsApp mobile app** with pre-filled text!

---

## 📁 File Structure

```
Automation/
├── ai_handler.py            # Google Gemini AI Integration
├── app.py                   # Flask Web Dashboard Backend
├── cli.py                   # Standalone CLI Script
├── config.py                # Configuration & Environment Handler
├── excel_handler.py         # Parser, Column Matcher & Template Engine
├── graph_mail_handler.py    # Microsoft Graph API & MSAL Auth Handler
├── smtp_handler.py          # SMTP Email Dispatcher
├── whatsapp_handler.py      # WhatsApp Link & Dispatch Engine
├── create_sample_excel.py   # Sample Data Generator
├── requirements.txt         # Dependencies
├── .env.example             # Environment Variables Template
├── run.sh                   # 1-Click macOS/Linux Launcher
├── run.bat                  # 1-Click Windows Launcher
├── templates/
│   └── index.html           # Modern Web Dashboard Template
└── static/
    ├── style.css            # Dark Glassmorphism Styling
    └── app.js               # Frontend Controller & Realtime Sync
```
