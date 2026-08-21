import re
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formataddr
from email.header import Header
from typing import Dict, Any, Optional


from config import (
    SMTP_SERVER, SMTP_PORT, SMTP_USE_SSL, SMTP_USE_TLS,
    SMTP_USERNAME, SMTP_PASSWORD, DEFAULT_FROM_NAME, DEFAULT_REPLY_TO
)


class SMTPMailHandler:
    def __init__(
        self,
        server: Optional[str] = None,
        port: Optional[int] = None,
        username: Optional[str] = None,
        password: Optional[str] = None,
        use_ssl: Optional[bool] = None,
        use_tls: Optional[bool] = None,
        from_name: Optional[str] = None,
        reply_to: Optional[str] = None
    ):
        self.server = server or SMTP_SERVER
        self.port = port or SMTP_PORT
        self.username = username if username is not None else SMTP_USERNAME
        self.password = password if password is not None else SMTP_PASSWORD
        self.use_ssl = use_ssl if use_ssl is not None else SMTP_USE_SSL
        self.use_tls = use_tls if use_tls is not None else SMTP_USE_TLS
        self.from_name = from_name or DEFAULT_FROM_NAME
        self.reply_to = reply_to if reply_to is not None else DEFAULT_REPLY_TO

    def test_connection(self) -> Dict[str, Any]:
        """Tests SMTP credentials and connection."""
        if not self.server or not self.username or not self.password:
            return {"success": False, "error": "SMTP server, username, and password are required."}

        try:
            if self.use_ssl:
                server = smtplib.SMTP_SSL(self.server, self.port, timeout=15)
            else:
                server = smtplib.SMTP(self.server, self.port, timeout=15)
                if self.use_tls:
                    server.starttls()

            server.login(self.username, self.password)
            server.quit()
            return {"success": True, "message": "Successfully connected and authenticated with SMTP server!"}
        except smtplib.SMTPAuthenticationError as e:
            return {"success": False, "error": f"Authentication failed: {e.smtp_error.decode('utf-8', errors='ignore') if isinstance(e.smtp_error, bytes) else str(e)}"}
        except Exception as e:
            return {"success": False, "error": f"SMTP Connection failed: {str(e)}"}

    def send_email(
        self,
        to_email: str,
        subject: str,
        content: str,
        is_html: bool = True
    ) -> Dict[str, Any]:
        """Sends an email via SMTP."""
        if not self.server or not self.username or not self.password:
            return {"success": False, "error": "SMTP credentials are not configured."}

        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = Header(subject, "utf-8")
            from_display = str(Header(self.from_name, "utf-8")) if self.from_name else ""
            msg["From"] = formataddr((from_display, self.username))
            msg["To"] = to_email.strip()

            if self.reply_to:
                msg["Reply-To"] = self.reply_to.strip()

            if is_html:
                # Add plain text fallback
                plain_text = re.sub(r"<[^>]+>", "", content)
                msg.attach(MIMEText(plain_text, "plain", "utf-8"))
                
                formatted_html = content
                if "<" not in content and "\n" in content:
                    formatted_html = content.replace("\n", "<br>")
                msg.attach(MIMEText(formatted_html, "html", "utf-8"))
            else:
                msg.attach(MIMEText(content, "plain", "utf-8"))

            server = None
            try:
                if self.use_ssl:
                    server = smtplib.SMTP_SSL(self.server, int(self.port), timeout=20)
                else:
                    server = smtplib.SMTP(self.server, int(self.port), timeout=20)
                    if self.use_tls:
                        server.starttls()

                server.login(self.username, self.password)
                server.send_message(msg)
            finally:
                if server:
                    try:
                        server.quit()
                    except Exception:
                        pass

            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}

