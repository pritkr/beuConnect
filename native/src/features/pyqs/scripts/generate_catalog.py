#!/usr/bin/env python3
"""Regenerate the PYQ catalogs bundled with the native app.

The app's shelf is a *union* of two snapshots, both read from the site:

  · every question paper in `src/content/pyqs/<code>/<year>.json` — subject,
    code, year, variant, page anchor;
  · every subject in `src/assets/data/branches/<branch>.json`, the syllabus
    packs the app's Syllabus area decodes, with its code, type and credits.

A subject that has both is one row: the syllabus gives it a name, a semester
and a code, and the papers attach to that row by code. A subject with no papers
still ships (`papers: []`) — the shelf shows "No papers yet" instead of hiding
a subject a student is studying right now. A paper folder whose code no
syllabus subject carries keeps its own row, so nothing published is dropped.

Why the union and not the papers alone: the papers are filed under the scheme
that was current when they were scanned (051301), while today's syllabus uses
the revised scheme (105303). Reading both, and matching code first, name second,
is what makes an old paper findable from the subject a student is taking.

Run from the repo root:

    uv run python native/src/features/pyqs/scripts/generate_catalog.py

Writes:
  native/src/features/pyqs/catalog-data.ts   BEU subjects + papers
  native/src/features/pyqs/gate-data.ts      GATE paper list
  native/src/features/pyqs/colleges.ts       college codes used by the data browser
"""

from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]
CONTENT = ROOT / "src" / "content" / "pyqs"
SYLLABUS = ROOT / "src" / "assets" / "data" / "branches"
GATE = ROOT / "src" / "data" / "gate-pyqs.json"
GATE_PAPERS = ROOT / "src" / "assets" / "data" / "gate-papers.json"
COLLEGES = ROOT / "src" / "data" / "colleges.json"
OUT = Path(__file__).resolve().parents[1]

# Branch display order: the six syllabus branches first (the same order as
# BRANCH_META in the app), then the groups that only papers mention.
BRANCHES = {
    "cse": "Computer Science & Engineering",
    "ece": "Electronics & Communication",
    "ee": "Electrical Engineering",
    "mech": "Mechanical Engineering",
    "civil": "Civil Engineering",
    "eee": "Electrical & Electronics",
    "common": "First year / common",
    "it": "Information Technology",
    "other": "Other / electives",
}
BRANCH_ORDER = list(BRANCHES)

# The site's own canonical groups (src/utils/pyqSubjects.ts). Keeping the same
# aliases means a subject's papers share one route page, exactly like the web.
GROUPS = [
    ("Digital Electronics", "digital-electronics", ["digital electronics"]),
    (
        "Data Structure & Algorithms",
        "data-structure-and-algorithms",
        ["data structure and algorithms", "data structures and algorithms", "data structure algorithms", "data structures"],
    ),
    (
        "Object Oriented Programming Using Java",
        "object-oriented-programming-using-java",
        ["object oriented programming using java", "object oriented programming", "introduction to java programming language"],
    ),
    (
        "Discrete Mathematics and Graph Theory",
        "discrete-mathematics-and-graph-theory",
        ["discrete mathematics and graph theory", "discrete mathematical structure and graph theory", "discrete mathematical structures", "discrete mathematics"],
    ),
    ("Operating Systems", "operating-systems", ["operating systems", "operating system"]),
    ("Universal Human Values", "universal-human-values", ["universal human values", "human values"]),
]

BY_THREE = {
    "100": "common",
    "101": "civil",
    "102": "mech",
    "103": "ee",
    "104": "ece",
    "105": "cse",
    "106": "it",
    "110": "eee",
}
BY_TWO = {"01": "civil", "02": "mech", "03": "ee", "04": "ece", "05": "cse", "06": "it", "11": "eee"}
COMMON_TWO = {"21", "23", "24"}

# Folders whose code is missing or not a six-digit BEU code.
MANUAL = {
    "---": ("mech", 4, "Kinematics of Machinery"),
    "structural-analysis": ("civil", 4, "Structural Analysis"),
    "structural-analysis-i": ("civil", 4, "Structural Analysis-I"),
    "1045": ("ece", 5, "Microprocessor and Microcontroller"),
}

