import json
import re
from pathlib import Path

def fix_invalid_escapes(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # We want to replace \ followed by a character that is NOT one of the valid JSON escapes:
    # ", \, /, b, f, n, r, t, u
    # But we need to be careful. A simpler approach for LaTeX is to find words starting with \ 
    # like \text, \mu, \Omega, \alpha, \beta, \circ, \pi, \frac, \le, \ge, \Delta, \sum, \int, \infty
    # that are not valid JSON escapes.
    # Let's use a regex that finds \ followed by a letter (other than b,f,n,r,t,u) and escapes the \.
    # Actually, even \t for \text is a problem because \t is valid JSON (tab) but we wanted \\text.
    # If the file failed to parse, it means there is an invalid escape.
    # Let's just fix the specific files by a generic regex that escapes all backslashes that are not 
    # part of a valid JSON escape sequence. Wait, the easiest way for these 6 files is to 
    # just double all backslashes that are followed by letters, EXCEPT for \n.
    
    # To be safe, we'll manually fix the common LaTeX commands.
    latex_cmds = ['text', 'mu', 'Omega', 'alpha', 'beta', 'circ', 'pi', 'frac', 'le', 'ge', 'Delta', 'sum', 'int', 'infty', 'gamma', 'theta', 'sigma', 'omega', 'rho', 'lambda', 'tau', 'phi', 'psi', 'chi', 'upsilon', 'eta', 'xi', 'zeta', 'kappa', 'nu', 'epsilon', 'cdot', 'times', 'div', 'pm', 'mp', 'approx', 'neq', 'equiv', 'propto', 'sim', 'cong', 'sqrt', 'left', 'right', 'sin', 'cos', 'tan', 'log', 'ln', 'exp']
    
    for cmd in latex_cmds:
        # replace "\cmd" with "\\cmd" where it is not already "\\"
        content = re.sub(r'(?<!\\)\\' + cmd + r'\b', r'\\\\' + cmd, content)
        
    # Also fix common non-word characters
    content = re.sub(r'(?<!\\)\\([,;:%&$#_{}~^])', r'\\\\\1', content)
    
    # Try parsing to see if we fixed it
    try:
        json.loads(content)
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Fixed escapes in {file_path}")
        return True
    except json.JSONDecodeError as e:
        # If it still fails, we might have things like \v for \voltage or something
        # Let's try a broader brush: replace all \ followed by a letter (except n, r) with \\
        content = re.sub(r'(?<!\\)\\([a-zA-Z])', lambda m: '\\\\' + m.group(1) if m.group(1) not in ['n', 'r'] else '\\' + m.group(1), content)
        try:
            json.loads(content)
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"Fixed escapes (broad) in {file_path}")
            return True
        except Exception as e:
            print(f"Still failed to fix {file_path}: {e}")
            return False

def fix_all_schemas():
    base_dir = Path("src/content/pyqs")
    
    # First, try to fix the invalid escape files
    for p in base_dir.rglob("*.json"):
        try:
            with open(p, 'r', encoding='utf-8') as f:
                json.load(f)
        except json.JSONDecodeError:
            fix_invalid_escapes(p)

    # Now fix the missing 'text' property in all valid JSONs
    fixed_count = 0
    for json_file in base_dir.rglob("*.json"):
        try:
            with open(json_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                
            needs_save = False
            
            if 'sections' in data:
                for section in data['sections']:
                    for q in section.get('questions', []):
                        if 'text' not in q:
                            q['text'] = "Answer the following:"
                            needs_save = True
                            
                        # Ensure sub_questions also have text
                        for sq in q.get('sub_questions', []):
                            if 'text' not in sq:
                                sq['text'] = "..."
                                needs_save = True
            
            # Additional cleanup: ensure 'marks' is either number or null
            if 'sections' in data:
                for section in data['sections']:
                    for q in section.get('questions', []):
                        if 'marks' in q and isinstance(q['marks'], str):
                            try:
                                q['marks'] = int(q['marks'])
                                needs_save = True
                            except:
                                q['marks'] = None
                                needs_save = True
                                
                        for sq in q.get('sub_questions', []):
                            if 'marks' in sq and isinstance(sq['marks'], str):
                                try:
                                    sq['marks'] = int(sq['marks'])
                                    needs_save = True
                                except:
                                    sq['marks'] = None
                                    needs_save = True

            if needs_save:
                with open(json_file, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2)
                fixed_count += 1
                
        except Exception as e:
            pass # Already logged above
            
    print(f"Added missing 'text' properties to {fixed_count} files.")

if __name__ == "__main__":
    fix_all_schemas()
