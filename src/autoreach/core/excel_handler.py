import re
from pathlib import Path
from typing import List, Dict, Any, Tuple, Optional
import pandas as pd
import phonenumbers
from phonenumbers import geocoder, carrier

# Country code to ISO region mapping
COUNTRY_ISO_MAP = {
    "92": "PK",
    "1": "US",
    "44": "GB",
    "971": "AE",
    "966": "SA",
    "91": "IN",
    "61": "AU",
    "49": "DE",
    "33": "FR",
    "81": "JP",
    "86": "CN",
    "90": "TR",
    "7": "RU",
    "57": "CO",
    "974": "QA",
    "973": "BH",
    "968": "OM",
    "965": "KW"
}

# Sorted longest-first so greedy matching works (e.g. "971" before "9")
_SORTED_COUNTRY_CODES = sorted(COUNTRY_ISO_MAP.keys(), key=lambda x: -len(x))


def derive_email_from_campus_id(campus_id: Any, fallback_domain: str = "lums.edu.pk") -> str:
    """
    Derives official email address from Campus ID or Roll Number when missing.
    Rules:
      1. 10-digit numeric ID starting with '20' (e.g. 2017110021 -> 17110021@lums.edu.pk)
      2. 8-digit numeric or alphanumeric ID (e.g. '96m010' -> 96m010@lums.edu.pk)
    """
    if pd.isna(campus_id) or campus_id is None:
        return ""

    if isinstance(campus_id, float) and campus_id.is_integer():
        cid_str = str(int(campus_id))
    else:
        cid_str = str(campus_id).strip()

    if cid_str.endswith(".0"):
        cid_str = cid_str[:-2]

    if cid_str.lower() in ["nan", "none", "null", "n/a", "na", "nil", "undefined", ""]:
        return ""

    cid_str = cid_str.replace(" ", "")

    # Rule 1: 10-digit ID starting with '20' (e.g. 2017110021 -> 17110021@lums.edu.pk)
    if len(cid_str) == 10 and cid_str.startswith("20") and cid_str.isdigit():
        roll_part = cid_str[2:]
        return f"{roll_part}@{fallback_domain}"

    # Rule 2: Alphanumeric or standard roll number (e.g. 96m010 -> 96m010@lums.edu.pk)
    if "@" not in cid_str:
        return f"{cid_str.lower()}@{fallback_domain}"

    return cid_str.lower()


def _try_parse_valid(candidate: str, region: str = None):
    """Try to parse and validate a phone number candidate. Returns (parsed, e164, country) or None."""
    try:
        parsed = phonenumbers.parse(candidate, region)
        if phonenumbers.is_valid_number(parsed):
            e164 = phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164).lstrip("+")
            country = geocoder.country_name_for_number(parsed, "en") or ""
            return parsed, e164, country
    except Exception:
        pass
    return None


def _normalize_raw_string(raw: Any) -> str:
    """Convert raw input to a clean string, handling floats and scientific notation."""
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return ""
    if isinstance(raw, float):
        s = str(int(raw)) if raw.is_integer() else str(raw)
    else:
        s = str(raw).strip()
    if s.endswith(".0"):
        s = s[:-2]
    # Handle scientific notation like +4.47919e+11
    sci = re.match(r"^([+-]?)([\d.]+)[eE]([+-]?\d+)$", s.replace(" ", ""))
    if sci:
        try:
            s = str(int(float(s.replace(" ", ""))))
        except Exception:
            pass
    return s