# A code the syllabus left blank: "-", "—" or nothing at all.
BLANK_CODE = re.compile(r"^[-\u2013\u2014]*$")


def slugify(value: str) -> str:
    value = value.lower().replace("&", " and ")
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return re.sub(r"-+", "-", value).strip("-")


def normalize(value: str) -> str:
    return slugify(value).replace("-", " ").strip()


# Words that carry no subject identity and vary between the papers and the packs.
NAME_STOP = {"a", "an", "and", "for", "in", "of", "on", "the", "to", "using", "with"}

# The packs and the papers disagree on spelling as well as wording.
SPELLING = {
    "behaviour": "behavior",
    "colour": "color",
    "centre": "center",
    "machinery": "machine",
    "organisation": "organization",
    "organisational": "organizational",
    "programme": "program",
}


def name_key(value: str) -> tuple[str, ...]:
    """A comparable name: parentheticals dropped, plurals folded, order ignored.

    "Engineering Graphics Design" and "Engineering Graphics and Design" are the
    same subject; "Mathematics-III" and "Mathematics-III (PDE...)" are too. The
    papers and the packs spell names differently, so code alone cannot decide.
    """
    text = re.sub(r"\([^)]*\)", " ", value.lower())
    tokens = [
        token
        for token in re.split(r"[^a-z0-9]+", text)
        if token and token not in NAME_STOP
    ]

    def fold(token: str) -> str:
        token = SPELLING.get(token, token)
        if len(token) > 5 and token.endswith("ing"):
            token = token[:-3]
        if len(token) > 4 and token.endswith("ies"):
            token = f"{token[:-3]}y"
        if len(token) > 3 and token.endswith("s") and not token.endswith(("ss", "us", "is")):
            token = token[:-1]
        return token

    return tuple(sorted(fold(token) for token in tokens))


GROUP_BY_ALIAS = {alias: group for group in GROUPS for alias in group[2]}


def canonical(name: str, slug: str) -> tuple[str, str]:
    group = GROUP_BY_ALIAS.get(normalize(name))
    if group:
        return group[0], group[1]
    cleaned = name.strip() or slug.replace("-", " ")
    # The source is inconsistent about case; ALL CAPS names read badly in a list.
    if cleaned.isupper() and len(cleaned) > 3:
        cleaned = cleaned.title()
    return cleaned, slug or slugify(cleaned)


def code_of(metadata: dict, folder: str) -> str:
    raw = str(metadata.get("subject_code") or "").strip()
    match = re.search(r"\b(\d{6})\b", raw) or re.search(r"\b(\d{6})\b", folder)
    if match:
        return match.group(1)
    if raw and raw not in {"---", "-"}:
        return raw
    return ""


def branch_and_sem(code: str, metadata: dict, folder: str) -> tuple[str, int, str]:
    if folder in MANUAL:
        manual = MANUAL[folder][:2]
        return manual[0], manual[1], MANUAL[folder][2]

    six = code if re.fullmatch(r"\d{6}", code) else ""
    branch = "other"
    sem = 0
    if six:
        if six[:3] in BY_THREE:
            branch = BY_THREE[six[:3]]
        elif six[:2] in BY_TWO:
            branch = BY_TWO[six[:2]]
        elif six[:2] in COMMON_TWO:
            branch = "common"
        elif six[:2] == "10":
            branch = "common"
        digit = six[3]
        if digit.isdigit():
            sem = int(digit)
    if sem < 1 or sem > 8:
        value = metadata.get("semester")
        sem = int(value) if isinstance(value, (int, float)) and 1 <= int(value) <= 8 else 1

    name = str(metadata.get("subject") or "").lower()
    if "kinematics of machin" in name:
        branch = "mech"
        sem = 4
    elif "structural analysis" in name:
        branch = "civil"
        sem = 4
    return branch, sem, ""


