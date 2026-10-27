import json
import os
import re
from pathlib import Path
from collections import defaultdict

def get_similarity(text1, text2):
    # Simple word-based similarity
    words1 = set(re.findall(r'\w+', text1.lower()))
    words2 = set(re.findall(r'\w+', text2.lower()))
    if not words1 or not words2: return 0
    intersection = words1.intersection(words2)
    return len(intersection) / max(len(words1), len(words2))

def get_content_summary(data):
    # Extract all question text to compare content
    all_text = []
    empty_count = 0
    total_q = 0
    
    if "sections" in data:
        for section in data["sections"]:
            for q in section.get("questions", []):
                total_q += 1
                txt = q.get("text", "")
                if not txt or txt == "Answer the following:" or txt == "...":
                    empty_count += 1
                all_text.append(txt)
                for sq in q.get("sub_questions", []):
                    total_q += 1
                    sq_txt = sq.get("text", "")
                    if not sq_txt or sq_txt == "...":
                        empty_count += 1
                    all_text.append(sq_txt)
    
    return " ".join(all_text), empty_count, total_q

def fix_latex(text):
    if not text: return ""
    # Fix common hallucinations
    text = text.replace("\\voltage", " V")
    text = text.replace("\\ampere", " A")
    text = text.replace("\\ohm", "\\Omega")
    # Ensure math is wrapped in $ if it looks like it needs it (simple heuristic)
    # This is risky, let's just fix known broken escapes for now
    text = re.sub(r'(?<!\\)\\([{}])', r'\\\\\1', text)
    return text

def cleanup():
    base_dir = Path("src/content/pyqs")
    papers = defaultdict(list)
    
    # 1. Group papers
    for p in base_dir.rglob("*.json"):
        try:
            with open(p, 'r') as f:
                data = json.load(f)
            
            code = data.get("metadata", {}).get("subject_code", p.parent.name)
            year = data.get("metadata", {}).get("year", 0)
            
            content_text, empty_count, total_q = get_content_summary(data)
            score = len(content_text) - (empty_count * 100) # Penalty for empty ones
            
            papers[(code, year)].append({
                "path": p,
                "data": data,
                "text": content_text,
                "score": score,
                "total_q": total_q
            })
        except:
            continue

    deleted_count = 0
    # 2. Deduplicate
    for key, versions in papers.items():
        if len(versions) > 1:
            # Sort by score descending
            versions.sort(key=lambda x: x["score"], reverse=True)
            
            best = versions[0]
            for other in versions[1:]:
                # If similarity > 80%, delete the inferior one
                sim = get_similarity(best["text"], other["text"])
                if sim > 0.8:
                    print(f"Deleting duplicate: {other['path']} (Sim: {sim:.2f}, Score: {other['score']} vs {best['score']})")
                    other['path'].unlink()
                    deleted_count += 1
                else:
                    # Might be different sets, keep for now but rename if needed? 
                    # Actually, the user said "remove them"
                    pass

    # 3. Final Polish on remaining files
    cleaned_count = 0
    for p in base_dir.rglob("*.json"):
        changed = False
        with open(p, 'r') as f:
            data = json.load(f)
        
        if "sections" in data:
            for section in data["sections"]:
                new_qs = []
                for q in section.get("questions", []):
                    # Remove completely empty questions
                    if not q.get("text") or q["text"] == "...":
                        changed = True
                        continue
                    
                    q["text"] = fix_latex(q["text"])
                    
                    if "sub_questions" in q:
                        new_sqs = []
                        for sq in q["sub_questions"]:
                            if sq.get("text") and sq["text"] != "...":
                                sq["text"] = fix_latex(sq["text"])
                                new_sqs.append(sq)
                            else:
                                changed = True
                        q["sub_questions"] = new_sqs
                    
                    new_qs.append(q)
                section["questions"] = new_qs
        
        if changed:
            with open(p, 'w') as f:
                json.dump(data, f, indent=2)
            cleaned_count += 1

    print(f"Cleanup complete. Deleted {deleted_count} duplicates. Cleaned {cleaned_count} files.")

if __name__ == "__main__":
    cleanup()
