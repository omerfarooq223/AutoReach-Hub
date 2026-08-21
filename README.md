# 🚀 AutoReach Hub - Excel to WhatsApp & Email Automation

An enterprise-ready automation suite designed to read Excel/CSV contact files, clean and extract phone numbers and email addresses, and dispatch personalized messages via:
1. **Official LUMS Microsoft 365 Email** (via Microsoft Graph API & Device Code OAuth2)
2. **Standard SMTP Email** (Gmail App Passwords, custom SMTP servers, with custom `Reply-To`)
3. **WhatsApp Click-to-Chat & Batch Launcher** (`wa.me` links pre-filled with dynamic text)

---

## ✨ Features

- **Smart Column Detection & Normalizer:** Auto-detects `Name`, `Phone`, and `Email` columns from any `.xlsx`, `.xls`, or `.csv` file.
- **International Phone Formatting:** Converts local Pakistani numbers (e.g. `03001234567` or `0300-1234567`) to international digits (`923001234567`) while supporting global country codes (+1, +44, +971, etc.).
- **Dynamic Message Templating:** Use any column header as a placeholder (e.g., `{Name}`, `{Email}`, `{RollNumber}`, `{Department}`, `{MeetingTime}`, `{DueAmount}`).
- **LUMS Microsoft 365 Integration:** Seamless SSO & MFA authentication via Microsoft Device Code Flow (`microsoft.com/devicelogin`). Sent emails are directly recorded in your official LUMS **Sent Items** folder.
- **WhatsApp Direct Dispatch:** One-click launch of WhatsApp Web or Desktop with personalized pre-filled messages—no ban risk.
- **Dual Interfaces:** Modern Glassmorphic Web Dashboard UI + Command-Line CLI tool.

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

### 2. Generate Sample Contacts (Optional)

```bash
python3 create_sample_excel.py
```
This generates `sample_contacts.xlsx` and `sample_contacts.csv` with realistic contact records.

---

## 🖥️ Method 1: Interactive Web Dashboard (Recommended)

Start the local web application:

```bash
python3 app.py
```
Then open your browser at **`http://127.0.0.1:5001`**.

### Using the Web Dashboard:
1. **Sign in with LUMS (M365):** Click **"LUMS / M365: Connect"** in the top bar. Copy the one-time code and authenticate at `microsoft.com/devicelogin`.
2. **Load Contacts:** Drag and drop your `.xlsx`/`.csv` file or click **"Load Sample Data"**.
3. **Customize Message:** Insert placeholders by clicking the tags (e.g., `{Name}`, `{CourseName}`) and watch the live preview update in real time.
4. **Dispatch:**
   - Click **"Send All Emails"** to dispatch batch emails.
   - Click **"Launch All WhatsApp"** to open WhatsApp chats with pre-filled messages.
   - Or trigger single actions row-by-row in the table.

---

## 💻 Method 2: Command Line (CLI)

You can also run the automation completely from the terminal:

### 1. Authenticate with LUMS (One-time setup)
```bash
python3 cli.py --login-lums
```

### 2. Dry Run / Preview
```bash
python3 cli.py --file sample_contacts.xlsx --dry-run
```

### 3. Send Emails via LUMS Microsoft 365
```bash
python3 cli.py --file sample_contacts.xlsx \
  --send-email \
  --email-backend graph \
  --subject "Official Update for {Name}" \
  --email-body "Hello {Name},\n\nYour session for {CourseName} is scheduled for {MeetingTime}.\n\nBest regards,\nLUMS"
```

### 4. Launch WhatsApp Chats
```bash
python3 cli.py --file sample_contacts.xlsx \
  --open-whatsapp \
  --whatsapp-body "Hello {Name}! Your session for {CourseName} is on {MeetingTime}." \
  --wa-delay 2.5
```

---

## 📧 Email Provider Guide

### 1. LUMS Email (`@lums.edu.pk`)
- Uses Microsoft Graph API via OAuth 2.0 Device Code Flow.
- Secure, compliant with LUMS IT policies, and saves to your official Sent folder.

### 2. Gmail / Custom SMTP
- If using Gmail, generate an **App Password** from *Google Account → Security → 2-Step Verification → App Passwords*.
- Configure SMTP settings in the Web UI Settings modal or via `.env`.

---

## 📁 File Structure

```
Automation/
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
├── templates/
│   └── index.html           # Modern Web Dashboard Template
└── static/
    ├── style.css            # Dark Glassmorphism Styling
    └── app.js               # Frontend Controller & Realtime Sync
```
