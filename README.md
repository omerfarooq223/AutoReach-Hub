# 🚀 AutoReach Hub — Smart Multi-Channel Outreach & Automation

<div align="center">

[![Python](https://img.shields.io/badge/Python-3.9+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![Flask](https://img.shields.io/badge/Flask-3.0+-000000?style=for-the-badge&logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
[![Google Gemini](https://img.shields.io/badge/Google%20Gemini-AI%20Powered-8E75B2?style=for-the-badge&logo=google-gemini&logoColor=white)](https://ai.google.dev/)
[![Microsoft 365](https://img.shields.io/badge/Microsoft%20365-OAuth2%20SSO-0078D4?style=for-the-badge&logo=microsoft&logoColor=white)](https://developer.microsoft.com/graph)
[![WhatsApp](https://img.shields.io/badge/WhatsApp-Click--to--Chat-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)](https://whatsapp.com)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)

<p align="center">
  <strong>An enterprise-grade, privacy-first automation platform that streamlines multi-category contact management, generates high-converting AI cold copy, and dispatches personalized emails and WhatsApp messages at scale.</strong>
</p>

[Explore Features](#-key-features) • [Dashboard Tour](#-visual-walkthrough) • [Quick Start](#-quick-start) • [Configuration](#%EF%B8%8F-configuration) • [Architecture](#-architecture)

</div>

---

## 📸 Visual Walkthrough

### 1. Modern Glassmorphic Dashboard & Multi-Channel Dispatcher
Intuitive 3-step workflow: Upload roster, generate personalized messages with Gemini AI, and execute targeted campaigns via Microsoft 365 or WhatsApp.

<div align="center">
  <img src="./docs/screenshots/dashboard_overview.png" alt="AutoReach Hub Main Dashboard" width="100%" style="border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.5);">
</div>

<br/>

### 2. Live Dynamic Preview & Real-Time Dispatch Terminal
Inspect per-contact variable substitutions in real-time (`{Name}`, `{CourseName}`, `{MeetingTime}`) with live terminal logging and deliverability health checks.

<div align="center">
  <img src="./docs/screenshots/category_and_campaign.png" alt="Live Dynamic Preview and Activity Console" width="100%" style="border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.5);">
</div>

---

## ✨ Key Features

| Feature | Description |
| :--- | :--- |
| **🪄 Google Gemini AI Assistant** | Integrated copywriter generating contextual subject lines, email bodies, and WhatsApp messages with selectable tone presets (*Professional, Friendly, Urgent, Academic, Persuasive*). |
| **📁 Category Management** | Tag and group contacts dynamically into custom categories (*e.g., VIP, Leads, Students, Partners*) with multi-category filtering and selective batch targeting. |
| **🔐 Microsoft 365 Graph API** | Native SSO & MFA authentication via Microsoft Device Code Flow (`microsoft.com/devicelogin`). Sent emails appear directly in your official institutional **Sent Items** mailbox. |
| **⚡ SMTP Multi-Provider** | Support for Gmail App Passwords and custom SMTP relays with customizable `From Name` and `Reply-To` headers. |
| **💬 UTF-8 WhatsApp Launcher** | Generates zero-ban-risk `wa.me` links with UTF-8 URL encoding, fully preserving emojis (👋, 🚀, 🎉) and international formatting. |
| **🩺 Phone & Email Health** | Uses Google's `libphonenumber` to auto-normalize international prefixes (+1, +44, +92, etc.) and highlight malformed records. |
| **🏷️ Dynamic Variable Engine** | Use any column from your Excel or CSV as a tag (`{Name}`, `{Email}`, `{RollNumber}`, `{Department}`, `{DueAmount}`) with instantaneous live preview. |
| **📱 Mobile-Ready Responsive UI** | Control campaigns on your local Wi-Fi from iPhone, iPad, or Android devices with native WhatsApp app deep-linking. |

---

## 🚀 Quick Start

### Prerequisites
- **Python 3.9+** installed on your system.

### 1. Clone the Repository
```bash
git clone https://github.com/omerfarooq223/AutoReach-Hub.git
cd AutoReach-Hub
```

### 2. One-Click Launchers

#### 🍎 macOS & 🐧 Linux:
```bash
chmod +x run.sh
./run.sh
```

#### 🪟 Windows:
```cmd
run.bat
```

> **Note:** The 1-click launcher automatically creates `.venv`, installs dependencies from `requirements.txt`, opens your default browser at `http://127.0.0.1:8080`, and runs the server.

---

### Manual Setup (Alternative)

```bash
# 1. Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate       # On Windows use: .venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Start the application (Web UI or CLI)
python3 main.py                 # Launches Web Dashboard
python3 main.py --cli --help    # Or run via Command-Line Interface
```
Visit **`http://127.0.0.1:8080`** in your browser.

---

## ⚙️ Configuration

Create a `.env` file in the root directory (copied from [`.env.example`](.env.example)):

```env
# Google Gemini AI API Key (for smart AI message composer)
GEMINI_API_KEY=your_gemini_api_key_here

# Microsoft 365 / Graph API Configuration (Device Code Flow)
MS_CLIENT_ID=04b07795-8ddb-461a-bbee-02f9e1bf7b46
MS_AUTHORITY=https://login.microsoftonline.com/organizations

# SMTP Email Configuration (Gmail / Custom SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USE_SSL=false
SMTP_USE_TLS=true
SMTP_USERNAME=your_email@gmail.com
SMTP_PASSWORD=your_gmail_app_password
DEFAULT_FROM_NAME=Academic / Admin Department
DEFAULT_REPLY_TO=contact@institution.edu

# WhatsApp Defaults
DEFAULT_COUNTRY_CODE=92
```

> 💡 **Tip:** You can also enter and test your **Gemini API Key** and **SMTP credentials** directly inside the web UI Settings Modal.

---

## 📖 Step-by-Step Workflow

```mermaid
graph LR
    A[Upload Excel/CSV] --> B[Smart Column Detection]
    B --> C[Validate & Categorize]
    C --> D[AI Copywriting with Gemini]
    D --> E[Live Per-Contact Preview]
    E --> F1[Dispatch via M365 / SMTP]
    E --> F2[Launch WhatsApp Web/App]
```

1. **Upload Roster:** Drag & drop any `.xlsx`, `.xls`, or `.csv` contact spreadsheet. AutoReach Hub automatically maps columns (`Name`, `Phone`, `Email`, `Category`).
2. **Assign Categories:** Filter or bulk-assign contacts to categories for targeted segmentation.
3. **Draft with Gemini AI:** Select a tone (*Professional, Friendly, Urgent, Persuasive*), describe your campaign objective, and click **Generate Drafts with Gemini**.
4. **Inspect Live Previews:** Slide through individual contacts to inspect real-time variable substitutions before sending.
5. **Execute Dispatch:** 
   - **Email:** One-click dispatch via authenticated Microsoft 365 OAuth2 or secure SMTP relay.
   - **WhatsApp:** Click-to-chat triggers native WhatsApp desktop/web applications with pre-filled, personalized text.

---

## 📱 Mobile Network Access

AutoReach Hub binds to `0.0.0.0`, allowing you to operate campaigns from your smartphone or tablet over the same Wi-Fi network:

1. Locate your computer's local IP address (e.g. `192.168.1.15`).
2. Open your mobile browser: `http://192.168.1.15:8080`
3. Tapping **"WA"** launches the native **WhatsApp mobile application** directly with the formatted message loaded!

---

## 🏗️ Project Architecture

```
AutoReach-Hub/
├── src/
│   └── autoreach/
│       ├── __init__.py          # Package initialization
│       ├── config.py            # Environment & app settings
│       ├── app.py               # Flask REST backend server
│       ├── cli.py               # Command-line interface
│       ├── core/                # Data processing & AI
│       │   ├── __init__.py
│       │   ├── excel_handler.py # Excel/CSV parser, column matcher & category engine
│       │   └── ai_handler.py    # Google Gemini AI prompt generation & copywriter
│       ├── dispatchers/         # Multi-channel delivery providers
│       │   ├── __init__.py
│       │   ├── graph_mail.py    # Microsoft Graph API OAuth2 Device Code
│       │   ├── smtp_mail.py     # SMTP multi-part & custom headers
│       │   └── whatsapp.py      # WhatsApp Click-to-Chat & Batch URL engine
│       ├── static/              # Dashboard UI stylesheets, scripts & icons
│       │   ├── style.css
│       │   ├── app.js
│       │   ├── favicon.svg
│       │   └── lucide.min.js
│       └── templates/           # HTML dashboard templates
│           └── index.html
├── tests/
│   ├── __init__.py
│   └── test_automation.py       # Unit test suite
├── docs/
│   └── screenshots/             # Visual previews & documentation assets
├── main.py                      # Unified root entrypoint (Web UI & CLI)
├── requirements.txt             # Dependencies
├── .env.example                 # Environment configuration template
├── run.sh                       # 1-Click launcher for macOS & Linux
├── run.bat                      # 1-Click launcher for Windows
└── README.md                    # Project documentation
```

---

## 🧪 Running Unit Tests

Run the built-in test suite to verify data normalization, category handling, and dispatch engines:

```bash
python3 -m unittest discover -s tests
```

---

## 🛡️ Privacy & Compliance

- **No Remote Database:** All contact lists, Excel files, and campaign logs are processed locally in your machine's memory and local files.
- **Official API Auth:** Microsoft 365 integration uses standard Microsoft Device Code OAuth2 without storing passwords.
- **Zero WhatsApp Ban Risk:** Uses standard `wa.me` Click-to-Chat protocol, ensuring 100% compliance with WhatsApp Terms of Service.

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

<div align="center">
  <sub>Engineered with ❤️ by <strong>Muhammad Umar Farooq</strong></sub>
</div>