def validate_and_format_phone(phone_raw: Any, default_country_code: str = "92") -> Dict[str, Any]:
    """
    Multi-strategy international phone number validator.
    Handles: IDD prefixes (00/+00), doubled country codes, local national formats,
    +0X bogus prefixes, scientific notation, and more.
    """
    s = _normalize_raw_string(phone_raw)
    if not s or s.lower() in ["nan", "none", "null", "n/a", "na", "nil", ""]:
        return {"phone_clean": "", "is_valid": False, "country_name": "", "reason": "Empty number"}

    default_cc = re.sub(r"[^\d]", "", str(default_country_code or "92"))
    default_region = COUNTRY_ISO_MAP.get(default_cc, "PK")

    # All digits from the raw string
    all_digits = re.sub(r"[^\d]", "", s)
    has_plus = s.startswith("+")

    # ----------------------------------------------------------------
    # Build a list of candidate parse strings to try, in priority order
    # ----------------------------------------------------------------
    candidates = []

    # 1. IDD prefix: 00XX... or +00XX... -> strip 00 -> +XX...
    if all_digits.startswith("00"):
        digits_no_idd = all_digits[2:]
        candidates.append(f"+{digits_no_idd}")

    # 2. Doubled country code: e.g. +44 447... or +61 61... -> strip one CC
    for cc in _SORTED_COUNTRY_CODES:
        doubled = cc + cc
        if all_digits.startswith(doubled):
            candidates.append(f"+{cc}{all_digits[len(doubled):]}")
        # CC + IDD (00) e.g. 4400 7868262079 -> 447868262079
        cc_idd = cc + "00"
        if all_digits.startswith(cc_idd):
            candidates.append(f"+{cc}{all_digits[len(cc_idd):]}")
        # CC + IDD (000) e.g. 44000 7834421761 -> 447834421761
        cc_idd3 = cc + "000"
        if all_digits.startswith(cc_idd3):
            candidates.append(f"+{cc}{all_digits[len(cc_idd3):]}")
        # CC + 00 + CC (e.g. 440044...) i.e. +44 0044 XXXXXXX
        cc_00_cc = cc + "00" + cc
        if all_digits.startswith(cc_00_cc):
            candidates.append(f"+{cc}{all_digits[len(cc_00_cc):]}")
        # CC + 0 + CC (e.g. 44044...)
        cc_0_idd = cc + "0" + cc
        if all_digits.startswith(cc_0_idd):
            candidates.append(f"+{cc}{all_digits[len(cc_0_idd):]}")

    # 3. +0X bogus prefix: +0 followed by country code or local number
    #    e.g. +0796 709 5979 (UK mobile), +04475... (+0 then 447...)
    if has_plus and all_digits.startswith("0"):
        digits_no_leading_zero = all_digits.lstrip("0")
        # Try as international (CC embedded in digits)
        candidates.append(f"+{digits_no_leading_zero}")
        # Try as local number in default country
        candidates.append(f"+{default_cc}{digits_no_leading_zero}")
        # Heuristic: if stripped digits are 10 chars starting with 7 -> likely UK mobile
        if len(digits_no_leading_zero) == 10 and digits_no_leading_zero.startswith("7"):
            candidates.append(f"+44{digits_no_leading_zero}")
        # Heuristic: if stripped digits are 9 chars starting with 4 -> likely Australian mobile
        if len(digits_no_leading_zero) == 9 and digits_no_leading_zero.startswith("4"):
            candidates.append(f"+61{digits_no_leading_zero}")

    # 4. Pakistani national formats: 03XX-XXXXXXX (11 digits) or 3XXXXXXXXX (10 digits)
    if len(all_digits) == 11 and all_digits.startswith("0") and all_digits[1] == "3":
        candidates.append(f"+92{all_digits[1:]}")
    if len(all_digits) == 10 and all_digits.startswith("3"):
        candidates.append(f"+92{all_digits}")

    # 5. Pakistani landline with 0 prefix: 042XXXXXXX (10-11 digits)
    if default_cc == "92" and all_digits.startswith("0") and len(all_digits) in [10, 11]:
        candidates.append(f"+92{all_digits[1:]}")

    # 6. Australian local: 04XXXXXXXX (10 digits) or 4XXXXXXXX (9 digits)
    if default_cc == "61":
        if all_digits.startswith("04") and len(all_digits) == 10:
            candidates.append(f"+61{all_digits[1:]}")
        if all_digits.startswith("4") and len(all_digits) == 9:
            candidates.append(f"+61{all_digits}")

    # 7. UK local: 07XXXXXXXXX (11 digits) or 7XXXXXXXXX (10 digits)
    if default_cc == "44":
        if all_digits.startswith("07") and len(all_digits) == 11:
            candidates.append(f"+44{all_digits[1:]}")
        if all_digits.startswith("7") and len(all_digits) == 10:
            candidates.append(f"+44{all_digits}")

    # 8. Bare 10-digit number without country context -> try default CC
    if len(all_digits) == 10 and not has_plus:
        candidates.append(f"+{default_cc}{all_digits}")

    # 9. As-is
    if has_plus:
        candidates.append(f"+{all_digits}")
    else:
        candidates.append(f"+{all_digits}")
        if not all_digits.startswith(default_cc):
            candidates.append(f"+{default_cc}{all_digits}")


    # ---- Try each candidate in order, return first valid ----
    for candidate in candidates:
        result = _try_parse_valid(candidate)
        if result:
            parsed, e164, country = result
            return {
                "phone_clean": e164,
                "is_valid": True,
                "country_name": country,
                "reason": "Valid"
            }

    # ---- No valid candidate found — return best-effort parse ----
    # Try the most likely interpretation and report why it failed
    best_candidate = candidates[0] if candidates else f"+{all_digits}"
    try:
        parsed = phonenumbers.parse(best_candidate, default_region)
        is_possible = phonenumbers.is_possible_number(parsed)
        country_name = geocoder.country_name_for_number(parsed, "en") or default_region
        e164_clean = phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164).lstrip("+")
        reason = "Possible length, invalid carrier structure" if is_possible else "Invalid digit count for country"
        return {"phone_clean": e164_clean, "is_valid": False, "country_name": country_name, "reason": reason}
    except Exception as e:
        return {"phone_clean": all_digits, "is_valid": False, "country_name": "Unknown", "reason": str(e)}