def parse_json(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def derived_code(name: str, kind: str) -> str:
    """The same stable code `decode.ts` gives a subject the source forgot to code.

    Kept byte-identical so a shelf row and the syllabus screen show one code.
    """
    slug = re.sub(r"[^A-Z0-9]+", "-", name.upper()).strip("-")[:22]
    return f"X-{slug}" + ("-P" if kind.lower().startswith("prac") else "")


def read_syllabus() -> list[dict]:
    """Every syllabus subject, one row per (branch, semester, code).

    Mirrors `decode.ts`: a blank code becomes `X-NAME`, and a code that repeats
    inside a semester keeps its first row (the richer one). Theory sorts before
    practical so a lab can never claim its theory subject's papers.
    """
    rows: list[dict] = []
    for path in sorted(SYLLABUS.glob("*.json")):
        branch = path.stem
        if branch not in BRANCHES:
            continue  # "cse copy.json" and friends
        data = parse_json(path) or {}
        for sem_key, pack in (data.get("semesters") or {}).items():
            if not str(sem_key).isdigit():
                continue
            sem = int(sem_key)
            if sem < 1 or sem > 8:
                continue
            seen: set[str] = set()
            pack_rows: list[dict] = []
            for raw in (pack or {}).get("subjects") or []:
                if not isinstance(raw, dict):
                    continue
                name = " ".join(str(raw.get("name") or "").split())
                kind = str(raw.get("type") or "")
                code = str(raw.get("code") or "").strip()
                if BLANK_CODE.match(code):
                    code = derived_code(name, kind)
                if not code or code in seen:
                    continue
                seen.add(code)
                credits = raw.get("credits")
                pack_rows.append(
                    {
                        "code": code,
                        "name": name,
                        "type": "Practical" if kind.lower().startswith("prac") else "Theory",
                        "credits": int(credits) if isinstance(credits, (int, float)) else 0,
                        "elective": raw.get("elective") is True,
                    }
                )
            # Stable: theory rows first, original order kept inside each group.
            pack_rows.sort(key=lambda row: row["type"] == "Practical")
            for row in pack_rows:
                rows.append({**row, "branch": branch, "sem": sem})
    return rows


def build_beu() -> dict:
    """The syllabus packs unioned with every published paper.

    The shelf is the syllabus: every (branch, semester, code) the packs list is
    emitted, even when no paper exists yet. Papers live once in a shared table
    and a row carries indexes into it, so a first-year paper reachable from six
    branches is stored once. A paper that matches no syllabus row (an older
    scheme, IT, an elective) keeps its own honest row, flagged `legacy`.
    """
    entries: dict[str, dict] = {}
    skipped: list[str] = []

    for folder in sorted(p for p in CONTENT.iterdir() if p.is_dir()):
        files = sorted(f for f in folder.iterdir() if f.suffix == ".json")
        if not files:
            continue
        papers = []
        for file in files:
            raw = parse_json(file)
            if not raw or not isinstance(raw.get("metadata"), dict):
                skipped.append(str(file))
                continue
            papers.append((file.stem, raw))
        if not papers:
            continue

        first = papers[0][1]["metadata"]
        code = code_of(first, folder.name)
        branch, sem, forced_name = branch_and_sem(code, first, folder.name)
        subject_name = forced_name or str(first.get("subject") or "")
        slug = str(first.get("subject_slug") or "") or slugify(subject_name)
        subject_name, slug = canonical(subject_name, slug)
        key = f"{branch}|{sem}|{slug}"

        if key not in entries:
            entries[key] = {
                "key": key,
                "slug": slug,
                "name": subject_name,
                "branch": branch,
                "sem": sem,
                "codes": [],
                "papers": [],
                "seen": set(),
            }
        entry = entries[key]
        if code and code not in entry["codes"]:
            entry["codes"].append(code)

        for file_stem, raw in papers:
            metadata = raw["metadata"]
            year = metadata.get("year")
            if not isinstance(year, (int, float)):
                continue
            question_count = 0
            for section in raw.get("sections") or []:
                if isinstance(section, dict) and isinstance(section.get("questions"), list):
                    question_count += len(section["questions"])
            variant = file_stem.split("_", 1)[1] if "_" in file_stem else ""
            paper_code = code_of(metadata, folder.name) or code
            if paper_code and paper_code not in entry["codes"]:
                entry["codes"].append(paper_code)
            dedupe = f"{folder.name}|{paper_code}|{year}|{variant}|{file_stem}"
            if dedupe in entry["seen"]:
                continue
            entry["seen"].add(dedupe)
            entry["papers"].append(
                {
                    "code": paper_code,
                    "year": int(year),
                    "variant": variant,
                    "id": file_stem,
                    "questions": question_count,
                    "title": str(metadata.get("exam_title") or "").strip(),
                    "marks": int(metadata["full_marks"]) if isinstance(metadata.get("full_marks"), (int, float)) else 0,
                    "time": str(metadata.get("time") or "").strip(),
                }
            )

    for entry in entries.values():
        entry.pop("seen", None)
        entry["codes"].sort()
        entry["papers"].sort(key=lambda paper: (-paper["year"], paper["variant"]))

    # One paper table. A paper repeated across first-year folders is stored once;
    # the rows that can reach it carry the same index.
    papers: list[dict] = []
    paper_at: dict[tuple, int] = {}
    for key in sorted(entries, key=lambda value: (BRANCH_ORDER.index(entries[value]["branch"]), entries[value]["sem"], entries[value]["slug"])):
        entry = entries[key]
        ids: list[int] = []
        for paper in entry["papers"]:
            identity = (paper["code"], paper["year"], paper["variant"], paper["id"], paper["title"])
            index = paper_at.get(identity)
            if index is None:
                index = len(papers)
                paper_at[identity] = index
                papers.append(paper)
            if index not in ids:
                ids.append(index)
        entry["paperIds"] = ids

    by_code: dict[str, list[str]] = defaultdict(list)
    by_name: dict[tuple[str, str], list[str]] = defaultdict(list)
    by_token: dict[tuple[str, tuple[str, ...]], list[str]] = defaultdict(list)
    for key, entry in entries.items():
        for code in entry["codes"]:
            by_code[code].append(key)
        by_name[(entry["branch"], entry["slug"])].append(key)
        by_token[(entry["branch"], name_key(entry["name"]))].append(key)

    syllabus = read_syllabus()
    claimed: set[str] = set()
    shared: set[str] = set()
    output: dict[str, dict] = {}
    used: set[str] = set()

    def unique_key(branch: str, sem: int, slug: str) -> tuple[str, str]:
        """A key the packer can split back into branch|sem|slug, suffixing the slug."""
        name = slug
        key = f"{branch}|{sem}|{name}"
        suffix = 2
        while key in used:
            name = f"{slug}-{suffix}"
            key = f"{branch}|{sem}|{name}"
            suffix += 1
        used.add(key)
        return key, name

    def add_row(row: dict, entry_keys: list[str]) -> None:
        """One shelf row fed by every paper folder for that subject this term."""
        codes = {row["code"]}
        paper_ids: list[int] = []
        for entry_key in entry_keys:
            entry = entries[entry_key]
            codes.update(entry["codes"])
            for index in entry["paperIds"]:
                if index not in paper_ids:
                    paper_ids.append(index)
            if entry["branch"] != row["branch"] or (entry["branch"] in {"common", "other"} and row["sem"] <= 2):
                shared.add(entry_key)
            else:
                claimed.add(entry_key)

        paper_ids.sort(key=lambda index: (-papers[index]["year"], papers[index]["variant"], papers[index]["code"]))
        key, slug = unique_key(row["branch"], row["sem"], entries[entry_keys[0]]["slug"])
        output[key] = {
            "key": key,
            "slug": slug,
            "name": row["name"],
            "branch": row["branch"],
            "sem": row["sem"],
            "code": row["code"],
            "codes": sorted(codes),
            "type": "lab" if row["type"] == "Practical" else "theory",
            "credits": row["credits"],
            "elective": row["elective"],
            "legacy": False,
            "paperIds": paper_ids,
        }

    def add_fresh(row: dict) -> None:
        slug = slugify(row["name"]) or slugify(row["code"])
        key, slug = unique_key(row["branch"], row["sem"], slug)
        output[key] = {
            "key": key,
            "slug": slug,
            "name": row["name"],
            "branch": row["branch"],
            "sem": row["sem"],
            "code": row["code"],
            "codes": [row["code"]],
            "type": "lab" if row["type"] == "Practical" else "theory",
            "credits": row["credits"],
            "elective": row["elective"],
            "legacy": False,
            "paperIds": [],
        }

    def add_legacy(entry_key: str) -> None:
        entry = entries[entry_key]
        key, slug = unique_key(entry["branch"], entry["sem"], entry["slug"])
        type_name = "lab" if slug.endswith("-lab") or any(code.endswith("P") for code in entry["codes"]) else "theory"
        output[key] = {
            "key": key,
            "slug": slug,
            "name": entry["name"],
            "branch": entry["branch"],
            "sem": entry["sem"],
            "code": "",
            "codes": entry["codes"],
            "type": type_name,
            "credits": 0,
            "elective": False,
            "legacy": True,
            "paperIds": entry["paperIds"],
        }

    def close_name(left: tuple[str, ...], right: tuple[str, ...]) -> bool:
        """One name is the other plus a word: "Data Structures" / "Data
        Structure & Algorithms". Two shared words are the floor, and a lab is
        never folded into its theory subject."""
        a, b = set(left), set(right)
        small, large = (a, b) if len(a) <= len(b) else (b, a)
        if len(small) < 2 or not small <= large:
            return False
        lab = {"lab", "laboratory", "practical"}
        return (a & lab) == (b & lab)

    def merge_keys(row: dict, primary: str | None = None) -> list[str]:
        """Every folder for this subject this term, same branch first."""
        token = name_key(row["name"])
        keys: list[str] = []

        def take(key: str) -> None:
            entry = entries[key]
            if entry["sem"] == row["sem"] and available(key) and key not in keys:
                keys.append(key)

        if primary:
            take(primary)
        for key in by_token.get((row["branch"], token), []):
            take(key)
        if row["sem"] <= 2:
            for branch in ("common", "other"):
                for key in by_token.get((branch, token), []):
                    take(key)
        # A later-semester folder can be the only copy of a subject: the 2015
        # Data Structures paper is filed under 051403, while the syllabus now
        # calls 105302 Data Structure & Algorithms. The page is
        # `/pyqs/<slug>/`, shared across branches, so a foreign folder carrying
        # the same subject is safe to show — and `add_row` keeps it available
        # for its own branch when it does. Names that merely grew a word
        # ("Digital Electronics" / "Digital Electronics Lab" excluded) are the
        # same subject under another scheme.
        for branch in ("common", "other"):
            if branch == row["branch"]:
                continue
            for key in by_token.get((branch, token), []):
                take(key)
        if not keys:
            for key, entry in entries.items():
                if entry["branch"] == row["branch"] and close_name(token, name_key(entry["name"])):
                    take(key)
        if not keys:
            return keys

        # Every paper row opens one site page: `/pyqs/<slug>/`. Papers filed
        # under another spelling live on another page, so merging them would
        # list a paper the page cannot serve. Keep the one page that carries
        # the most papers for this subject.
        anchor = primary if primary in keys else max(
            keys,
            key=lambda key: (
                len(entries[key]["paperIds"]),
                max((paper["year"] for paper in entries[key]["papers"]), default=0),
            ),
        )
        slug = entries[anchor]["slug"]
        return [key for key in keys if entries[key]["slug"] == slug]

    def available(key: str) -> bool:
        """Free to attach: a shared first-year paper may serve any branch."""
        return key not in claimed

    def exact(code: str, row: dict | None) -> str | None:
        """The unclaimed entry for a code, unless another subject owns its name.

        BEU reuses codes across schemes (105301 is Digital Electronics in the
        syllabus and Formal Languages in a 2013 paper). If the paper's name
        belongs to a different syllabus subject, leave it for that subject's
        name match instead of pinning it to the wrong row.
        """
        keys = [key for key in by_code.get(code, []) if available(key)]
        if row is not None:
            own = name_key(row["name"])
            keys = [
                key
                for key in keys
                if entries[key]["sem"] == row["sem"] and name_key(entries[key]["name"]) == own
            ]
            keys.sort(key=lambda key: entries[key]["branch"] != row["branch"])
        return keys[0] if keys else None

    # Pass 1 — a code both sides carry is the strongest match.
    pending: list[dict] = []
    for row in syllabus:
        key = exact(row["code"], row)
        if key is None:
            pending.append(row)
        else:
            add_row(row, merge_keys(row, key))

    # Pass 2 — a practical with no papers of its own borrows its theory
    # subject's papers, but only when no folder publishes the practical code.
    rest: list[dict] = []
    for row in pending:
        code = row["code"]
        base = code[:-1] if code.endswith("P") else ""
        key = exact(base, row) if base and base not in by_code else None
        if key is None:
            rest.append(row)
        else:
            add_row(row, merge_keys(row, key))

    # Pass 3 — the same subject under another scheme's code: exact name first,
    # then a first-year paper shared by every branch.
    for row in rest:
        keys = merge_keys(row)
        if keys:
            add_row(row, keys)
        else:
            add_fresh(row)

    # Papers that no syllabus row names keep their own row, marked legacy —
    # unless the same papers already sit on a shelf row (a duplicate folder).
    shown = set()
    for subject in output.values():
        shown.update(subject["paperIds"])
    for key in sorted(entries, key=lambda value: (BRANCH_ORDER.index(entries[value]["branch"]), entries[value]["sem"], entries[value]["slug"])):
        if available(key) and set(entries[key]["paperIds"]) - shown:
            add_legacy(key)

    # One code, one owner. BEU reuses numbers across schemes — 100202 is
    # Engineering Mathematics II today and Engineering Graphics in a 2019 paper
    # — so a row may list a code another row owns. Two rows claiming one code
    # makes `findSubjectByCode` a coin flip, so the owner is the current-scheme
    # row whose own code it is, then the row with more papers. A borrowed code
    # stays on the borrowing row only when nobody else in the same branch and
    # semester claims it.
    def rank(subject: dict, code: str) -> tuple[int, int, int]:
        return (
            1 if not subject["legacy"] else 0,
            1 if subject["code"] == code else 0,
            len(subject["paperIds"]),
        )

    owner: dict[tuple[str, int, str], dict] = {}
    for subject in output.values():
        for code in subject["codes"]:
            if not code or code == "---":
                continue
            cell = (subject["branch"], subject["sem"], code)
            held = owner.get(cell)
            if held is None or rank(subject, code) > rank(held, code):
                owner[cell] = subject

    for subject in output.values():
        subject["codes"] = sorted(
            {
                code
                for code in subject["codes"]
                if code
                and code != "---"
                and owner[(subject["branch"], subject["sem"], code)] is subject
            }
        )

    subjects = list(output.values())
    order = {branch: index for index, branch in enumerate(BRANCH_ORDER)}
    subjects.sort(
        key=lambda subject: (
            order.get(subject["branch"], len(order)),
            subject["branch"],
            subject["sem"],
            subject["name"].lower(),
        )
    )

    from_syllabus = sum(1 for subject in subjects if not subject["legacy"])
    with_papers = sum(1 for subject in subjects if subject["paperIds"])
    counts = Counter(papers[index]["year"] for subject in subjects for index in subject["paperIds"])
    print(
        f"BEU: {len(subjects)} rows "
        f"({from_syllabus} from the syllabus, {with_papers} with papers, "
        f"{len(subjects) - with_papers} with none), "
        f"{len(papers)} unique papers"
    )
    if skipped:
        print(f"skipped {len(skipped)} unreadable files")
    return {
        "generated": "2026-10-26",
        "branches": [
            {"key": key, "name": BRANCHES[key]}
            for key in BRANCH_ORDER
            if any(subject["branch"] == key for subject in subjects)
        ],
        "papers": papers,
        "subjects": subjects,
        "years": sorted(counts, reverse=True),
    }


def build_gate() -> dict:
    raw = json.loads(GATE.read_text(encoding="utf-8"))
    names = {}
    if GATE_PAPERS.exists():
        for row in json.loads(GATE_PAPERS.read_text(encoding="utf-8")):
            if isinstance(row, dict) and row.get("code"):
                names[str(row["code"])] = str(row.get("name") or row["code"])
    extra = {
        "XH-C1": "Economics (XH-C1)",
        "XH-C2": "English (XH-C2)",
        "XH-C3": "Linguistics (XH-C3)",
        "XH-C4": "Philosophy (XH-C4)",
        "XH-C5": "Psychology (XH-C5)",
        "XH-C6": "Sociology (XH-C6)",
    }
    names.update(extra)
    papers = []
    for code in sorted(raw, key=lambda value: (value in extra, value)):
        rows = []
        for item in raw[code]:
            year = item.get("year")
            if not str(year).isdigit():
                continue
            rows.append(
                {
                    "year": int(year),
                    "variant": str(item.get("set") or ""),
                    "file": str(item.get("file") or ""),
                    "path": str(item.get("path") or ""),
                }
            )
        rows.sort(key=lambda p: (-p["year"], p["variant"]))
        if rows:
            papers.append({"code": code, "name": names.get(code, code), "papers": rows})
    print(f"GATE: {len(papers)} papers, {sum(len(p['papers']) for p in papers)} files")
    return {"generated": "2026-10-26", "papers": papers}


def build_colleges() -> dict:
    rows = json.loads(COLLEGES.read_text(encoding="utf-8"))
    names = {}
    for row in rows:
        code = str(row.get("CollegeCode") or row.get("code") or "").strip()
        name = str(row.get("Name") or row.get("name") or "").strip()
        if code and name:
            names[code] = name
    print(f"colleges: {len(names)}")
    return names


def emit(path: Path, banner: str, payload: object, extra: str = "") -> None:
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    path.write_text(
        "/* eslint-disable */\n"
        "/**\n"
        f" * {banner}\n"
        " *\n"
        " * GENERATED by ./scripts/generate_catalog.py — do not hand-edit.\n"
        " */\n\n"
        f"export const SNAPSHOT = {json.dumps(payload['generated'])};\n\n"
        f"{extra}"
        f"export const RAW = {json.dumps(body)};\n",
        encoding="utf-8",
    )
    print(f"wrote {path.relative_to(ROOT)} ({len(body) // 1024} KB)")


def main() -> None:
    beu = build_beu()
    gate = build_gate()
    colleges = build_colleges()

    emit(
        OUT / "catalog-data.ts",
        "Every BEU syllabus subject and every published paper, in one shelf.",
        beu,
        "export interface CatalogBranch { key: string; name: string }\n"
        "export interface CatalogPaper {\n"
        "  code: string;\n"
        "  year: number;\n"
        "  variant: string;\n"
        "  id: string;\n"
        "  questions: number;\n"
        "  title: string;\n"
        "  marks: number;\n"
        "  time: string;\n"
        "}\n"
        "/** A shelf row. `paperIds` index the shared `Catalog.papers` table. */\n"
        "export interface CatalogSubjectRaw {\n"
        "  key: string;\n"
        "  slug: string;\n"
        "  name: string;\n"
        "  branch: string;\n"
        "  sem: number;\n"
        "  /** The syllabus code, or empty for a row with no syllabus entry. */\n"
        "  code: string;\n"
        "  codes: string[];\n"
        "  type: \"theory\" | \"lab\";\n"
        "  credits: number;\n"
        "  elective: boolean;\n"
        "  /** No syllabus row carries this code: an older scheme, IT, or an elective. */\n"
        "  legacy: boolean;\n"
        "  paperIds: number[];\n"
        "}\n"
        "export interface Catalog { generated: string; branches: CatalogBranch[]; papers: CatalogPaper[]; subjects: CatalogSubjectRaw[]; years: number[] }\n\n",
    )
    emit(
        OUT / "gate-data.ts",
        "GATE papers: paper code, year and the PDF path on the site.",
        gate,
        "export interface GatePaper { year: number; variant: string; file: string; path: string }\n"
        "export interface GateSubject { code: string; name: string; papers: GatePaper[] }\n"
        "export interface GateCatalog { generated: string; papers: GateSubject[] }\n\n",
    )

    college_body = json.dumps(colleges, ensure_ascii=False, separators=(",", ":"))
    (OUT / "colleges.ts").write_text(
        "/* eslint-disable */\n"
        "/**\n"
        " * College codes for dataset labels.\n"
        " *\n"
        " * GENERATED by ./scripts/generate_catalog.py — do not hand-edit.\n"
        " */\n\n"
        f"export const COLLEGE_NAMES: Record<string, string> = {college_body};\n",
        encoding="utf-8",
    )
    print(f"wrote colleges.ts ({len(college_body) // 1024} KB)")


if __name__ == "__main__":
    main()
