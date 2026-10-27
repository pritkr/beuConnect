import os
import json
import re
import glob
import shutil
import uuid
from bs4 import BeautifulSoup

def parse_html_pyq(html_content, file_path, public_img_dir):
    soup = BeautifulSoup(html_content, 'html.parser')
    
    # The base path of the Apna BEU app
    www_base = "/home/pk/Downloads/Telegram Desktop/Apna BEU_app,biru,apnabeu_1,0,85/base/assets/www/"
    
    # Process images first so the text contains updated paths
    for img in soup.find_all('img'):
        src = img.get('src')
        if src:
            # Handle paths like img/beu/diagram/...
            img_path = os.path.join(www_base, src)
            if os.path.exists(img_path):
                ext = os.path.splitext(img_path)[1]
                new_img_name = f"{uuid.uuid4()}{ext}"
                new_img_path = os.path.join(public_img_dir, new_img_name)
                
                # Copy the image
                try:
                    shutil.copy2(img_path, new_img_path)
                    # Rewrite the src attribute for the web
                    img['src'] = f"/assets/pyqs/images/{new_img_name}"
                    # Add some standard styling
                    img['class'] = img.get('class', []) + ['pyq-img']
                    img['style'] = "max-width: 100%; height: auto; border-radius: 8px; margin: 1rem 0; display: block;"
                except Exception as e:
                    print(f"Failed to copy image {img_path}: {e}")
            else:
                print(f"Image not found at source: {img_path}")

    # 1. Metadata
    university = soup.find(class_="paper-university")
    university_text = university.text.strip() if university else "Bihar Engineering University, Patna"
    
    exam_title = soup.find(class_="paper-exam-title")
    exam_title_text = exam_title.text.strip() if exam_title else ""
    
    year_match = re.search(r'\b(20\d{2})\b', exam_title_text)
    if not year_match:
        # Fallback to filename
        year_match = re.search(r'\b(20\d{2})\b', file_path)
    year = int(year_match.group(1)) if year_match else 0
    
    sem_match = re.search(r'(\d)(st|nd|rd|th)\s+Semester', exam_title_text, re.IGNORECASE)
    semester = int(sem_match.group(1)) if sem_match else 0

    subject_tag = soup.find('h3')
    subject_text = subject_tag.text.strip() if subject_tag else ""
    if not subject_text:
        return None # Invalid PYQ format

    # Generate slug from subject
    subject_slug = re.sub(r'[^a-z0-9]+', '-', subject_text.lower()).strip('-')

    details = soup.find(class_="paper-details")
    time_str, code_str, marks_str = "03 Hours", "", 70
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

    # Fallback if code is empty:
    if not code_str:
        code_str = subject_slug

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
        # We need the inner HTML to preserve any formatting/images in the title
        section_title = spans[0].decode_contents().strip() if len(spans) > 0 else ""
        
        total_marks = None
        if len(spans) > 1 and spans[1].get('class') and 'marks' in spans[1].get('class'):
            m_text = spans[1].text.strip()
            m_match = re.search(r'\[?(\d+)\]?', m_text)
            if m_match:
                total_marks = int(m_match.group(1))
        
        q_body = block.find(class_="question-body")
        questions = []
        if q_body:
            sub_qs = q_body.find_all(class_="sub-question")
            for sq_idx, sq in enumerate(sub_qs):
                # Extract options first and remove them from the tree so they don't pollute the main question text
                q_type = "theory"
                options = []
                opt_list = sq.find(class_="options-list")
                if opt_list:
                    q_type = "mcq"
                    opt_items = opt_list.find_all('li')
                    for oi in opt_items:
                        options.append(oi.decode_contents().strip())
                    opt_list.decompose() # Remove options list from the DOM temporarily
                
                # Now extract everything left in the sub-question (which includes <p> and <img>)
                q_text = sq.decode_contents().strip()
                
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
            p_tag = block.find('p')
            if p_tag:
                 questions.append({
                     "id": f"q{b_idx+1}",
                     "type": "theory",
                     "text": p_tag.decode_contents().strip()
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

def process_all_html_files(base_dir, output_dir, img_dir):
    os.makedirs(img_dir, exist_ok=True)
    html_files = glob.glob(os.path.join(base_dir, "**/*.html"), recursive=True)
    success_count = 0
    fail_count = 0
    
    for file_path in html_files:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                html_content = f.read()
            
            data = parse_html_pyq(html_content, file_path, img_dir)
            if not data:
                print(f"⚠️ Skipped (No valid subject found): {file_path}")
                fail_count += 1
                continue
                
            code = data["metadata"]["subject_code"]
            year = data["metadata"]["year"]
            
            if not code:
                 code = data["metadata"]["subject_slug"]
            
            out_folder = os.path.join(output_dir, code)
            os.makedirs(out_folder, exist_ok=True)
            
            out_file = os.path.join(out_folder, f"{year}.json")
            
            if os.path.exists(out_file):
                if 'old_course' in file_path.lower():
                     out_file = os.path.join(out_folder, f"{year}_old.json")
                elif 'special' in file_path.lower() or 'special' in data['metadata']['exam_title'].lower():
                     out_file = os.path.join(out_folder, f"{year}_special.json")
                else:
                     v = 2
                     while os.path.exists(out_file):
                         out_file = os.path.join(out_folder, f"{year}_v{v}.json")
                         v += 1
                     
            with open(out_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            
            success_count += 1
            print(f"✅ Processed: {data['metadata']['subject']} ({year}) -> {out_file}")
            
        except Exception as e:
            print(f"❌ Failed to process {file_path}: {e}")
            fail_count += 1

    print(f"\n🎉 Done! Successfully processed {success_count} files. Failed {fail_count} files.")

if __name__ == "__main__":
    SOURCE_DIR = "/home/pk/Downloads/Telegram Desktop/Apna BEU_app,biru,apnabeu_1,0,85/base/assets/www/extracted_newer_pyqs/"
    OUTPUT_DIR = "src/content/pyqs/"
    IMG_DIR = "public/assets/pyqs/images/"
    
    print(f"Starting batch ingestion from {SOURCE_DIR}...")
    process_all_html_files(SOURCE_DIR, OUTPUT_DIR, IMG_DIR)
