#!/usr/bin/env python3
"""Recover the GATE 2026 syllabus of eight papers the site ships with no text.

One-time provenance, not part of the pipeline: the output of this script is
`gate_extra.json`, which `build-packs-fixes.ts` merged into `packs.ts` on
2026-10-26. `scripts/data/build-packs.ts` re-packs that result without needing
the PDFs, so this is kept for audit and re-extraction, not run by `check.sh`.

Run from the repo root (it imports the `gatextract` module and reads
`gatextract/doc/GATE2026_Syllabus/*.pdf`):

    uv run python native/scripts/data/legacy/extract-gate.py > native/src/features/syllabus/data/.tmp/gate_extra.json

The eight papers: DA, ST, MA, PE, GG, GE, BM, XH. Every other paper already had
sections in the site's JSON.
"""
import sys, re, json, io, contextlib

sys.path.insert(0, "gatextract")
from main import extract_text_from_pdf, clean_text


def load(name):
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        raw = extract_text_from_pdf(f"gatextract/doc/GATE2026_Syllabus/{name}")
    return clean_text(raw)


def clean_lines(t):
    out = []
    for l in t.split("\n"):
        l = l.rstrip()
        if re.fullmatch(r"\s*\d{1,3}(?:\s+\d{1,3})*\s*", l):
            continue
        if l.strip().startswith("GATE 2026"):
            continue
        out.append(l)
    res = []
    blank = 0
    for l in out:
        if not l.strip():
            blank += 1
        else:
            blank = 0
        if blank <= 1:
            res.append(l)
    text = "\n".join(res).strip()
    text = text.replace("(cid:3041)", "n").replace("(cid:3042)", "o")
    return text


def split_at(text, titles, keep_titles=True):
    """Split at exact heading lines from a curated list."""
    pats = [(t, re.compile(r"^" + re.escape(t) + r"\s*:\s*(.*)$")) for t in titles]
    sections = []
    cur = None
    for line in text.split("\n"):
        st = line.strip()
        hit = None
        for t, pat in pats:
            if st == t or st == t + ":":
                hit = (t, "")
                break
            m = pat.match(st)
            if m:
                hit = (t, m.group(1))
                break
        if hit:
            if cur:
                sections.append(cur)
            cur = {"title": hit[0], "lines": [hit[1]] if hit[1] else []}
        else:
            if cur is None:
                cur = {"title": "Syllabus", "lines": []}
            cur["lines"].append(line)
    if cur:
        sections.append(cur)
    return [
        {"title": s["title"], "content": "\n".join(s["lines"]).strip()}
        for s in sections
    ]


PAPERS = {
    "DA": (
        "DA_2026_Syllabus.pdf",
        [
            "Probability and Statistics",
            "Linear Algebra",
            "Calculus and Optimization",
            "Programming, Data Structures and Algorithms",
            "Database Management and Warehousing",
            "Machine Learning",
            "AI",
        ],
    ),
    "ST": (
        "ST_2026_Syllabus.pdf",
        [
            "Calculus",
            "Matrix Theory",
            "Probability",
            "Standard Discrete and Continuous Univariate Distributions",
            "Stochastic Processes",
            "Estimation",
            "Testing of Hypotheses",
            "Non-parametric Statistics",
            "Multivariate Analysis",
            "Regression Analysis",
        ],
    ),
    "MA": (
        "MA_2026_Syllabus.pdf",
        [
            "Calculus",
            "Linear Algebra",
            "Real Analysis",
            "Complex Analysis",
            "Ordinary Differential Equations",
            "Algebra",
            "Functional Analysis",
            "Numerical Analysis",
            "Partial Differential Equations",
            "Topology",
            "Linear Programming",
        ],
    ),
    "PE": (
        "PE_2026_Syllabus.pdf",
        [
            "Linear Algebra",
            "Calculus",
            "Differential Equations",
            "Complex Variables",
            "Probability and Statistics",
            "Numerical Methods",
            "Petroleum Exploration",
            "Oil and Gas Well Drilling Technology",
            "Reservoir Engineering",
            "Petroleum Production Operations",
            "Offshore Drilling and Production Practices",
            "Petroleum Formation Evaluation",
            "Oil and Gas Well Testing",
            "Health Safety and Environment in Petroleum Industry",
            "Enhanced Oil Recovery Techniques",
            "Latest Trends in Petroleum Engineering",
        ],
    ),
    "GG": (
        "GG_2026_Syllabus.pdf",
        ["Part-A: Common Section", "Part-B (B1): Geology", "Part-B (B2): Geophysics"],
    ),
    "GE": (
        "GE_2026_Syllabus.pdf",
        [
            "Part-A (Common): Engineering Mathematics and Basic Geomatics",
            "Part-B1: Surveying and Mapping",
            "Part-B2: Image Processing and Analysis",
        ],
    ),
    "BM": (
        "BM_2026_Syllabus.pdf",
        [
            "Engineering Mathematics",
            "Electrical Circuits",
            "Signals and Systems",
            "Analog and Digital Electronics",
            "Measurements and Control Systems",
            "Sensors and Bioinstrumentation",
            "Human Anatomy and Physiology",
            "Medical Imaging Systems",
            "Biomechanics",
            "Biomaterials",
        ],
    ),
    "XH": (
        "XH-2026_Combined_Syllabus.pdf",
        [
            "XH-B1 Reasoning and Comprehension (Compulsory for all XH candidates)",
            "XH-C1 Economics",
            "XH-C2 English",
            "XH-C3 Linguistics",
            "XH-C4 Philosophy",
            "XH-C5 Psychology",
            "XH-C6 Sociology",
        ],
    ),
}

out = {}
for code, (fname, titles) in PAPERS.items():
    t = clean_lines(load(fname))
    lines = t.split("\n")
    # Drop the leading paper title line when it is "<CODE> <name>".
    if code != "XH" and lines and re.match(rf"^{code}\b", lines[0].strip()):
        lines = lines[1:]
    t = "\n".join(lines).strip()
    secs = split_at(t, titles)
    out[code] = {"code": code, "sections": secs}
    print(
        code,
        "secs",
        len(secs),
        "chars",
        sum(len(s["content"]) for s in secs),
        "titles",
        [s["title"] for s in secs],
        file=sys.stderr,
    )

json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
