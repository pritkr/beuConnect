import json
import os
import glob
from pathlib import Path

def normalize_subject_code(code):
    if not code:
        return ""
    # Extract code from things like "BSC-109 (100301)"
    if "(" in code and ")" in code:
        return code.split("(")[1].split(")")[0].strip()
    return code.strip()

def get_existing_papers():
    existing = set()
    base_dir = Path("src/content/pyqs")
    for json_file in base_dir.rglob("*.json"):
        # subject_code is the parent directory name
        subject_code = normalize_subject_code(json_file.parent.name)
        
        # Open file to get metadata year if needed, but filename is usually [year].json
        year_str = json_file.stem.split("_")[0] # handle 2024_v2 -> 2024
        try:
            year = int(year_str)
            existing.add((subject_code, year))
        except ValueError:
            continue
    return existing

def find_gaps():
    with open("beu_dataset/selected_subjects_full_details.json", "r") as f:
        data = json.load(f)
    
    existing = get_existing_papers()
    
    missing_records = []
    
    for subject in data.get("subjects", []):
        for record in subject.get("records", []):
            code = normalize_subject_code(record.get("subject_code", ""))
            year = record.get("exam_year")
            
            if (code, year) not in existing:
                missing_records.append({
                    "subject": record.get("subject_name"),
                    "code": code,
                    "year": year,
                    "filename": record.get("filename"),
                    "url": record.get("source_url")
                })
    
    return missing_records

if __name__ == "__main__":
    gaps = find_gaps()
    print(f"Total missing records: {len(gaps)}")
    
    # Save to a file for easier viewing if it's long
    with open("missing_papers.json", "w") as f:
        json.dump(gaps, f, indent=2)
    
    # Show summary of first 10
    for g in gaps[:10]:
        print(f"- {g['year']} {g['subject']} ({g['code']}): {g['filename']}")
