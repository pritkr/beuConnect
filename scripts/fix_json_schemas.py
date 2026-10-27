import json
from pathlib import Path

def fix_question(q):
    # Fix 'number' to 'id'
    if 'number' in q and 'id' not in q:
        q['id'] = str(q.pop('number'))
    elif 'id' in q:
        q['id'] = str(q['id'])
    else:
        q['id'] = "unknown"

    # Fix 'marks' to number or null
    if 'marks' in q:
        try:
            q['marks'] = int(q['marks'])
        except (ValueError, TypeError):
            q['marks'] = None
    else:
        q['marks'] = None

    # Fix 'parts' or 'subquestions' to 'sub_questions'
    sub_qs = []
    if 'parts' in q:
        sub_qs = q.pop('parts')
    elif 'sub_questions' in q:
        sub_qs = q['sub_questions']
    elif 'subquestions' in q:
        sub_qs = q.pop('subquestions')

    if sub_qs:
        fixed_sub_qs = []
        for sq in sub_qs:
            if 'label' in sq and 'id' not in sq:
                sq['id'] = f"{q['id']}{sq.pop('label')}"
            elif 'id' in sq:
                sq['id'] = str(sq['id'])
            else:
                sq['id'] = f"{q['id']}_sub"
            
            if 'marks' in sq:
                try:
                    sq['marks'] = int(sq['marks'])
                except (ValueError, TypeError):
                    sq['marks'] = None
            else:
                sq['marks'] = None

            fixed_sub_qs.append(sq)
        q['sub_questions'] = fixed_sub_qs

    return q

def fix_schemas():
    base_dir = Path("src/content/pyqs")
    fixed_count = 0
    error_count = 0

    for json_file in base_dir.rglob("*.json"):
        try:
            with open(json_file, 'r', encoding='utf-8') as f:
                data = json.load(f)

            if "metadata" not in data or "sections" not in data:
                # We need to transform this file
                new_data = {}
                
                subject = data.get('subject', 'Unknown Subject')
                code = data.get('code', json_file.parent.name)
                year_val = data.get('year', 0)
                try:
                    year_int = int(str(year_val).split('_')[0])
                except:
                    year_int = int(json_file.stem.split('_')[0])

                new_data['metadata'] = {
                    "university": "Bihar Engineering University, Patna",
                    "exam_title": f"B.Tech Examination, {year_int}",
                    "subject": subject,
                    "subject_slug": subject.lower().replace(' ', '-').replace(',', '').replace('.', ''),
                    "subject_code": str(code),
                    "year": year_int,
                    "semester": 0,
                    "time": data.get('time', "3 hours"),
                    "full_marks": data.get('full_marks', 70)
                }

                new_data['instructions'] = data.get('instructions', [
                    "The marks are indicated in the right-hand margin.",
                    "There are NINE questions in this paper.",
                    "Attempt FIVE questions in all.",
                    "Question No. 1 is compulsory."
                ])

                # Process questions
                raw_questions = data.get('questions', [])
                fixed_questions = [fix_question(q) for q in raw_questions]

                new_data['sections'] = [
                    {
                        "section_title": "Questions",
                        "questions": fixed_questions
                    }
                ]

                # Write back
                with open(json_file, 'w', encoding='utf-8') as f:
                    json.dump(new_data, f, indent=2)
                
                fixed_count += 1

        except Exception as e:
            print(f"Error processing {json_file}: {e}")
            error_count += 1

    print(f"Fixed {fixed_count} files. Errors: {error_count}")

if __name__ == "__main__":
    fix_schemas()
