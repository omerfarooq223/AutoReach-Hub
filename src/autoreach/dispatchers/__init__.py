from .graph_mail import MicrosoftGraphMailHandler
from .smtp_mail import SMTPMailHandler
from .whatsapp import (
    generate_whatsapp_url,
    generate_whatsapp_app_url,
    open_whatsapp_chat,
    generate_batch_links,
    open_batch_in_desktop
)

__all__ = [
    "MicrosoftGraphMailHandler",
    "SMTPMailHandler",
    "generate_whatsapp_url",
    "generate_whatsapp_app_url",
    "open_whatsapp_chat",
    "generate_batch_links",
    "open_batch_in_desktop"
]
