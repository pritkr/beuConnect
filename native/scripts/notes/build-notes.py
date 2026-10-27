#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""
Build `public/data/notes.json` for the Notes & VVI screen.

Two inputs, both on disk:

  native/notes-src/vvi/<branch>-<sem>.json   what to teach, hand-written
  public/notes/<branch>/<sem>/<code>/*.pdf   what to read, as uploaded
  public/notes/<branch>/<sem>/<code>-<label>[-kind].pdf

The output is the only file the app fetches. It is deterministic: the same
inputs produce the same bytes, so `--check` can gate a deploy.

    uv run python native/scripts/notes/build-notes.py
    uv run python native/scripts/notes/build-notes.py --check

Python 3 standard library only. Page counts are read from the PDF's own page
objects; a PDF that hides them gets `pages: null` rather than a guess.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

SITE = "https://beu.prit.eu.org"
BRANCHES = ("cse", "ece", "ee", "mech", "civil", "eee")
BRANCH_ORDER = {branch: index for index, branch in enumerate(BRANCHES)}
KINDS = ("handwritten", "short", "vvi", "formula")
CONFIDENCE = {"high": 3, "medium": 2, "low": 1}
DEFAULT_KIND = "handwritten"
MAX_PDF_BYTES = 8 * 1024 * 1024

FILLER = {"handwritten", "notes", "note", "pdf", "pyq", "pyqs"}
ROMAN = {"i", "ii", "iii", "iv", "v", "vi", "vii", "viii"}
JOINERS = {"and", "of", "in", "to", "for", "the", "on"}
SHOUTED = {
    "ai", "cad", "cn", "coa", "daa", "dbms", "dsa", "dsp", "ece", "eee", "eim",
    "em", "etc", "flat", "iiot", "mpmc", "ooo", "oop", "os", "se", "vvi", "vlsi",
}

PAGE_RE = re.compile(rb"/Type\s*/Page\b")
KIND_SUFFIX = re.compile(r"-(handwritten|short|vvi|formula)$", re.IGNORECASE)


# --------------------------------------------------------------------- paths

def repo_root(start: Path) -> Path:
    """The repository root: the first parent that has both `public` and `native`."""
    for parent in start.parents:
        if (parent / "public").is_dir() and (parent / "native").is_dir():
            return parent
    raise SystemExit("build-notes: cannot find the repo root (need public/ and native/)")


# ------------------------------------------------------------------ strings

def one_line(value: object) -> str:
    return " ".join(value.split()) if isinstance(value, str) else ""


def slug(value: str) -> str:
    text = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return text or "note"


def pretty(stem: str) -> str:
    """A file or code stem as a screen title: "dbms-notes" → "DBMS"."""
    words = [word for word in re.split(r"[-_ ]+", stem) if word and word.lower() not in FILLER]
    out: list[str] = []
    for index, word in enumerate(words):
        low = word.lower()
        if low in SHOUTED or low in ROMAN:
            out.append(low.upper())
        elif index > 0 and low in JOINERS:
            out.append(low)
        else:
            out.append(word[:1].upper() + word[1:].lower())
    return " ".join(out) or "Notes"


def kind_of(filename: str) -> str:
    """`unit-3-handwritten.pdf` (suffix) or `handwritten-unit-3.pdf` (prefix)."""
    stem = filename[:-4] if filename.lower().endswith(".pdf") else filename
    suffix = KIND_SUFFIX.search(stem)
    if suffix:
        return suffix.group(1).lower()
    for kind in KINDS:
        if stem.lower().startswith(f"{kind}-"):
            return kind
    return DEFAULT_KIND


def strip_kind(stem: str) -> str:
    suffix = KIND_SUFFIX.search(stem)
    if suffix:
        return stem[: suffix.start()] or stem[suffix.end() :]
    for kind in KINDS:
        if stem.lower().startswith(f"{kind}-"):
            return stem[len(kind) + 1 :]
    return stem


def strip_code(stem: str, code: str) -> str:
    """Remove a leading subject code, tolerating `-`, `_` and space spellings."""
    if not code:
        return stem
    for variant in {code, code.replace(" ", "-"), code.replace(" ", "_")}:
        if stem.lower().startswith(variant.lower()):
            rest = stem[len(variant) :]
            return rest.lstrip("-_ ").strip()
    return stem


def title_of(filename: str, code: str, fallback: str) -> str:
    stem = filename[:-4] if filename.lower().endswith(".pdf") else filename
    stem = strip_kind(strip_code(stem, code))
    return pretty(stem) if stem else fallback


