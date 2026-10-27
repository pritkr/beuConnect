import os
import json
import re
import argparse

def parse_md_pyq(md_content, subject_slug, code, year, semester):
    # This parser assumes the structure you provided in the example
    # Q.1 ... \n (a) ... \n Q.2 ...
    
    lines = md_content.split('\n')
    
    university = "Bihar Engineering University, Patna"
    exam_title = ""
    subject = ""
    full_marks = 70
    time_str = "03 Hours"
    
    # Try to extract metadata from the top headers
    for line in lines[:15]:
        if "Examination," in line:
            exam_title = line.replace('#', '').strip()
        if "**Subject:**" in line:
            subject = line.replace('**Subject:**', '').strip()
            
    sections = []
    current_section = None
    current_q = None
    
    # Regex to detect main questions (e.g., "Q.1", "**Q.2", "Q. 3")
    q_pattern = re.compile(r'^\**Q\.?\s*(\d+)\s*(.*?)(?:\[(\d+)\])?\**$')
    # Regex to detect sub-questions (e.g., "(a)", "**(b)**")
    sq_pattern = re.compile(r'^\**\(([a-z])\)\s*(.*?)(?:\[(\d+)\])?\**$')

    for line in lines:
        line = line.strip()
        if not line or line.startswith('---'):
            continue
            
        q_match = q_pattern.match(line)
        sq_match = sq_pattern.match(line)
        
        if q_match:
            q_num = q_match.group(1)
            q_text = q_match.group(2).strip()
            q_marks = int(q_match.group(3)) if q_match.group(3) else None
            
            # Start a new section block for each main question
            current_section = {
                "section_title": f"Q.{q_num} {q_text}",
                "total_marks": q_marks,
                "questions": []
            }
            sections.append(current_section)
            
        elif sq_match and current_section:
            sq_label = sq_match.group(1)
            sq_text = sq_match.group(2).strip()
            sq_marks = int(sq_match.group(3)) if sq_match.group(3) else None
            
            current_section["questions"].append({
                "id": f"q{len(sections)}_{sq_label}",
                "type": "theory",
                "text": f"({sq_label}) {sq_text}",
                "marks": sq_marks
            })
        elif current_section and len(current_section["questions"]) == 0:
            # If a question doesn't have parts, the text might spill to the next line
            # or it's a standalone question block.
             current_section["questions"].append({
                "id": f"q{len(sections)}_main",
                "type": "theory",
                "text": line
            })

    json_data = {
        "metadata": {
            "university": university,
            "exam_title": exam_title,
            "subject": subject,
            "subject_slug": subject_slug,
            "subject_code": code,
            "year": int(year),
            "semester": int(semester),
            "time": time_str,
            "full_marks": full_marks
        },
        "sections": sections
    }

    return json_data

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Convert Gemini MD PYQs to JSON")
    parser.add_argument("--input", required=True, help="Input MD file")
    parser.add_argument("--output", required=True, help="Output JSON file")
    parser.add_argument("--slug", required=True, help="Subject Slug (e.g. digital-electronics)")
    parser.add_argument("--code", required=True, help="Subject Code (e.g. 100403)")
    parser.add_argument("--year", required=True, type=int, help="Year")
    parser.add_argument("--sem", required=True, type=int, help="Semester")
    args = parser.parse_args()

    with open(args.input, 'r', encoding='utf-8') as f:
        md_content = f.read()

    data = parse_md_pyq(md_content, args.slug, args.code, args.year, args.sem)

    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    print(f"✅ Successfully converted {args.input} -> {args.output}")
