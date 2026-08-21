import urllib.parse
import webbrowser
import time
from typing import Dict, Any, List, Optional


def generate_whatsapp_url(phone_clean: str, message: str) -> str:
    """
    Generates standard WhatsApp Click-to-Chat URL.
    Uses UTF-8 URL encoding to ensure emojis (e.g. 👋, 🚀, 🎉) are preserved without corruption.
    """
    if not phone_clean:
        return ""
    # Clean non-digits
    digits = "".join(filter(str.isdigit, str(phone_clean)))
    if not digits:
        return ""

    encoded_text = urllib.parse.quote(str(message).strip(), encoding="utf-8", safe="")
    return f"https://wa.me/{digits}?text={encoded_text}"


def generate_whatsapp_app_url(phone_clean: str, message: str) -> str:
    """
    Generates WhatsApp protocol URL (whatsapp://send?phone=...&text=...).
    """
    if not phone_clean:
        return ""
    digits = "".join(filter(str.isdigit, str(phone_clean)))
    if not digits:
        return ""
    encoded_text = urllib.parse.quote(str(message).strip(), encoding="utf-8", safe="")
    return f"whatsapp://send?phone={digits}&text={encoded_text}"


def open_whatsapp_chat(phone_clean: str, message: str, use_desktop_protocol: bool = False) -> bool:
    """
    Opens WhatsApp chat in default browser or desktop client.
    """
    url = generate_whatsapp_app_url(phone_clean, message) if use_desktop_protocol else generate_whatsapp_url(phone_clean, message)
    if not url:
        return False
    return webbrowser.open(url)


def generate_batch_links(contacts: List[Dict[str, Any]], template: str) -> List[Dict[str, Any]]:
    """
    Generates WhatsApp URLs for a list of contacts based on a message template.
    """
    from ..core.excel_handler import render_message_template

    results = []
    for contact in contacts:
        phone = contact.get("phone_clean")
        rendered_msg = render_message_template(template, contact)
        web_url = generate_whatsapp_url(phone, rendered_msg)
        app_url = generate_whatsapp_app_url(phone, rendered_msg)

        results.append({
            "id": contact.get("id"),
            "name": contact.get("name"),
            "phone": phone,
            "message": rendered_msg,
            "web_url": web_url,
            "app_url": app_url,
            "valid": bool(phone and web_url)
        })
    return results


def open_batch_in_desktop(contacts: List[Dict[str, Any]], template: str, delay: float = 2.0) -> int:
    """
    Opens WhatsApp chats sequentially on the local machine using OS default browser.
    """
    from ..core.excel_handler import render_message_template

    opened = 0
    for contact in contacts:
        phone = contact.get("phone_clean")
        if not phone or not contact.get("has_valid_phone"):
            continue
        rendered_msg = render_message_template(template, contact)
        if open_whatsapp_chat(phone, rendered_msg):
            opened += 1
        time.sleep(delay)
    return opened
