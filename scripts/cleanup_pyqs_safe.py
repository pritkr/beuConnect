import json
import os
import shutil
from pathlib import Path
from collections import defaultdict

def get_question_fingerprint(data):
    """Creates a fingerprint based on the text of the first few questions."""
    fingerprint = []
    if "sections" in data:
        for section in data["sections"]:
            for q in section.get("questions", []):
                txt = q.get("text", "").strip()
                if txt and txt != "Answer the following:" and txt != "...":
                    # Only take highly significant alphanumeric characters to avoid whitespace/punctuation differences
                    clean_txt = ''.join(c for c in txt if c.isalnum()).lower()
                    fingerprint.append(clean_txt[:50])
                if len(fingerprint) >= 3: # Use first 3 valid questions
                    break
            if len(fingerprint) >= 3:
                break
    return tuple(fingerprint)

def cleanup_safe():
    base_dir = Path("src/content/pyqs")
    archive_dir = Path("src/content/duplicates_archive")
    archive_dir.mkdir(parents=True, exist_ok=True)
    
    papers = defaultdict(list)
    
    # 1. Group papers by code and year
    for p in base_dir.rglob("*.json"):
        # Ignore already archived files
        if "duplicates_archive" in str(p):
            continue
            
        try:
            with open(p, 'r') as f:
                data = json.load(f)
            
            code = data.get("metadata", {}).get("subject_code", p.parent.name)
            year = data.get("metadata", {}).get("year", 0)
            
            fingerprint = get_question_fingerprint(data)
            content_len = sum(len(q.get("text", "")) for s in data.get("sections", []) for q in s.get("questions", []))
            
            papers[(code, year)].append({
                "path": p,
                "fingerprint": fingerprint,
                "content_len": content_len,
                "filename": p.name
            })
        except:
            continue

    moved_count = 0
    for key, versions in papers.items():
        if len(versions) > 1:
            # Group by fingerprint
            by_fingerprint = defaultdict(list)
            for v in versions:
                by_fingerprint[v["fingerprint"]].append(v)
            
            for fp, dups in by_fingerprint.items():
                if len(dups) > 1:
                    # Keep the one with the longest content
                    dups.sort(key=lambda x: x["content_len"], reverse=True)
                    winner = dups[0]
                    for loser in dups[1:]:
                        # Safety: Don't deduplicate if the fingerprint is essentially empty
                        if not fp or len(fp[0]) < 10:
                            print(f"Skipping empty/weak fingerprint for {loser['path']}")
                            continue
                            
                        # Move to archive instead of delete
                        target_folder = archive_dir / key[0]
                        target_folder.mkdir(parents=True, exist_ok=True)
                        target_path = target_folder / loser['filename']
                        
                        # Handle potential filename collisions in archive
                        counter = 1
                        while target_path.exists():
                            target_path = target_folder / f"{loser['filename'].replace('.json', '')}_{counter}.json"
                            counter += 1
                            
                        print(f"Archiving duplicate: {loser['path']} -> {target_path} (Match: {winner['path']})")
                        shutil.move(str(loser['path']), str(target_path))
                        moved_count += 1

    print(f"Safe cleanup complete. Archived {moved_count} exact duplicates.")

if __name__ == "__main__":
    cleanup_safe()