def parse_stamp(value: object) -> datetime | None:
    text = one_line(value)
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


# --------------------------------------------------------------------- VVI

def read_json(path: Path) -> object:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except OSError as error:
        raise SystemExit(f"build-notes: cannot read {path}: {error}") from error
    except json.JSONDecodeError as error:
        raise SystemExit(f"build-notes: {path} is not valid JSON: {error}") from error


def text_field(value: object, field: str, where: str) -> str:
    text = one_line(value)
    if not text:
        raise SystemExit(f"build-notes: {where}: `{field}` must be a non-empty string")
    return text


def clean_topic(raw: object, where: str) -> dict | None:
    if not isinstance(raw, dict):
        raise SystemExit(f"build-notes: {where}: every `vvi` entry must be an object")
    topic = one_line(raw.get("topic"))
    if not topic:
        return None
    note = one_line(raw.get("note"))
    marks_raw = raw.get("marks")
    marks: int | None
    if marks_raw is None:
        marks = None
    else:
        try:
            marks = int(marks_raw)
        except (TypeError, ValueError):
            raise SystemExit(f"build-notes: {where}: `marks` must be an integer or null") from None
        marks = max(2, min(12, marks))
    confidence = one_line(raw.get("confidence")).lower() or "medium"
    if confidence not in CONFIDENCE:
        raise SystemExit(f"build-notes: {where}: `confidence` must be high, medium or low")
    return {"topic": topic, "note": note, "marks": marks, "confidence": confidence}


def read_vvi(path: Path) -> tuple[str, int, list[dict]]:
    raw = read_json(path)
    where = str(path.name)
    if not isinstance(raw, dict):
        raise SystemExit(f"build-notes: {where}: the file must be a JSON object")
    branch = one_line(raw.get("branch")).lower()
    if branch not in BRANCHES:
        raise SystemExit(f"build-notes: {where}: `branch` must be one of {', '.join(BRANCHES)}")
    sem_raw = raw.get("sem")
    try:
        sem = int(sem_raw)
    except (TypeError, ValueError):
        raise SystemExit(f"build-notes: {where}: `sem` must be an integer from 1 to 8") from None
    if not 1 <= sem <= 8:
        raise SystemExit(f"build-notes: {where}: `sem` must be an integer from 1 to 8")

    subjects = raw.get("subjects")
    if not isinstance(subjects, list):
        raise SystemExit(f"build-notes: {where}: `subjects` must be an array")

    cleaned: list[dict] = []
    seen: set[str] = set()
    for index, subject in enumerate(subjects):
        at = f"{where}: subjects[{index}]"
        if not isinstance(subject, dict):
            raise SystemExit(f"build-notes: {at}: must be an object")
        code = one_line(subject.get("code"))
        name = one_line(subject.get("name")) or code
        if not name:
            raise SystemExit(f"build-notes: {at}: needs a `code` or a `name`")
        key = code or slug(name)
        if key in seen:
            raise SystemExit(f"build-notes: {at}: duplicate subject {key}")
        seen.add(key)

        topics = subject.get("vvi", [])
        if not isinstance(topics, list):
            raise SystemExit(f"build-notes: {at}: `vvi` must be an array")
        cleaned_topics = []
        for topic_index, topic in enumerate(topics):
            value = clean_topic(topic, f"{at}.vvi[{topic_index}]")
            if value is not None:
                cleaned_topics.append(value)
        cleaned.append({"code": code, "name": name, "vvi": cleaned_topics})
    return branch, sem, cleaned


# --------------------------------------------------------------------- PDFs

def page_count(path: Path) -> int | None:
    try:
        data = path.read_bytes()
    except OSError:
        return None
    found = len(PAGE_RE.findall(data))
    return found or None


def subject_name(folder: Path) -> str:
    meta = folder / "subject.json"
    if not meta.is_file():
        return ""
    raw = read_json(meta)
    return one_line(raw.get("name")) if isinstance(raw, dict) else ""


def pdf_rows(path: Path, branch: str, sem: int, code: str, fallback_title: str, notes_dir: Path) -> dict:
    stat = path.stat()
    name = path.name
    return {
        "id": "",
        "title": title_of(name, code, fallback_title),
        "kind": kind_of(name),
        "pages": page_count(path),
        "bytes": stat.st_size,
        "url": file_url(path, notes_dir),
        "updatedAt": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).date().isoformat(),
        "_path": path,
    }


