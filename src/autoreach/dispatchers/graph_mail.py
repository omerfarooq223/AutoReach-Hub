import os
import atexit
import json
import time
import requests
from pathlib import Path
from typing import Dict, Any, Optional, List
import msal

from ..config import MS_CLIENT_ID, MS_AUTHORITY, MS_SCOPES, TOKEN_CACHE_FILE


class MicrosoftGraphMailHandler:
    def __init__(self, client_id: Optional[str] = None, authority: Optional[str] = None, scopes: Optional[List[str]] = None):
        self.client_id = client_id or MS_CLIENT_ID
        self.authority = authority or MS_AUTHORITY
        self.scopes = scopes or MS_SCOPES
        self.cache_file = TOKEN_CACHE_FILE
        self.token_cache = msal.SerializableTokenCache()

        self._load_cache()
        atexit.register(self._save_cache)

        self.app = msal.PublicClientApplication(
            client_id=self.client_id,
            authority=self.authority,
            token_cache=self.token_cache
        )
        self.active_device_flow: Optional[Dict[str, Any]] = None

    def _load_cache(self):
        if self.cache_file.exists():
            try:
                self.token_cache.deserialize(self.cache_file.read_text(encoding="utf-8"))
            except Exception:
                pass

    def _save_cache(self):
        if self.token_cache.has_state_changed:
            try:
                self.cache_file.write_text(self.token_cache.serialize(), encoding="utf-8")
            except Exception:
                pass

    def get_cached_token(self) -> Optional[str]:
        """Tries to acquire a token silently from the persistent cache."""
        accounts = self.app.get_accounts()
        if accounts:
            result = self.app.acquire_token_silent(self.scopes, account=accounts[0])
            if result and "access_token" in result:
                self._save_cache()
                return result["access_token"]
        return None

    def get_auth_status(self) -> Dict[str, Any]:
        """Checks if a valid token exists and returns the user's profile info."""
        token = self.get_cached_token()
        if not token:
            return {"authenticated": False, "user": None}

        # Fetch user info from Graph API
        try:
            resp = requests.get(
                "https://graph.microsoft.com/v1.0/me",
                headers={"Authorization": f"Bearer {token}"},
                timeout=10
            )
            if resp.status_code == 200:
                data = resp.json()
                email = data.get("mail") or data.get("userPrincipalName", "")
                display_name = data.get("displayName", "")
                return {
                    "authenticated": True,
                    "user": {
                        "email": email,
                        "displayName": display_name,
                        "jobTitle": data.get("jobTitle", ""),
                        "officeLocation": data.get("officeLocation", "")
                    }
                }
            elif resp.status_code == 401:
                return {"authenticated": False, "user": None, "error": "Token expired"}
        except Exception as e:
            return {"authenticated": False, "user": None, "error": str(e)}

        return {"authenticated": False, "user": None}

    def start_device_flow(self) -> Dict[str, Any]:
        """Initiates the Device Code Flow."""
        flow = self.app.initiate_device_flow(scopes=self.scopes)
        if "user_code" not in flow:
            raise Exception(f"Failed to create device flow: {flow.get('error_description', 'Unknown error')}")

        self.active_device_flow = flow
        return {
            "user_code": flow.get("user_code"),
            "verification_uri": flow.get("verification_uri", "https://microsoft.com/devicelogin"),
            "message": flow.get("message"),
            "expires_in": flow.get("expires_in", 900)
        }

    def poll_device_flow(self) -> Dict[str, Any]:
        """Polls to see if the user completed the device code login."""
        if not self.active_device_flow:
            return {"status": "error", "message": "No active device flow found. Please start login first."}

        result = self.app.acquire_token_by_device_flow(self.active_device_flow)
        if "access_token" in result:
            self._save_cache()
            self.active_device_flow = None
            status = self.get_auth_status()
            return {"status": "success", "user": status.get("user")}
        elif "error" in result:
            error = result.get("error")
            if error in ["authorization_pending", "slow_down"]:
                return {"status": "pending", "message": "Waiting for user to sign in..."}
            else:
                self.active_device_flow = None
                return {"status": "error", "message": result.get("error_description", error)}

        return {"status": "pending", "message": "Waiting for authentication..."}

    def logout(self) -> bool:
        """Clears all cached accounts and token cache file."""
        accounts = self.app.get_accounts()
        for acc in accounts:
            self.app.remove_account(acc)
        if self.cache_file.exists():
            try:
                self.cache_file.unlink()
            except Exception:
                pass
        return True

    def send_email(
        self,
        to_email: str,
        subject: str,
        content: str,
        is_html: bool = True,
        save_to_sent_items: bool = True
    ) -> Dict[str, Any]:
        """
        Sends an email using Microsoft Graph API /me/sendMail endpoint.
        """
        token = self.get_cached_token()
        if not token:
            return {"success": False, "error": "Not authenticated. Please sign in with your Microsoft account."}

        url = "https://graph.microsoft.com/v1.0/me/sendMail"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

        # If plain text, convert newlines to <br> if treated as HTML, or set Text
        body_type = "HTML" if is_html else "Text"
        formatted_content = content
        if is_html and "<" not in content and "\n" in content:
            formatted_content = content.replace("\n", "<br>")

        recipients = [
            {"emailAddress": {"address": addr.strip()}}
            for addr in to_email.replace(";", ",").split(",")
            if addr.strip() and "@" in addr
        ]

        if not recipients:
            return {"success": False, "error": f"No valid recipient email addresses parsed from: {to_email}"}

        payload = {
            "message": {
                "subject": subject,
                "body": {
                    "contentType": body_type,
                    "content": formatted_content
                },
                "toRecipients": recipients
            },
            "saveToSentItems": "true" if save_to_sent_items else "false"
        }

        try:
            resp = requests.post(url, headers=headers, json=payload, timeout=20)
            if resp.status_code in [200, 202]:
                return {"success": True, "status_code": resp.status_code}
            else:
                try:
                    err_json = resp.json()
                    err_msg = err_json.get("error", {}).get("message", resp.text)
                except Exception:
                    err_msg = resp.text
                return {"success": False, "error": f"Graph API Error ({resp.status_code}): {err_msg}"}
        except Exception as e:
            return {"success": False, "error": f"Request failed: {str(e)}"}
