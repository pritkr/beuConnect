# /// script
# requires-python = ">=3.13"
# dependencies = [
#     "beautifulsoup",
#     "requests",
# ]
# ///

import requests
from bs4 import BeautifulSoup
import csv
import time

def scrape_students(session="24", branch_code="105", college_code="157", start=1, end=120, sem=1):
    """
    Scrape student list by registration number pattern and save to CSV.
    """
    base_url = "https://prit.eu.org/BEUConnect/api/result"
    filename = f"students_{session}_{college_code}_{branch_code}.csv"

    # CSV setup
    with open(filename, "w", newline="", encoding="utf-8") as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow(["Session", "RegNo", "Name"])

        for i in range(start, end + 1):
            reg_no = f"{session}{branch_code}{college_code}{i:03d}"
            url = f"{base_url}?reg={reg_no}&sem={sem}"

            try:
                r = requests.get(url, timeout=10)
                r.raise_for_status()
            except Exception as e:
                print(f"⚠️ Error fetching {reg_no}: {e}")
                time.sleep(2)
                continue

            soup = BeautifulSoup(r.text, "html.parser")

            # Stop if record not found
            if soup.find("td", colspan="9", string=lambda s: s and "No Record Found" in s):
                print(f"🛑 No record found at {reg_no}. Ending scrape.")
                break

            name_tag = soup.find("span", id="ContentPlaceHolder1_DataList1_StudentNameLabel_0")
            if not name_tag:
                print(f"⚠️ No name found for {reg_no}")
                continue

            name = name_tag.get_text(strip=True)
            session_year = f"20{session[:2]}-20{int(session[:2])+4}"

            writer.writerow([session_year, reg_no, name])
            print(f"✅ {reg_no} → {name}")

            # time.sleep(0.5)  # prevent server overload

    print(f"\n🎯 Done! Saved results to {filename}")

if __name__ == "__main__":
    # Example: Civil branch (code 101) GEC Sheikhpura (college code 157)
    # from 24101157001 to 24101157120
    scrape_students(session="24", branch_code="101", college_code="157", start=1, end=120, sem=1)