def file_url(path: Path, notes_dir: Path) -> str:
    rel = path.relative_to(notes_dir)
    return f"{SITE}/notes/" + "/".join(quote(part, safe="") for part in rel.parts)


# --------------------------------------------------------------------- build

def build(root: Path) -> tuple[dict, list[str]]:
    warnings: list[str] = []
    subjects: dict[tuple[str, int, str], dict] = {}

    vvi_dir = root / "native" / "notes-src" / "vvi"
    for path in sorted(vvi_dir.glob("*.json")):
        branch, sem, rows = read_vvi(path)
        for subject in rows:
            code = subject["code"]
            key = (branch, sem, code or slug(subject["name"]))
            if key in subjects:
                raise SystemExit(
                    f"build-notes: {path.name}: {code or subject['name']} is already defined "
                    f"for {branch} sem {sem}"
                )
            subjects[key] = {
                "id": f"{branch}-{sem}-{code or slug(subject['name'])}",
                "branch": branch,
                "sem": sem,
                "code": code,
                "name": subject["name"],
                "vvi": subject["vvi"],
                "files": [],
            }

    notes_dir = root / "public" / "notes"
    if notes_dir.is_dir():
        for branch_dir in sorted(notes_dir.iterdir()):
            if not branch_dir.is_dir():
                continue
            branch = branch_dir.name.strip().lower()
            if branch not in BRANCHES:
                warnings.append(f"public/notes/{branch_dir.name}: not a BEU branch, skipped")
                continue
            for sem_dir in sorted(branch_dir.iterdir()):
                if not sem_dir.is_dir():
                    continue
                if not re.fullmatch(r"[1-8]", sem_dir.name.strip()):
                    warnings.append(f"public/notes/{branch}/{sem_dir.name}: not a semester, skipped")
                    continue
                sem = int(sem_dir.name)
                folders = [item for item in sorted(sem_dir.iterdir()) if item.is_dir()]
                loose = [item for item in sorted(sem_dir.glob("*.pdf")) if item.is_file()]

                for folder in folders:
                    code = folder.name.strip()
                    pdfs = [item for item in sorted(folder.glob("*.pdf")) if item.is_file()]
                    if not pdfs:
                        continue
                    key = (branch, sem, code)
                    for pdf in pdfs:
                        row = pdf_rows(pdf, branch, sem, code, code, notes_dir)
                        row["id"] = f"{branch}-{sem}-{slug(code)}-{slug(pdf.stem)}"
                        _attach(subjects, key, row, code, subject_name(folder), warnings)
                    _warn_large(pdfs, notes_dir, warnings)

                for pdf in loose:
                    key = _match_flat(branch, sem, pdf, subjects)
                    if key is None:
                        warnings.append(
                            f"{pdf.relative_to(root)}: no VVI subject matches its code prefix, skipped"
                        )
                        continue
                    subject = subjects[key]
                    row = pdf_rows(pdf, branch, sem, subject["code"], subject["name"], notes_dir)
                    row["id"] = f"{branch}-{sem}-{slug(subject['code'])}-{slug(pdf.stem)}"
                    subject["files"].append(row)
                    _warn_large([pdf], notes_dir, warnings)

    ordered = [row for row in subjects.values() if row["vvi"] or row["files"]]
    ordered.sort(
        key=lambda row: (
            BRANCH_ORDER.get(row["branch"], 99),
            row["sem"],
            -len(row["vvi"]),
            row["name"].lower(),
            row["code"],
        )
    )
    seen_ids: set[str] = set()
    for row in ordered:
        row["vvi"].sort(
            key=lambda topic: (
                -(topic["marks"] or 0),
                -CONFIDENCE.get(topic["confidence"], 1),
                topic["topic"].lower(),
            )
        )
        row["files"].sort(key=lambda file: (file["title"].lower(), file["_path"].name))
        for file in row["files"]:
            base = file["id"]
            suffix = 2
            while file["id"] in seen_ids:
                file["id"] = f"{base}-{suffix}"
                suffix += 1
            seen_ids.add(file["id"])
            del file["_path"]

    manifest = {"updatedAt": "", "subjects": ordered}
    return manifest, warnings


