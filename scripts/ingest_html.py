import os
import json
import re
from bs4 import BeautifulSoup
import argparse

def parse_html_pyq(html_content, subject_slug, file_path):
    soup = BeautifulSoup(html_content, 'html.parser')
    
    # 1. Metadata
    university = soup.find(class_="paper-university")
    university_text = university.text.strip() if university else "Unknown University"
    
    exam_title = soup.find(class_="paper-exam-title")
    exam_title_text = exam_title.text.strip() if exam_title else ""
    
    # Extract year and semester from exam title (e.g., "B. Tech 4th Semester Examination, 2024")
    year_match = re.search(r'\b(20\d{2})\b', exam_title_text)
    year = int(year_match.group(1)) if year_match else 0
    
    sem_match = re.search(r'(\d)(st|nd|rd|th)\s+Semester', exam_title_text, re.IGNORECASE)
    semester = int(sem_match.group(1)) if sem_match else 0

    subject_tag = soup.find('h3')
    subject_text = subject_tag.text.strip() if subject_tag else ""

    details = soup.find(class_="paper-details")
    time_str, code_str, marks_str = "", "", ""
    if details:
        spans = details.find_all('span')
        for span in spans:
            text = span.text.strip()
            if text.lower().startswith('time:'):
                time_str = text.split(':', 1)[1].strip()
            elif text.lower().startswith('code:'):
                code_str = text.split(':', 1)[1].strip()
            elif text.lower().startswith('full marks:'):
                try:
                    marks_str = int(text.split(':', 1)[1].strip())
                except:
                    pass

    # 2. Instructions
    instructions = []
    inst_block = soup.find(class_="paper-instructions")
    if inst_block:
        items = inst_block.find_all('li')
        for item in items:
            instructions.append(item.text.strip())

    # 3. Sections (Question Blocks)
    sections = []
    blocks = soup.find_all(class_="question-block")
    for b_idx, block in enumerate(blocks):
        q_title_div = block.find(class_="question-title")
        if not q_title_div: continue
        
        spans = q_title_div.find_all('span')
        section_title = spans[0].text.strip() if len(spans) > 0 else ""
        
        total_marks = None
        if len(spans) > 1 and spans[1].get('class') and 'marks' in spans[1].get('class'):
            m_text = spans[1].text.strip()
            # Extract number from [14]
            m_match = re.search(r'\[?(\d+)\]?', m_text)
            if m_match:
                total_marks = int(m_match.group(1))
        
        q_body = block.find(class_="question-body")
        questions = []
        if q_body:
            sub_qs = q_body.find_all(class_="sub-question")
            for sq_idx, sq in enumerate(sub_qs):
                p_tag = sq.find('p')
                q_text = p_tag.text.strip() if p_tag else ""
                
                # Check for KaTeX/MathJax patterns and ensure they are clean
                # We assume the HTML has `\( ... \)` for inline math, which works for KaTeX/MathJax.
                # Just keeping the raw text is usually enough.
                
                q_type = "theory"
                options = []
                opt_list = sq.find(class_="options-list")
                if opt_list:
                    q_type = "mcq"
                    opt_items = opt_list.find_all('li')
                    for oi in opt_items:
                        options.append(oi.text.strip())
                
                # Metadata
                freq = sq.get('data-freq')
                stars_str = sq.get('data-stars')
                stars = len(stars_str) if stars_str else None
                freq = int(freq) if freq else None
                
                q_obj = {
                    "id": f"q{b_idx+1}_{sq_idx+1}",
                    "type": q_type,
                    "text": q_text,
                }
                if options:
                    q_obj["options"] = options
                if stars or freq:
                    q_obj["metadata"] = {}
                    if stars: q_obj["metadata"]["stars"] = stars
                    if freq: q_obj["metadata"]["freq"] = freq
                
                questions.append(q_obj)
        else:
            # Maybe the question body doesn't have .sub-question, just raw text
            p_tag = block.find('p')
            if p_tag:
                 questions.append({
                     "id": f"q{b_idx+1}",
                     "type": "theory",
                     "text": p_tag.text.strip()
                 })

        sections.append({
            "section_title": section_title,
            "total_marks": total_marks,
            "questions": questions
        })

    # Assemble JSON
    json_data = {
        "metadata": {
            "university": university_text,
            "exam_title": exam_title_text,
            "subject": subject_text,
            "subject_slug": subject_slug,
            "subject_code": code_str,
            "year": year,
            "semester": semester,
        },
        "instructions": instructions,
        "sections": sections
    }
    
    if time_str: json_data["metadata"]["time"] = time_str
    if marks_str: json_data["metadata"]["full_marks"] = marks_str

    return json_data

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Convert BEU HTML PYQs to JSON")
    parser.add_argument("--input", required=True, help="Input HTML file")
    parser.add_argument("--output", required=True, help="Output JSON file")
    parser.add_argument("--slug", required=True, help="Subject Slug (e.g. discrete-mathematics)")
    args = parser.parse_args()

    with open(args.input, 'r', encoding='utf-8') as f:
        html_content = f.read()

    data = parse_html_pyq(html_content, args.slug, args.input)

    # Ensure directory exists
    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    
    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    print(f"✅ Successfully converted {args.input} -> {args.output}")