def clean_phone_number(phone_raw: Any, default_country_code: str = "92") -> str:
    """Wrapper function returning clean E.164 digits string."""
    res = validate_and_format_phone(phone_raw, default_country_code)
    return res["phone_clean"]


import socket
import dns.resolver

DISPOSABLE_EMAIL_DOMAINS = {
    "tempmail.com", "10minutemail.com", "mailinator.com", "guerrillamail.com",
    "throwawaymail.com", "yopmail.com", "sharklasers.com", "dispostable.com"
}


def validate_and_verify_email(email_raw: Any) -> Dict[str, Any]:
    """
    Performs 3-Level Email Verification:
      Level 1: Syntax & Regex RFC 5322 structure check
      Level 2: Disposable/Temp email domain filter
      Level 3: Real-time DNS MX Record & Mail Server Lookup
    """
    if pd.isna(email_raw) or email_raw is None:
        return {"email_clean": "", "is_valid": False, "reason": "Empty email"}

    email_str = str(email_raw).strip().replace(" ", "")
    if email_str.lower() in ["nan", "none", "null", "n/a", "na", "nil", "undefined", ""]:
        return {"email_clean": "", "is_valid": False, "reason": "Empty email"}

    # Level 1: RFC 5322 Syntax check
    pattern = r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$"
    if not re.match(pattern, email_str):
        return {"email_clean": email_str, "is_valid": False, "reason": "Invalid email syntax"}

    domain = email_str.split("@")[-1].lower()

    # Level 2: Disposable domain filter
    if domain in DISPOSABLE_EMAIL_DOMAINS:
        return {"email_clean": email_str, "is_valid": False, "reason": "Disposable email address"}

    # Level 3: DNS / MX Record Resolution
    try:
        mx = dns.resolver.resolve(domain, "MX")
        if mx:
            return {"email_clean": email_str, "is_valid": True, "reason": f"Active MX ({domain})"}
    except Exception:
        try:
            socket.gethostbyname(domain)
            return {"email_clean": email_str, "is_valid": True, "reason": f"Domain active ({domain})"}
        except Exception:
            return {"email_clean": email_str, "is_valid": False, "reason": f"Domain '{domain}' has no active mail servers"}


