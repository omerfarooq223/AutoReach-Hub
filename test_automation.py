import unittest
import tempfile
import os
import pandas as pd
from excel_handler import clean_phone_number, clean_email, auto_detect_columns, render_message_template, load_contacts_file
from whatsapp_handler import generate_whatsapp_url, generate_whatsapp_app_url

class TestAutomationCore(unittest.TestCase):
    def test_phone_cleaning_pakistan(self):
        # Local format with 0
        self.assertEqual(clean_phone_number("03001234567", "92"), "923001234567")
        # Dashes and spaces
        self.assertEqual(clean_phone_number("0300-1234567", "92"), "923001234567")
        self.assertEqual(clean_phone_number("0300 123 4567", "92"), "923001234567")
        # International with +
        self.assertEqual(clean_phone_number("+92 300 1234567", "92"), "923001234567")
        # Already 92 format
        self.assertEqual(clean_phone_number("923001234567", "92"), "923001234567")
        # 10 digits without leading 0
        self.assertEqual(clean_phone_number("3001234567", "92"), "923001234567")

    def test_phone_cleaning_international(self):
        # US Number with +1
        self.assertEqual(clean_phone_number("+1 (555) 123-4567", "1"), "15551234567")
        # UK Number
        self.assertEqual(clean_phone_number("+44 7911 123456", "44"), "447911123456")

    def test_email_cleaning(self):
        self.assertEqual(clean_email("student.name@university.edu"), "student.name@university.edu")
        self.assertEqual(clean_email("  test.user@institution.org  "), "test.user@institution.org")

    def test_auto_detect_columns(self):
        cols = ["Student Name", "Mobile Number", "Official Email", "Roll No", "Course"]
        detected = auto_detect_columns(cols)
        self.assertEqual(detected["name_col"], "Student Name")
        self.assertEqual(detected["phone_col"], "Mobile Number")
        self.assertEqual(detected["email_col"], "Official Email")

    def test_template_rendering(self):
        contact = {
            "name": "Ali Khan",
            "phone_clean": "923001234567",
            "email_clean": "ali@university.edu",
            "data": {
                "RollNumber": "2026-CS-101",
                "CourseName": "CS 300",
                "MeetingTime": "Monday 10 AM"
            }
        }
        template = "Hi {Name} (Roll: {RollNumber}), your {CourseName} class is at {MeetingTime}."
        rendered = render_message_template(template, contact)
        self.assertEqual(rendered, "Hi Ali Khan (Roll: 2026-CS-101), your CS 300 class is at Monday 10 AM.")

    def test_whatsapp_url_generation(self):
        phone = "923001234567"
        msg = "Hello Ali, class at 10 AM!"
        url = generate_whatsapp_url(phone, msg)
        self.assertTrue(url.startswith("https://wa.me/923001234567?text="))
        self.assertIn("Hello%20Ali", url)

    def test_contacts_file_loading(self):
        # Create a clean temporary Excel test file
        df = pd.DataFrame([
            {"Name": "Ali Khan", "Phone": "+92 300 1234567", "Email": "ali.khan@gmail.com", "Campus ID": "2017110021"}
        ])
        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as f:
            temp_path = f.name
            df.to_excel(temp_path, index=False)

        try:
            contacts, columns, detected = load_contacts_file(temp_path)
            self.assertEqual(len(contacts), 1)
            self.assertIn("Name", columns)
            self.assertIn("Phone", columns)
            self.assertIn("Email", columns)
            self.assertEqual(contacts[0]["name"], "Ali Khan")
            self.assertEqual(contacts[0]["phone_clean"], "923001234567")
            self.assertEqual(contacts[0]["email_clean"], "ali.khan@gmail.com")
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

if __name__ == "__main__":
    unittest.main()


