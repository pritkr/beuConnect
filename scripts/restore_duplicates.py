import shutil
import os
from pathlib import Path

def restore_archive():
    archive_dir = Path("src/content/duplicates_archive")
    target_dir = Path("src/content/pyqs")
    
    if not archive_dir.exists():
        print("Archive dir doesn't exist.")
        return

    count = 0
    for p in archive_dir.rglob("*.json"):
        # Original subject code folder is the parent of the filename in the archive
        subject_code = p.parent.name
        dest_folder = target_dir / subject_code
        dest_folder.mkdir(parents=True, exist_ok=True)
        
        dest_path = dest_folder / p.name
        
        # Handle collision if it already exists (unlikely given it was MOVED from there)
        # But maybe we already have a file with that name
        if dest_path.exists():
            # If filenames match, check content or just append suffix
            dest_path = dest_folder / f"{p.stem}_restored{p.suffix}"
            
        print(f"Restoring: {p} -> {dest_path}")
        shutil.move(str(p), str(dest_path))
        count += 1
    
    print(f"Restoration complete. Restored {count} files.")

if __name__ == "__main__":
    restore_archive()