def clean_email(email_raw: Any) -> str:
    """Sanitizes and normalizes email address string."""
    res = validate_and_verify_email(email_raw)
    return res["email_clean"]



def auto_detect_columns(columns: List[str]) -> Dict[str, Optional[str]]:
    """Auto-detects Name, Phone, Email, and Campus ID columns from column headers."""
    detected = {
        "name_col": None,
        "phone_col": None,
        "email_col": None,
        "campus_id_col": None
    }

    name_patterns = ["name", "full name", "contact name", "student name", "person name", "first name", "user_full_name"]
    phone_patterns = ["phone", "mobile", "whatsapp", "contact", "cell", "number", "contact number", "primary_contact_number", "mobile number"]
    email_patterns = ["email", "e-mail", "mail", "email address", "primary_email", "official email"]
    campus_id_patterns = ["campus id", "campus_id", "roll number", "roll_number", "student id", "roll no", "id"]

    for col in columns:
        col_lower = str(col).strip().lower()

        if not detected["name_col"] and any(p == col_lower or p in col_lower for p in name_patterns):
            detected["name_col"] = col

        if not detected["phone_col"] and any(p == col_lower or p in col_lower for p in phone_patterns):
            detected["phone_col"] = col

        if not detected["email_col"] and any(p == col_lower or p in col_lower for p in email_patterns):
            detected["email_col"] = col

        if not detected["campus_id_col"] and any(p == col_lower or p in col_lower for p in campus_id_patterns):
            detected["campus_id_col"] = col

    # Fallback positioning
    if not detected["name_col"] and len(columns) > 0:
        detected["name_col"] = columns[0]
    if not detected["phone_col"] and len(columns) > 1:
        detected["phone_col"] = columns[1]
    if not detected["email_col"] and len(columns) > 2:
        detected["email_col"] = columns[2]

    return detected


