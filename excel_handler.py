import re
from pathlib import Path
from typing import List, Dict, Any, Tuple, Optional
import pandas as pd


def clean_phone_number(phone_raw: Any, default_country_code: str = "92") -> str:
    """
    Sanitizes and normalizes phone numbers into international digit format (e.g., 923001234567).
    """
    if pd.isna(phone_raw) or phone_raw is None:
        return ""
    
    # Convert float to int string if needed (e.g. 923001234567.0 -> "923001234567")
    if isinstance(phone_raw, float):
        if phone_raw.is_integer():
            phone_str = str(int(phone_raw))
        else:
            phone_str = str(phone_raw)
    else:
        phone_str = str(phone_raw).strip()
    
    # Check invalid placeholder strings
    if phone_str.lower() in ["nan", "none", "null", "n/a", "na", "nil", "undefined", ""]:
        return ""

    # Strip trailing decimal zeros if imported as string (e.g., "923001234567.0")
    if phone_str.endswith(".0"):
        phone_str = phone_str[:-2]

    # If scientific notation (e.g. 9.23001e+11)
    if "e+" in phone_str.lower():
        try:
            phone_str = f"{int(float(phone_str))}"
        except Exception:
            pass

    # Extract digits only (preserving '+' if at start)
    has_plus = phone_str.startswith("+")
    digits_only = re.sub(r"[^\d]", "", phone_str)

    if not digits_only:
        return ""

    # Clean default country code from leading '+'
    default_cc = re.sub(r"[^\d]", "", str(default_country_code or "92"))

    # If it started with '+', digits_only already includes the country code
    if has_plus:
        return digits_only

    # If it starts with '00', replace with digits without '00'
    if digits_only.startswith("00"):
        return digits_only[2:]

    # If it starts with single '0' (e.g., 03001234567 in Pakistan), replace 0 with default country code
    if digits_only.startswith("0") and len(digits_only) >= 10:
        return f"{default_cc}{digits_only[1:]}"

    # If length is typical national length without leading zero (e.g. 3001234567 in Pakistan: 10 digits)
    if len(digits_only) == 10 and default_cc == "92" and digits_only.startswith("3"):
        return f"{default_cc}{digits_only}"

    # If it already starts with the country code
    if digits_only.startswith(default_cc) and len(digits_only) > len(default_cc) + 7:
        return digits_only

    # Otherwise if it has 7-9 digits, prepend country code
    if len(digits_only) <= 10 and not digits_only.startswith(default_cc):
        return f"{default_cc}{digits_only}"

    return digits_only


def clean_email(email_raw: Any) -> str:
    """Cleans and validates basic email string format."""
    if pd.isna(email_raw) or email_raw is None:
        return ""
    email_str = str(email_raw).strip()
    if email_str.lower() in ["nan", "none", "null", "n/a", "na", "nil", "undefined", ""]:
        return ""
    # Simple regex check
    if re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email_str):
        return email_str
    return email_str



def auto_detect_columns(columns: List[str]) -> Dict[str, Optional[str]]:
    """
    Intelligently identifies which column corresponds to Name, Phone, and Email.
    """
    detected: Dict[str, Optional[str]] = {
        "name_col": None,
        "phone_col": None,
        "email_col": None
    }

    # Keyword matching priorities
    phone_keywords = ["phone", "whatsapp", "mobile", "contact", "cell", "number", "tel", "ph"]
    email_keywords = ["email", "mail", "e-mail", "email_address"]
    name_keywords = ["name", "full_name", "fullname", "student_name", "person", "contact_name", "first_name"]

    # Lowercase mapped
    col_lower = {c: str(c).strip().lower() for c in columns}

    # Match Email
    for col, clow in col_lower.items():
        if any(k == clow or k in clow for k in email_keywords):
            detected["email_col"] = col
            break

    # Match Phone
    for col, clow in col_lower.items():
        if any(k == clow or k in clow for k in phone_keywords):
            detected["phone_col"] = col
            break

    # Match Name
    for col, clow in col_lower.items():
        if any(k == clow or k in clow for k in name_keywords):
            detected["name_col"] = col
            break

    # Fallbacks if not detected
    if not detected["name_col"] and columns:
        detected["name_col"] = columns[0]
    if not detected["phone_col"] and len(columns) > 1:
        for col in columns:
            if col != detected["name_col"] and col != detected["email_col"]:
                detected["phone_col"] = col
                break
    if not detected["email_col"] and len(columns) > 2:
        for col in columns:
            if col != detected["name_col"] and col != detected["phone_col"]:
                detected["email_col"] = col
                break

    return detected


