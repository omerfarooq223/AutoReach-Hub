from pathlib import Path
import pandas as pd

def generate_sample_files(output_dir: str = "."):
    out_path = Path(output_dir)
    out_path.mkdir(parents=True, exist_ok=True)

    data = [
        {
            "Name": "Ali Khan",
            "Phone": "03001234567",
            "Email": "25100001@lums.edu.pk",
            "RollNumber": "25100001",
            "Department": "Computer Science",
            "CourseName": "CS 300 - Algorithms",
            "DueAmount": "Rs. 4,500",
            "MeetingTime": "Monday 10:00 AM"
        },
        {
            "Name": "Fatima Ahmed",
            "Phone": "+92 321 7654321",
            "Email": "25100002@lums.edu.pk",
            "RollNumber": "25100002",
            "Department": "Electrical Engineering",
            "CourseName": "EE 220 - Signals",
            "DueAmount": "Rs. 0",
            "MeetingTime": "Monday 11:30 AM"
        },
        {
            "Name": "Zainab Malik",
            "Phone": "0333 9876543",
            "Email": "25100003@lums.edu.pk",
            "RollNumber": "25100003",
            "Department": "Economics",
            "CourseName": "ECON 101 - Microeconomics",
            "DueAmount": "Rs. 12,000",
            "MeetingTime": "Tuesday 2:00 PM"
        },
        {
            "Name": "Hamza Tariq",
            "Phone": "03451122334",
            "Email": "25100004@lums.edu.pk",
            "RollNumber": "25100004",
            "Department": "Business Administration",
            "CourseName": "MGMT 210 - Marketing",
            "DueAmount": "Rs. 1,500",
            "MeetingTime": "Wednesday 9:00 AM"
        },
        {
            "Name": "Ayesha Siddiqui",
            "Phone": "+923015566778",
            "Email": "25100005@lums.edu.pk",
            "RollNumber": "25100005",
            "Department": "Computer Science",
            "CourseName": "CS 300 - Algorithms",
            "DueAmount": "Rs. 0",
            "MeetingTime": "Thursday 3:30 PM"
        }
    ]

    df = pd.DataFrame(data)
    
    excel_path = out_path / "sample_contacts.xlsx"
    csv_path = out_path / "sample_contacts.csv"

    df.to_excel(excel_path, index=False)
    df.to_csv(csv_path, index=False)

    print(f"Generated sample Excel: {excel_path}")
    print(f"Generated sample CSV: {csv_path}")
    return str(excel_path), str(csv_path)

if __name__ == "__main__":
    generate_sample_files(".")