def load_contacts_file(
    file_path: str,
    custom_mapping: Optional[Dict[str, str]] = None,
    default_country_code: str = "92",
    fallback_email_domain: str = "lums.edu.pk"
) -> Tuple[List[Dict[str, Any]], List[str], Dict[str, Optional[str]]]:
    """Reads Excel/CSV file, normalizes fields, derives missing emails from Campus ID, and validates phone numbers."""
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    ext = path.suffix.lower()
    if ext in [".xlsx", ".xls"]:
        df = pd.read_excel(file_path)
    elif ext == ".csv":
        df = pd.read_csv(file_path)
    else:
        raise ValueError(f"Unsupported file format: {ext}. Only .xlsx, .xls, and .csv are supported.")

    df = df.dropna(how="all")
    columns = [str(c).strip() for c in df.columns]

    detected = auto_detect_columns(columns)
    if custom_mapping:
        if custom_mapping.get("name_col"):
            detected["name_col"] = custom_mapping["name_col"]
        if custom_mapping.get("phone_col"):
            detected["phone_col"] = custom_mapping["phone_col"]
        if custom_mapping.get("email_col"):
            detected["email_col"] = custom_mapping["email_col"]
        if custom_mapping.get("campus_id_col"):
            detected["campus_id_col"] = custom_mapping["campus_id_col"]

    contacts = []
    name_col = detected["name_col"]
    phone_col = detected["phone_col"]
    email_col = detected["email_col"]
    campus_id_col = detected["campus_id_col"]

    for idx, row in df.iterrows():
        raw_name = str(row[name_col]).strip() if name_col and name_col in row and not pd.isna(row[name_col]) else f"Contact {idx+1}"
        raw_phone = row[phone_col] if phone_col and phone_col in row else ""
        raw_email = row[email_col] if email_col and email_col in row else ""
        raw_campus_id = row[campus_id_col] if campus_id_col and campus_id_col in row else ""

        phone_val = validate_and_format_phone(raw_phone, default_country_code)
        email_val = validate_and_verify_email(raw_email)
        cleaned_email = email_val["email_clean"]
        email_derived = False

        # Campus ID Email Derivation Rule
        if not cleaned_email and raw_campus_id and not pd.isna(raw_campus_id):
            derived = derive_email_from_campus_id(raw_campus_id, fallback_email_domain)
            if derived and "@" in derived:
                derived_val = validate_and_verify_email(derived)
                cleaned_email = derived_val["email_clean"]
                email_val = derived_val
                email_derived = True

        raw_phone_str = str(raw_phone).strip() if not pd.isna(raw_phone) else ""
        raw_email_str = str(raw_email).strip() if not pd.isna(raw_email) else ""

        if not raw_phone_str or raw_phone_str.lower() in ["nan", "none", "null", "n/a", "na", "nil", ""]:
            phone_status = "missing"
        elif phone_val["is_valid"]:
            phone_status = "valid"
        else:
            phone_status = "malformed"

        if not cleaned_email:
            email_status = "missing"
        elif email_val["is_valid"]:
            email_status = "valid"
        else:
            email_status = "malformed"

        row_dict = {}
        for col in columns:
            val = row[col]
            if pd.isna(val):
                row_dict[col] = ""
            elif isinstance(val, float) and val.is_integer():
                row_dict[col] = str(int(val))
            else:
                row_dict[col] = str(val).strip()

        contact = {
            "id": idx + 1,
            "name": raw_name,
            "phone_raw": raw_phone_str,
            "phone_clean": phone_val["phone_clean"],
            "has_valid_phone": phone_val["is_valid"],
            "phone_status": phone_status,
            "phone_country": phone_val["country_name"],
            "phone_reason": phone_val["reason"],
            "email_raw": raw_email_str,
            "email_clean": cleaned_email,
            "has_valid_email": email_val["is_valid"],
            "email_status": email_status,
            "email_reason": email_val["reason"],
            "email_derived": email_derived,
            "campus_id": str(raw_campus_id) if not pd.isna(raw_campus_id) else "",
            "data": row_dict
        }

        contacts.append(contact)


    return contacts, columns, detected


def render_message_template(template: str, contact_data: Dict[str, Any], extra_data: Optional[Dict[str, Any]] = None) -> str:
    """Renders message template with contact data placeholders."""
    if not template:
        return ""

    combined_data: Dict[str, str] = {}

    def add_entry(key: str, val: Any):
        if val is None or pd.isna(val):
            val_str = ""
        else:
            val_str = str(val).strip()
            if val_str.lower() in ["nan", "none", "null"]:
                val_str = ""

        k_clean = str(key).strip()
        combined_data[k_clean] = val_str
        combined_data[k_clean.lower()] = val_str
        k_alphanumeric = re.sub(r"[^a-zA-Z0-9]", "", k_clean).lower()
        if k_alphanumeric:
            combined_data[k_alphanumeric] = val_str

    add_entry("name", contact_data.get("name", ""))
    add_entry("phone", contact_data.get("phone_clean", "") or contact_data.get("phone_raw", ""))
    add_entry("email", contact_data.get("email_clean", "") or contact_data.get("email_raw", ""))
    add_entry("campus_id", contact_data.get("campus_id", ""))

    if "data" in contact_data and isinstance(contact_data["data"], dict):
        for k, v in contact_data["data"].items():
            add_entry(k, v)

    if extra_data:
        for k, v in extra_data.items():
            add_entry(k, v)

    def replace_var(match):
        var_name = match.group(1).strip()
        if var_name in combined_data:
            return combined_data[var_name]
        var_lower = var_name.lower()
        if var_lower in combined_data:
            return combined_data[var_lower]
        var_norm = re.sub(r"[^a-zA-Z0-9]", "", var_name).lower()
        if var_norm in combined_data:
            return combined_data[var_norm]
        return match.group(0)

    return re.sub(r"\{([^{}]+)\}", replace_var, template)