def _attach(
    subjects: dict[tuple[str, int, str], dict],
    key: tuple[str, int, str],
    row: dict,
    code: str,
    meta_name: str,
    warnings: list[str],
) -> None:
    subject = subjects.get(key)
    if subject is None:
        if not meta_name:
            warnings.append(
                f"{row['_path'].parents[1].name}/{row['_path'].parents[0].name}/{code}: "
                f"{row['_path'].name} has no VVI entry or subject.json, skipped"
            )
            return
        subject = {
            "id": f"{key[0]}-{key[1]}-{code}",
            "branch": key[0],
            "sem": key[1],
            "code": code,
            "name": meta_name,
            "vvi": [],
            "files": [],
        }
        subjects[key] = subject
    elif meta_name and meta_name != subject["name"]:
        warnings.append(
            f"{key[0]}/{key[1]}/{code}: subject.json says “{meta_name}” but the VVI says "
            f"“{subject['name']}” — using the VVI name"
        )
    subject["files"].append(row)


def _match_flat(
    branch: str, sem: int, pdf: Path, subjects: dict[tuple[str, int, str], dict]
) -> tuple[str, int, str] | None:
    stem = pdf.stem.lower()
    codes = [key[2] for key in subjects if key[0] == branch and key[1] == sem]
    for code in sorted(codes, key=len, reverse=True):
        for variant in {code, code.replace(" ", "-"), code.replace(" ", "_")}:
            if stem.startswith(variant.lower() + "-") or stem.startswith(variant.lower() + "_"):
                return (branch, sem, code)
    return None


def _warn_large(pdfs: list[Path], notes_dir: Path, warnings: list[str]) -> None:
    for pdf in pdfs:
        size = pdf.stat().st_size
        if size > MAX_PDF_BYTES:
            warnings.append(
                f"{pdf.relative_to(notes_dir)}: {size / 1048576:.1f} MB — over 8 MB, compress it"
            )


def content_of(manifest: dict) -> str:
    """The manifest without its timestamp, for a semantic staleness check."""
    body = {"subjects": manifest.get("subjects", [])}
    return json.dumps(body, ensure_ascii=False, sort_keys=True)


def human_bytes(size: int) -> str:
    if size >= 1024 * 1024:
        return f"{size / 1048576:.1f} MB"
    if size >= 1024:
        return f"{size / 1024:.0f} KB"
    return f"{size} bytes"


def main() -> int:
    parser = argparse.ArgumentParser(description="Build public/data/notes.json")
    parser.add_argument("--root", type=Path, default=None, help="repository root")
    parser.add_argument("--out", type=Path, default=None, help="output file")
    parser.add_argument("--check", action="store_true", help="exit 1 if the manifest is stale")
    args = parser.parse_args()

    root = args.root or repo_root(Path(__file__).resolve())
    out = args.out or (root / "public" / "data" / "notes.json")

    manifest, warnings = build(root)

    # The timestamp only moves when the content does. That keeps a rebuild
    # byte-identical, so `--check` can compare the file as written.
    previous: dict = {}
    if out.is_file():
        try:
            raw = json.loads(out.read_text(encoding="utf-8"))
            previous = raw if isinstance(raw, dict) else {}
        except (OSError, json.JSONDecodeError):
            previous = {}
    if content_of(previous) == content_of(manifest) and isinstance(previous.get("updatedAt"), str):
        manifest["updatedAt"] = previous["updatedAt"]
    else:
        stamps = [
            datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
            for path in root.joinpath("public", "notes").rglob("*.pdf")
            if path.is_file()
        ]
        stamps.extend(
            datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
            for path in root.joinpath("native", "notes-src", "vvi").glob("*.json")
        )
        manifest["updatedAt"] = (
            max(stamps).strftime("%Y-%m-%dT%H:%M:%SZ")
            if stamps
            else datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        )

    text = json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"

    for warning in warnings:
        print(f"warn  {warning}", file=sys.stderr)

    topics = sum(len(row["vvi"]) for row in manifest["subjects"])
    files = sum(len(row["files"]) for row in manifest["subjects"])
    total = sum(file["bytes"] for row in manifest["subjects"] for file in row["files"])
    print(
        f"notes: {files} files, {len(manifest['subjects'])} subjects, {topics} VVI topics, "
        f"{human_bytes(total)} ({total:,} bytes)"
    )

    if args.check:
        current = out.read_text(encoding="utf-8") if out.is_file() else ""
        if current != text:
            print(
                f"notes.json is stale: {out} — run: uv run native/scripts/notes/build-notes.py",
                file=sys.stderr,
            )
            return 1
        print(f"notes.json is up to date: {out}")
        return 0

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text, encoding="utf-8")
    print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
