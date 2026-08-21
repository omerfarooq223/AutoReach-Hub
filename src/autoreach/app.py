import os
import time
from pathlib import Path
from typing import Dict, Any
from flask import Flask, render_template, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename

from .config import (
    UPLOAD_DIR, DEFAULT_COUNTRY_CODE, PACKAGE_DIR,
    SMTP_SERVER, SMTP_PORT, SMTP_USE_SSL, SMTP_USE_TLS,
    SMTP_USERNAME, SMTP_PASSWORD, DEFAULT_FROM_NAME, DEFAULT_REPLY_TO
)
from .core.excel_handler import load_contacts_file, render_message_template
from .core.ai_handler import GeminiAIHandler
from .dispatchers.graph_mail import MicrosoftGraphMailHandler
from .dispatchers.smtp_mail import SMTPMailHandler
from .dispatchers.whatsapp import (
    generate_whatsapp_url,
    generate_whatsapp_app_url,
    generate_batch_links,
    open_batch_in_desktop
)

# Initialize Flask application with explicit package paths
app = Flask(
    __name__,
    template_folder=str(PACKAGE_DIR / "templates"),
    static_folder=str(PACKAGE_DIR / "static")
)
app.config["UPLOAD_FOLDER"] = str(UPLOAD_DIR)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16MB max upload

# Global handler instances
graph_handler = MicrosoftGraphMailHandler()
ai_handler = GeminiAIHandler()

# In-memory session state for loaded contacts
state = {
    "contacts": [],
    "columns": [],
    "detected_mapping": {},
    "file_name": "",
    "country_code": DEFAULT_COUNTRY_CODE,
    "email_template": "Hello {Name},\n\nThis is an official update regarding your course {CourseName}.\n\nBest regards,\nAcademic Department",
    "email_subject": "Update for {Name} - {CourseName}",
    "whatsapp_template": "Hello {Name}! Your session for {CourseName} is scheduled for {MeetingTime}."
}


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/favicon.ico")
def favicon():
    return send_from_directory(
        PACKAGE_DIR / "static",
        "favicon.svg",
        mimetype="image/svg+xml"
    )


@app.route("/api/upload", methods=["POST"])
def upload_file():
    """Handles Excel/CSV file upload."""
    if "file" not in request.files:
        return jsonify({"success": False, "error": "No file part in the request"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"success": False, "error": "No file selected"}), 400

    country_code = request.form.get("country_code", DEFAULT_COUNTRY_CODE)
    state["country_code"] = country_code

    original_ext = Path(file.filename).suffix.lower()
    filename = secure_filename(file.filename)
    if not filename or filename.startswith("."):
        filename = f"contacts_{int(time.time())}{original_ext or '.xlsx'}"

    save_path = Path(app.config["UPLOAD_FOLDER"]) / filename
    file.save(save_path)

    try:
        contacts, columns, detected = load_contacts_file(str(save_path), default_country_code=country_code)
        state["contacts"] = contacts
        state["columns"] = columns
        state["detected_mapping"] = detected
        state["file_name"] = filename

        return jsonify({
            "success": True,
            "file_name": filename,
            "total_contacts": len(contacts),
            "columns": columns,
            "detected": detected,
            "contacts": contacts
        })
    except Exception as e:
        return jsonify({"success": False, "error": f"Failed to parse file: {str(e)}"}), 500


