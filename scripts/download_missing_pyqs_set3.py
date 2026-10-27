import json
import os
import requests
import time
from pathlib import Path

def download_missing():
    # Note: set3 records use 'source_url' not 'url'
    with open("missing_papers_set3.json", "r") as f:
        missing = json.load(f)
    
    output_dir = Path("beu_dataset/pdfs")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"Starting download of {len(missing)} PDFs...")
    
    for i, paper in enumerate(missing):
        url = paper.get("source_url")
        filename = paper.get("filename")
        if not url or not filename:
            continue
        
        target_path = output_dir / filename
        
        if target_path.exists():
            print(f"[{i+1}/{len(missing)}] Skipping {filename} (already exists)")
            continue
            
        print(f"[{i+1}/{len(missing)}] Downloading {filename}...")
        try:
            response = requests.get(url, stream=True, timeout=30)
            response.raise_for_status()
            
            with open(target_path, "wb") as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            
            # Rate limiting to be polite
            time.sleep(0.5)
        except Exception as e:
            print(f"Error downloading {filename}: {e}")

if __name__ == "__main__":
    download_missing()
