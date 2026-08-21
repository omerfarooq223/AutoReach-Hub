import os
import json
import requests
from typing import Dict, Any, List, Optional
from ..config import BASE_DIR, GEMINI_API_KEY


class GeminiAIHandler:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY", "") or GEMINI_API_KEY
        # Primary & fallback model endpoints
        self.models = [
            "gemini-2.5-flash",
            "gemini-1.5-flash",
            "gemini-3.6-flash",
            "gemini-flash-latest"
        ]

    def _call_gemini_api(self, key: str, payload: dict, max_timeout: int = 25) -> tuple[int, dict]:
        """Tries candidate Gemini models until one succeeds."""
        last_status = 500
        last_json = {}
        for model in self.models:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
            try:
                resp = requests.post(url, json=payload, timeout=max_timeout)
                resp.encoding = "utf-8"
                if resp.status_code == 200:
                    return 200, resp.json()
                last_status = resp.status_code
                last_json = resp.json()
            except Exception as e:
                last_json = {"error": {"message": str(e)}}
        return last_status, last_json

    def test_key(self, key_to_test: Optional[str] = None) -> Dict[str, Any]:
        """Tests if a Gemini API key is valid."""
        key = key_to_test or os.getenv("GEMINI_API_KEY", "") or self.api_key
        if not key:
            return {"success": False, "error": "No Gemini API Key provided."}

        payload = {
            "contents": [{"parts": [{"text": "Reply with OK"}]}],
            "generationConfig": {"maxOutputTokens": 10}
        }

        status, data = self._call_gemini_api(key, payload, max_timeout=10)
        if status == 200:
            return {"success": True, "message": "Gemini API key verified successfully!"}
        else:
            err_msg = data.get("error", {}).get("message", "API validation failed")
            return {"success": False, "error": f"Gemini Error ({status}): {err_msg}"}

    def generate_campaign_messages(
        self,
        prompt: str,
        columns: List[str],
        tone: str = "Professional",
        custom_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Uses Gemini AI to draft structured Email Subject, Email Body, and WhatsApp message
        using available Excel column placeholders (e.g. {Name}, {RollNumber}).
        """
        key = custom_key or os.getenv("GEMINI_API_KEY", "") or self.api_key
        if not key:
            return {"success": False, "error": "Gemini API key is required. Please add your key in Settings or .env"}

        cols_str = ", ".join([f"{{{c}}}" for c in columns]) if columns else "{Name}, {Email}, {Phone}"

        system_instruction = f"""
You are an expert communication assistant for universities, schools, and organizations.
Your task is to craft high-impact, personalized notification messages for Email and WhatsApp based on the user's prompt.

AVAILABLE EXCEL PLACEHOLDERS:
{cols_str}

RULES:
1. Always use available placeholders like {{Name}}, etc. to personalize the message.
2. The tone must be: {tone}.
3. The Email body should be well-formatted (paragraphs, clear greetings, professional closing).
4. The WhatsApp message should be concise, clear, and include relevant emojis for readability.
5. Return ONLY a valid JSON object matching this exact schema:
{{
  "email_subject": "Brief compelling subject line with {{{{Name}}}} or relevant tag",
  "email_body": "Full personalized email content with placeholders",
  "whatsapp_body": "Engaging, mobile-friendly WhatsApp message with emojis and placeholders"
}}
"""

        user_content = f"Instruction / Campaign Goal: {prompt}"

        payload = {
            "contents": [
                {"role": "user", "parts": [{"text": f"{system_instruction}\n\n{user_content}"}]}
            ],
            "generationConfig": {
                "temperature": 0.7,
                "responseMimeType": "application/json"
            }
        }

        try:
            status, data = self._call_gemini_api(key, payload, max_timeout=25)
            if status != 200:
                err_msg = data.get("error", {}).get("message", "API request failed")
                return {"success": False, "error": f"Gemini Error ({status}): {err_msg}"}

            raw_text = data["candidates"][0]["content"]["parts"][0]["text"]
            parsed = json.loads(raw_text)

            return {
                "success": True,
                "email_subject": parsed.get("email_subject", ""),
                "email_body": parsed.get("email_body", ""),
                "whatsapp_body": parsed.get("whatsapp_body", "")
            }
        except json.JSONDecodeError:
            return {"success": False, "error": "Failed to parse AI JSON response. Please try again."}
        except Exception as e:
            return {"success": False, "error": f"AI generation failed: {str(e)}"}