@app.route("/api/re-map", methods=["POST"])
def remap_columns():
    """Re-maps columns when user manually adjusts column dropdowns."""
    data = request.get_json() or {}
    name_col = data.get("name_col")
    phone_col = data.get("phone_col")
    email_col = data.get("email_col")
    campus_id_col = data.get("campus_id_col")
    fallback_domain = data.get("fallback_domain", "institution.edu")
    country_code = data.get("country_code", state["country_code"])
    state["country_code"] = country_code

    if not state["file_name"]:
        return jsonify({"success": False, "error": "No file currently loaded"}), 400

    file_path = Path(app.config["UPLOAD_FOLDER"]) / state["file_name"]
    try:
        custom_mapping = {
            "name_col": name_col,
            "phone_col": phone_col,
            "email_col": email_col,
            "campus_id_col": campus_id_col
        }
        contacts, columns, detected = load_contacts_file(
            str(file_path),
            default_country_code=country_code,
            custom_mapping=custom_mapping,
            fallback_email_domain=fallback_domain
        )
        state["contacts"] = contacts
        state["detected_mapping"] = detected
        return jsonify({
            "success": True,
            "contacts": contacts,
            "detected": detected
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/preview", methods=["POST"])
def preview_message():
    """Generates a live preview for a specific contact."""
    data = request.get_json() or {}
    contact_id = data.get("contact_id")
    subject_tmpl = data.get("subject", "")
    email_tmpl = data.get("email_body", "")
    whatsapp_tmpl = data.get("whatsapp_body", "")

    contact = next((c for c in state["contacts"] if c["id"] == contact_id), None)
    if not contact and state["contacts"]:
        contact = state["contacts"][0]

    if not contact:
        return jsonify({"success": False, "error": "No contact available for preview"})

    rendered_subject = render_message_template(subject_tmpl, contact)
    rendered_email = render_message_template(email_tmpl, contact)
    rendered_wa = render_message_template(whatsapp_tmpl, contact)
    wa_url = generate_whatsapp_url(contact.get("phone_clean"), rendered_wa)

    return jsonify({
        "success": True,
        "contact": contact,
        "preview": {
            "subject": rendered_subject,
            "email_body": rendered_email,
            "whatsapp_body": rendered_wa,
            "whatsapp_url": wa_url
        }
    })


# --- Microsoft Graph API Endpoints ---

@app.route("/api/graph/status", methods=["GET"])
def graph_status():
    """Checks Microsoft Graph API login status."""
    status = graph_handler.get_auth_status()
    return jsonify(status)


@app.route("/api/graph/device-code", methods=["POST"])
def graph_device_code():
    """Starts Device Code login flow for Microsoft 365."""
    try:
        flow = graph_handler.start_device_flow()
        return jsonify({"success": True, "flow": flow})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/graph/poll-token", methods=["POST"])
def graph_poll_token():
    """Polls to check if the user completed device login."""
    try:
        res = graph_handler.poll_device_flow()
        return jsonify(res)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/graph/logout", methods=["POST"])
def graph_logout():
    """Logs out of Microsoft 365."""
    graph_handler.logout()
    return jsonify({"success": True, "message": "Logged out successfully"})


# --- SMTP Endpoints ---

@app.route("/api/smtp/test", methods=["POST"])
def smtp_test():
    """Tests SMTP connection with provided or default credentials."""
    data = request.get_json() or {}
    handler = SMTPMailHandler(
        server=data.get("server"),
        port=int(data.get("port") or 587),
        username=data.get("username"),
        password=data.get("password"),
        use_ssl=data.get("use_ssl", False),
        use_tls=data.get("use_tls", True),
        from_name=data.get("from_name"),
        reply_to=data.get("reply_to")
    )
    result = handler.test_connection()
    return jsonify(result)


# --- Gemini AI Endpoints ---

@app.route("/api/ai/status", methods=["GET"])
def get_ai_status():
    """Checks if a Gemini API Key is configured in environment or handler."""
    has_key = bool(ai_handler.api_key or os.getenv("GEMINI_API_KEY", "").strip())
    return jsonify({
        "success": True,
        "configured": has_key
    })


@app.route("/api/ai/verify-key", methods=["POST"])
def verify_gemini_key():
    """Validates a Gemini API Key."""
    data = request.get_json() or {}
    key = data.get("api_key", "").strip()
    result = ai_handler.test_key(key)
    return jsonify(result)


@app.route("/api/ai/generate", methods=["POST"])
def generate_ai_messages():
    """Generates structured Email and WhatsApp copy using Gemini AI."""
    data = request.get_json() or {}
    prompt = data.get("prompt", "").strip()
    tone = data.get("tone", "Professional")
    custom_key = data.get("api_key", "").strip() or None

    if not prompt:
        return jsonify({"success": False, "error": "Prompt cannot be empty"}), 400

    columns = state.get("columns", [])
    result = ai_handler.generate_campaign_messages(
        prompt=prompt,
        columns=columns,
        tone=tone,
        custom_key=custom_key
    )
    return jsonify(result)


# --- Dispatch Endpoints ---

@app.route("/api/send/email-single", methods=["POST"])
def send_single_email():
    """Sends an email to a single contact."""
    data = request.get_json() or {}
    contact_id = data.get("contact_id")
    backend = data.get("backend", "graph")  # 'graph' or 'smtp'
    subject_tmpl = data.get("subject", "")
    body_tmpl = data.get("body", "")
    smtp_settings = data.get("smtp_settings", {})

    contact = next((c for c in state["contacts"] if c["id"] == contact_id), None)
    if not contact:
        return jsonify({"success": False, "error": "Contact not found"}), 404

    if not contact["has_valid_email"]:
        return jsonify({"success": False, "error": f"Invalid email address: {contact['email_raw']}"}), 400

    rendered_subject = render_message_template(subject_tmpl, contact)
    rendered_body = render_message_template(body_tmpl, contact)

    if backend == "graph":
        res = graph_handler.send_email(
            to_email=contact["email_clean"],
            subject=rendered_subject,
            content=rendered_body,
            is_html=True
        )
    else:
        handler = SMTPMailHandler(
            server=smtp_settings.get("server"),
            port=int(smtp_settings.get("port") or 587),
            username=smtp_settings.get("username"),
            password=smtp_settings.get("password"),
            use_ssl=smtp_settings.get("use_ssl", False),
            use_tls=smtp_settings.get("use_tls", True),
            from_name=smtp_settings.get("from_name"),
            reply_to=smtp_settings.get("reply_to")
        )
        res = handler.send_email(
            to_email=contact["email_clean"],
            subject=rendered_subject,
            content=rendered_body,
            is_html=True
        )

    return jsonify(res)


@app.route("/api/state", methods=["GET"])
def get_state():
    """Returns current in-memory contacts and template state."""
    return jsonify({
        "success": True,
        "has_contacts": len(state["contacts"]) > 0,
        "file_name": state["file_name"],
        "total_contacts": len(state["contacts"]),
        "columns": state["columns"],
        "detected": state["detected_mapping"],
        "contacts": state["contacts"],
        "country_code": state["country_code"],
        "templates": {
            "email_subject": state["email_subject"],
            "email_body": state["email_template"],
            "whatsapp_body": state["whatsapp_template"]
        }
    })


@app.route("/api/whatsapp/batch-links", methods=["POST"])
def get_whatsapp_batch_links():
    """Generates all WhatsApp links for loaded contacts."""
    data = request.get_json() or {}
    tmpl = data.get("template", state["whatsapp_template"])
    links = generate_batch_links(state["contacts"], tmpl)
    return jsonify({"success": True, "links": links})


@app.route("/api/whatsapp/open-desktop", methods=["POST"])
def open_whatsapp_desktop():
    """Opens WhatsApp links sequentially via backend OS launcher (bypasses browser popup blockers)."""
    data = request.get_json() or {}
    tmpl = data.get("template", state["whatsapp_template"])
    delay = float(data.get("delay", 1.8))
    
    opened_count = open_batch_in_desktop(state["contacts"], tmpl, delay=delay)
    return jsonify({"success": True, "opened_count": opened_count})


def run_server(host: str = "0.0.0.0", port: int = 8080, debug: bool = True):
    """Entry point function to run the Flask development server."""
    app.run(host=host, port=port, debug=debug)


if __name__ == "__main__":
    run_server(host="0.0.0.0", port=8080, debug=True)