def load_contacts_file(
    file_path: str,
    default_country_code: str = "92",
    custom_mappings: Optional[Dict[str, str]] = None
) -> Tuple[List[Dict[str, Any]], List[str], Dict[str, Optional[str]]]:
    """
    Reads an Excel or CSV file and returns:
    1. List of parsed contact dictionaries
    2. List of all column headers
    3. Detected or mapped column names {name_col, phone_col, email_col}
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    suffix = path.suffix.lower()
    if suffix in [".xlsx", ".xls", ".xlsm"]:
        df = pd.read_excel(file_path, dtype=str)
    elif suffix == ".csv":
        df = pd.read_csv(file_path, dtype=str)
    else:
        raise ValueError(f"Unsupported file format: {suffix}. Please provide .xlsx, .xls, or .csv")

    # Drop entirely empty rows and clean columns
    df = df.dropna(how="all")
    columns = [str(c).strip() for c in df.columns if str(c).strip() and not str(c).startswith("Unnamed")]
    df = df[columns]

    # Map columns
    detected = auto_detect_columns(columns)
    if custom_mappings:
        if custom_mappings.get("name_col"):
            detected["name_col"] = custom_mappings["name_col"]
        if custom_mappings.get("phone_col"):
            detected["phone_col"] = custom_mappings["phone_col"]
        if custom_mappings.get("email_col"):
            detected["email_col"] = custom_mappings["email_col"]

    name_col = detected.get("name_col")
    phone_col = detected.get("phone_col")
    email_col = detected.get("email_col")

    contacts = []
    for idx, row in df.iterrows():
        row_dict = {}
        for col in columns:
            val = row.get(col)
            row_dict[col] = "" if pd.isna(val) else str(val).strip()

        raw_name = row_dict.get(name_col, f"Contact #{idx+1}") if name_col else f"Contact #{idx+1}"
        raw_phone = row_dict.get(phone_col, "") if phone_col else ""
        raw_email = row_dict.get(email_col, "") if email_col else ""

        cleaned_phone = clean_phone_number(raw_phone, default_country_code)
        cleaned_email = clean_email(raw_email)

        contact = {
            "id": idx + 1,
            "name": raw_name,
            "phone_raw": raw_phone,
            "phone_clean": cleaned_phone,
            "email_raw": raw_email,
            "email_clean": cleaned_email,
            "has_valid_email": bool(cleaned_email and "@" in cleaned_email),
            "has_valid_phone": bool(cleaned_phone and len(cleaned_phone) >= 7),
            "data": row_dict  # Full row dictionary for custom template placeholders
        }
        contacts.append(contact)

    return contacts, columns, detected


def render_message_template(template: str, contact_data: Dict[str, Any], extra_data: Optional[Dict[str, Any]] = None) -> str:
    """
    Renders message template with contact data placeholders.
    Supports: {Name}, {Phone}, {Email}, or any column name {Department}, {Roll No}, etc.
    Case-insensitive & flexible separator matching (spaces, underscores, dashes).
    """
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
        # Alphanumeric normalized (e.g., "Roll No" -> "rollno")
        k_alphanumeric = re.sub(r"[^a-zA-Z0-9]", "", k_clean).lower()
        if k_alphanumeric:
            combined_data[k_alphanumeric] = val_str

    # 1. Base contact fields
    add_entry("name", contact_data.get("name", ""))
    add_entry("phone", contact_data.get("phone_clean", "") or contact_data.get("phone_raw", ""))
    add_entry("email", contact_data.get("email_clean", "") or contact_data.get("email_raw", ""))

    # 2. Row data columns
    if "data" in contact_data and isinstance(contact_data["data"], dict):
        for k, v in contact_data["data"].items():
            add_entry(k, v)

    # 3. Extra data if passed
    if extra_data:
        for k, v in extra_data.items():
            add_entry(k, v)

    # Regex find all {placeholder}
    def replace_var(match):
        var_name = match.group(1).strip()
        # Direct exact lookup
        if var_name in combined_data:
            return combined_data[var_name]
        # Lowercase lookup
        var_lower = var_name.lower()
        if var_lower in combined_data:
            return combined_data[var_lower]
        # Normalized lookup
        var_norm = re.sub(r"[^a-zA-Z0-9]", "", var_name).lower()
        if var_norm in combined_data:
            return combined_data[var_norm]
        # Unmatched placeholder: return unchanged
        return match.group(0)

    rendered = re.sub(r"\{([^{}]+)\}", replace_var, template)
    return rendered

