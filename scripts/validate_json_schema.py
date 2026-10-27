import json
import os
from pathlib import Path

def validate_schema():
    base_dir = Path("src/content/pyqs")
    invalid_files = []
    
    for json_file in base_dir.rglob("*.json"):
        try:
            with open(json_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                
                # Check for top-level keys
                if "metadata" not in data or "sections" not in data:
                    invalid_files.append((str(json_file), "Missing metadata or sections"))
                    continue
                    
        except Exception as e:
            invalid_files.append((str(json_file), f"Parse error: {str(e)}"))
            
    print(f"Total invalid files: {len(invalid_files)}")
    for f, reason in invalid_files[:20]:
        print(f"{f}: {reason}")
        
if __name__ == "__main__":
    validate_schema()
