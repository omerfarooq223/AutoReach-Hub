import argparse
import sys
import time
from pathlib import Path
from typing import Optional

from config import DEFAULT_COUNTRY_CODE
from excel_handler import load_contacts_file, render_message_template
from graph_mail_handler import MicrosoftGraphMailHandler
from smtp_handler import SMTPMailHandler
from whatsapp_handler import generate_whatsapp_url, open_whatsapp_chat


def run_cli():
    parser = argparse.ArgumentParser(
        description="Automated Excel to WhatsApp and Email (Microsoft 365 / SMTP) Dispatcher"
    )
    parser.add_argument("--file", "-f", help="Path to Excel (.xlsx/.xls) or CSV file")
    parser.add_argument("--country-code", "-cc", default=DEFAULT_COUNTRY_CODE, help="Default country code (e.g. 92 for PK)")
    parser.add_argument("--email-backend", choices=["graph", "smtp"], default="graph", help="Email provider: 'graph' (LUMS/Microsoft 365) or 'smtp' (Gmail/Custom)")
    parser.add_argument("--subject", "-s", default="Important Notification for {Name}", help="Email Subject (supports placeholders)")
    parser.add_argument("--email-body", "-eb", default="Hello {Name},\n\nThis is an official notification regarding your course {CourseName}.\n\nBest regards,\nLUMS Team", help="Email Message Body")
    parser.add_argument("--whatsapp-body", "-wb", default="Hello {Name}, your meeting for {CourseName} is scheduled for {MeetingTime}.", help="WhatsApp Message Template")
    parser.add_argument("--send-email", action="store_true", help="Send emails to all contacts with valid email addresses")
    parser.add_argument("--open-whatsapp", action="store_true", help="Open WhatsApp web chats for contacts sequentially")
    parser.add_argument("--wa-delay", type=float, default=2.5, help="Delay in seconds between opening WhatsApp tabs (default: 2.5s)")
    parser.add_argument("--login-lums", action="store_true", help="Authenticate with LUMS / Microsoft 365 using Device Code Flow")
    parser.add_argument("--dry-run", action="store_true", help="Print generated messages without sending")

    args = parser.parse_args()

    # Handle LUMS login specifically
    if args.login_lums:
        print("\n=== LUMS / Microsoft 365 Login ===")
        handler = MicrosoftGraphMailHandler()
        status = handler.get_auth_status()
        if status.get("authenticated"):
            user = status.get("user", {})
            print(f" Already authenticated as: {user.get('displayName')} ({user.get('email')})")
            return

        flow = handler.start_device_flow()
        print(f"\n{flow['message']}\n")
        print("Waiting for authentication...")
        while True:
            res = handler.poll_device_flow()
            if res.get("status") == "success":
                user = res.get("user", {})
                print(f"\n Authentication Successful! Logged in as: {user.get('displayName')} ({user.get('email')})")
                break
            elif res.get("status") == "error":
                print(f"\n❌ Login Failed: {res.get('message')}")
                break
            time.sleep(3)
        return

    if not args.file:
        print("No file specified. Use --file <path_to_excel_or_csv> or --login-lums")
        parser.print_help()
        return

    print(f"\n Loading contacts from: {args.file}")
    try:
        contacts, columns, detected = load_contacts_file(args.file, default_country_code=args.country_code)
    except Exception as e:
        print(f"❌ Error loading file: {e}")
        return

    print(f" Loaded {len(contacts)} contacts. Detected columns: {detected}")
    print(f" Available template placeholders: {', '.join(['{' + c + '}' for c in columns])}\n")

    if args.dry_run:
        print("=== DRY RUN MODE: PREVIEW OF FIRST 3 CONTACTS ===")
        for c in contacts[:3]:
            rendered_subject = render_message_template(args.subject, c)
            rendered_email = render_message_template(args.email_body, c)
            rendered_wa = render_message_template(args.whatsapp_body, c)
            wa_url = generate_whatsapp_url(c.get("phone_clean"), rendered_wa)

            print(f"\n--- Contact #{c['id']}: {c['name']} ---")
            print(f"Email Target: {c['email_clean']} (Valid: {c['has_valid_email']})")
            print(f"Email Subject: {rendered_subject}")
            print(f"Email Body:\n{rendered_email}")
            print(f"WhatsApp Target: {c['phone_clean']} (Valid: {c['has_valid_phone']})")
            print(f"WhatsApp Text: {rendered_wa}")
            print(f"WhatsApp URL: {wa_url}")
        print("\n=== DRY RUN COMPLETED ===")
        return

    # Email Dispatching
    if args.send_email:
        print(f"\n=== STARTING EMAIL DISPATCH (Backend: {args.email_backend.upper()}) ===")
        email_handler = None
        if args.email_backend == "graph":
            email_handler = MicrosoftGraphMailHandler()
            status = email_handler.get_auth_status()
            if not status.get("authenticated"):
                print("❌ Microsoft 365 / LUMS is not authenticated. Please run with `--login-lums` first.")
                return
            user = status.get("user", {})
            print(f" Sending from LUMS Account: {user.get('displayName')} ({user.get('email')})")
        else:
            email_handler = SMTPMailHandler()
            test_res = email_handler.test_connection()
            if not test_res.get("success"):
                print(f"❌ SMTP Connection failed: {test_res.get('error')}")
                return
            print(f" Connected to SMTP server: {email_handler.server}:{email_handler.port}")

        sent_count = 0
        failed_count = 0
        for c in contacts:
            if not c["has_valid_email"]:
                print(f"⚠️  Skipping #{c['id']} {c['name']}: No valid email found ({c['email_raw']})")
                continue

            rendered_subject = render_message_template(args.subject, c)
            rendered_email = render_message_template(args.email_body, c)
            print(f"➡️ Sending email to {c['name']} <{c['email_clean']}>...", end=" ", flush=True)

            res = email_handler.send_email(
                to_email=c["email_clean"],
                subject=rendered_subject,
                content=rendered_email,
                is_html=True
            )
            if res.get("success"):
                print(" SUCCESS")
                sent_count += 1
            else:
                print(f"❌ FAILED: {res.get('error')}")
                failed_count += 1
            time.sleep(0.5)

        print(f"\n Email Dispatch Complete: {sent_count} Sent, {failed_count} Failed.")

    # WhatsApp Dispatching
    if args.open_whatsapp:
        print("\n=== OPENING WHATSAPP CHATS ===")
        opened_count = 0
        for c in contacts:
            if not c["has_valid_phone"]:
                print(f"⚠️  Skipping #{c['id']} {c['name']}: No valid phone number ({c['phone_raw']})")
                continue

            rendered_wa = render_message_template(args.whatsapp_body, c)
            print(f"➡️ Opening WhatsApp chat for {c['name']} ({c['phone_clean']})...")
            success = open_whatsapp_chat(c["phone_clean"], rendered_wa)
            if success:
                opened_count += 1
            time.sleep(args.wa_delay)

        print(f"\n WhatsApp Launch Complete: Opened {opened_count} chats.")


if __name__ == "__main__":
    run_cli()
