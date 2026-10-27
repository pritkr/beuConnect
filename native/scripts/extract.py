#!/usr/bin/env python3
"""BEUConnect native — offline data forge.

Reads the website's own data (syllabus JSON, GATE JSON, holidays page, grading
engine, result manifest/CSVs, college list) and writes small, pre-parsed JSON
assets under ``native/assets/data``.  Nothing here runs at app runtime.

Python 3 standard library only.  Run from anywhere:

    uv run python native/scripts/extract.py
"""

from __future__ import annotations

import csv
import html
import json
import os
import re
import sys
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "native" / "assets" / "data"
SITE = "https://beu.prit.eu.org"
MANIFEST_URL = f"{SITE}/data/manifest/index.json"
SEMESTERS = list(range(1, 9))

# ---------------------------------------------------------------- utilities


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT))


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(data, ensure_ascii=False, indent=1)
    path.write_text(text + "\n", encoding="utf-8")


def tidy(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def shorten(value: str, limit: int = 120) -> str:
    value = tidy(value)
    if len(value) <= limit:
        return value
    cut = value[: max(1, limit - 1)].rsplit(" ", 1)[0].rstrip(" ,;:-")
    return f"{cut}…"


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (value or "").lower())


def as_number(value: Any) -> int | float | None:
    if value is None or value == "":
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return int(number) if number.is_integer() else number


def clean_numeric(value: Any) -> int | float | None:
    number = as_number(value)
    if number is None:
        return None
    return number


# ---------------------------------------------------------------- text parsing

UNIT_RE = re.compile(
    r"(?im)^[ \t]*(unit|module|part)\s*[-–—:.]*\s*(\d+(?:\.\d+)?)\b"
)
NUMBERED_RE = re.compile(
    r"(?m)^[ \t]*(?:\d{1,2}\s*[.)]|\(\s*\d{1,2}\s*\))\s+"
)
HOURS_RE = re.compile(
    r"\(?\s*(\d+(?:\.\d+)?)\s*(?:hrs?|hours?|lectures?|periods?)\s*\)?",
    re.IGNORECASE,
)
REFERENCE_RE = re.compile(
    r"(?im)^[ \t]*references?\s*:"
    r"|\btexts?\s*/\s*references?\s*:?"
    r"|\b(?:reference|text)\s+books?\s*:"
    r"|\b(?:suggested|recommended)\s+readings?\s*:",
)


def strip_markup(value: str | None) -> str:
    text = html.unescape(value or "")
    text = re.sub(r"(?i)<br\s*/?>", "\n", text)
    text = re.sub(r"(?i)</(?:p|div|li|tr|h[1-6]|section|article)>", "\n", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("\xa0", " ").replace("\u200b", "").replace("\ufeff", "")
    text = text.replace("\ufffd", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def clean_content(value: str | None) -> str:
    text = strip_markup(value)
    if not text:
        return ""
    # Book lists are not syllabus units.  "Frame of Reference:" survives.
    text = REFERENCE_RE.split(text, maxsplit=1)[0]
    return text.strip()


def balance_title(value: str) -> str:
    """Drop a trailing parenthetical that was cut mid-way by a colon split."""
    text = value
    while text.count("(") > text.count(")"):
        cut = text.rfind("(")
        if cut <= 0:
            text = text[1:]
            continue
        text = text[:cut]
    return text.strip(" \t-–—:.;,([)]")


def clean_title(value: str | None) -> str:
    text = tidy(HOURS_RE.sub(" ", value or ""))
    text = re.sub(
        r"^\s*(?:unit|module|part)\s*[-–—:.]*\s*\d+(?:\.\d+)?\s*[:.\-–—]*\s*",
        "",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r"^\s*\d+(?:\.\d+)*\s*[.)]\s*", "", text)
    text = balance_title(text)
    return shorten(text, 140)


def derive_heading(value: str, fallback: str) -> str:
    """Best-effort unit heading from the first line of a unit body.

    Only separators that are unambiguously headings (colon, spaced dash, a
    short first sentence, a short first clause) are used.  Otherwise the unit
    keeps its neutral "Unit N" label rather than a guessed phrase.
    """
    text = tidy(value)
    if not text:
        return fallback

    if ":" in text:
        candidate = clean_title(text.split(":", 1)[0])
        if 3 <= len(candidate) <= 100:
            return candidate

    dash = re.search(r"\s*[-–—]\s+", text)
    if dash and 3 <= dash.start() <= 90:
        candidate = clean_title(text[: dash.start()])
        if 3 <= len(candidate) <= 90:
            return candidate

    sentence = re.match(r"(.{8,110}?[.!?])(?:\s|$)", text)
    if sentence:
        candidate = clean_title(sentence.group(1))
        if 3 <= len(candidate) <= 90:
            return candidate

    clause = re.match(r"([^,;]{12,90})[,;]", text)
    if clause:
        candidate = clean_title(clause.group(1))
        if 3 <= len(candidate) <= 90:
            return candidate

    return fallback


def first_sentence(value: str, limit: int = 110) -> str:
    text = tidy(value)
    match = re.match(r"(.{8,160}?[.!?])(?:\s|$)", text)
    candidate = match.group(1) if match else text
    candidate = candidate.rstrip(" .!?;:")
    if len(candidate) > limit:
        candidate = shorten(candidate, limit)
    return candidate


def find_hours(value: str) -> int | float | None:
    match = HOURS_RE.search(value or "")
    if not match:
        return None
    return as_number(match.group(1))


def strip_leading_hours(value: str) -> str:
    return re.sub(
        r"^[\s\-–—:.;]*(?:\(?\s*\d+(?:\.\d+)?\s*"
        r"(?:hrs?|hours?|lectures?|periods?)\s*\)?[\s\-–—:.;]*)+",
        "",
        value or "",
        flags=re.IGNORECASE,
    ).strip()


def topic(title: str, text: str, hours: int | float | None = None) -> dict[str, Any]:
    item: dict[str, Any] = {"title": shorten(title or "Topic", 140), "text": tidy(text)}
    if hours is not None:
        item["hours"] = hours
    return item


def dedupe_topics(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, str]] = set()
    output: list[dict[str, Any]] = []
    for item in items:
        key = (item["title"].lower(), item["text"].lower())
        if key in seen:
            continue
        seen.add(key)
        output.append(item)
    return output


def topic_from_chunk(chunk: str, fallback: str) -> dict[str, Any]:
    chunk = chunk.strip("\n ")
    if not chunk:
        return topic(fallback, "")
    line, _, rest = chunk.partition("\n")
    line = tidy(line)
    body = rest
    title = ""
    if ":" in line:
        head, after = line.split(":", 1)
        if len(head) <= 110:
            title = clean_title(head)
            body = "\n".join(part for part in (after, rest) if part)
        else:
            title = first_sentence(line, 100)
            body = line
    else:
        candidate = clean_title(line)
        if candidate and len(candidate) <= 100:
            title = candidate
            body = rest or line
        else:
            title = derive_heading(line, fallback)
            body = line

    hours = find_hours(line)
    body = strip_leading_hours(tidy(body))
    if not title:
        title = first_sentence(body or line, 100) or fallback
    if not body:
        body = ""
    return topic(title, body, hours)


def split_numbered(body: str, fallback: str) -> list[dict[str, Any]]:
    marks = list(NUMBERED_RE.finditer(body))
    if not marks:
        return [topic_from_chunk(body, fallback)]

    items: list[dict[str, Any]] = []
    preface = body[: marks[0].start()].strip()
    if len(tidy(preface)) >= 140:
        title = first_sentence(preface, 100) or "Overview"
        items.append(topic(title, preface))

    for index, mark in enumerate(marks):
        end = marks[index + 1].start() if index + 1 < len(marks) else len(body)
        chunk = body[mark.end() : end]
        if chunk.strip():
            items.append(topic_from_chunk(chunk, fallback))

    if not items:
        items.append(topic(fallback, body))
    return dedupe_topics(items)


def parse_unit_heading(head: str, rest: str, number: str) -> tuple[str, str]:
    label = f"Unit {as_number(number) or number}"
    head = tidy(head).strip(" -–—:.;,\t")
    rest = rest.strip()

    # A unit that opens straight into a numbered topic list has no heading of
    # its own.  Do not promote the first topic to the unit title.
    if NUMBERED_RE.match(rest):
        return label, rest

    inline = ""
    title = ""
    if head:
        if ":" in head:
            before, after = head.split(":", 1)
            title = clean_title(before)
            if title:
                inline = after
        else:
            candidate = clean_title(head)
            if candidate and len(candidate) <= 100 and not candidate.endswith("."):
                title = candidate
            else:
                inline = head

    if not title and clean_title(head):
        title = derive_heading(head, label)
    if not title and rest:
        title = derive_heading(rest.split("\n", 1)[0], label)
    if not title:
        title = label

    body = "\n".join(part for part in (inline, rest) if part.strip())
    body = strip_leading_hours(body.strip())
    return title, body


def parse_syllabus(content: str | None, subject_name: str) -> list[dict[str, Any]]:
    text = clean_content(content)
    if not text:
        return []

    marks = list(UNIT_RE.finditer(text))
    if not marks:
        first_line = tidy(text.split("\n", 1)[0])
        if NUMBERED_RE.match(first_line):
            heading = "Course content"
        else:
            heading = derive_heading(first_line.rstrip(":"), "Course content")
        if not heading or heading.lower() in {"detailed contents", "contents"}:
            heading = "Course content"
        return [
            {
                "number": 1,
                "title": heading,
                "topics": split_numbered(text, heading),
            }
        ]

    units: list[dict[str, Any]] = []
    preface = text[: marks[0].start()].strip()
    if len(tidy(preface)) >= 140:
        units.append(
            {
                "number": 0,
                "title": "Course overview",
                "topics": split_numbered(preface, "Course overview"),
            }
        )

    for index, mark in enumerate(marks):
        end = marks[index + 1].start() if index + 1 < len(marks) else len(text)
        line_end = text.find("\n", mark.end())
        if line_end == -1 or line_end > end:
            line_end = end
        head = text[mark.end() : line_end]
        rest = text[line_end + 1 : end].strip() if line_end < end else ""
        title, body = parse_unit_heading(head, rest, mark.group(2))
        topics = split_numbered(body, title)
        if not topics:
            topics = [topic(title, "")]
        units.append(
            {
                "number": as_number(mark.group(2)) or (index + 1),
                "title": title,
                "topics": topics,
            }
        )

    return units or [
        {
            "number": 1,
            "title": "Course content",
            "topics": [topic(subject_name or "Course content", tidy(text))],
        }
    ]


# ---------------------------------------------------------------- syllabus data

SYLPY_BRANCH = {
    "civil": "civil",
    "cse": "cse",
    "ece": "ece",
    "ee": "ee",
    "eee": "eee",
    "me": "mech",
    "mech": "mech",
}


def load_sylpy() -> tuple[
    dict[str, dict[int, list[tuple[Path, dict[str, Any]]]]],
    dict[tuple[str, str], list[tuple[int, Path, dict[str, Any]]]],
]:
    by_sem: dict[str, dict[int, list[tuple[Path, dict[str, Any]]]]] = defaultdict(
        lambda: defaultdict(list)
    )
    by_name: dict[tuple[str, str], list[tuple[int, Path, dict[str, Any]]]] = defaultdict(list)

    for path in sorted((ROOT / "sylpy").glob("*.json")):
        prefix = re.match(r"([a-z]+)", path.stem.lower())
        if not prefix:
            continue
        branch = SYLPY_BRANCH.get(prefix.group(1))
        if not branch:
            continue
        try:
            data = read_json(path)
        except (OSError, json.JSONDecodeError):
            continue
        if not isinstance(data, dict):
            continue
        for raw_sem, semester in (data.get("semesters") or {}).items():
            try:
                sem = int(raw_sem)
            except (TypeError, ValueError):
                continue
            if sem not in SEMESTERS:
                continue
            for subject in semester.get("subjects") or []:
                if not isinstance(subject, dict):
                    continue
                by_sem[branch][sem].append((path, subject))
                key = (branch, slug(subject.get("name", "")))
                if key[1]:
                    by_name[key].append((sem, path, subject))
    return by_sem, by_name


def best_sylpy_semester(
    by_sem: dict[str, dict[int, list[tuple[Path, dict[str, Any]]]]],
    branch: str,
    semester: int,
) -> tuple[Path, list[dict[str, Any]]] | None:
    grouped: dict[Path, list[dict[str, Any]]] = defaultdict(list)
    for path, subject in by_sem.get(branch, {}).get(semester, []):
        grouped[path].append(subject)
    if not grouped:
        return None
    path, subjects = max(
        grouped.items(),
        key=lambda item: (
            len(item[1]),
            sum(len(subject.get("content") or "") for subject in item[1]),
        ),
    )
    return path, subjects


def find_fill(
    by_name: dict[tuple[str, str], list[tuple[int, Path, dict[str, Any]]]],
    branch: str,
    semester: int,
    subject: dict[str, Any],
) -> tuple[Path, dict[str, Any]] | None:
    key = (branch, slug(subject.get("name", "")))
    candidates = by_name.get(key, [])
    if not candidates:
        return None
    same_sem = [item for item in candidates if item[0] == semester]
    ordered = same_sem + [item for item in candidates if item[0] != semester]
    for _, path, candidate in ordered:
        if (candidate.get("content") or "").strip():
            return path, candidate
    return None


def build_subjects(
    gaps: list[dict[str, Any]],
) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    config = read_json(ROOT / "src/assets/data/config.json")
    by_sem, by_name = load_sylpy()
    branch_meta = config.get("branches") or []
    docs: dict[str, dict[str, Any]] = {}
    branch_summary: dict[str, Any] = {}

    for branch in branch_meta:
        code = branch["code"]
        name = branch["name"]
        source_file = branch.get("file") or code
        source_path = ROOT / f"src/assets/data/branches/{source_file}.json"
        try:
            source = read_json(source_path)
        except (OSError, json.JSONDecodeError):
            source = {}
            gaps.append(
                {
                    "dataset": "subjects",
                    "branch": code,
                    "reason": f"missing/unreadable {rel(source_path)}",
                }
            )

        source_semesters: dict[int, list[dict[str, Any]]] = {}
        for raw_sem, semester in (source.get("semesters") or {}).items():
            try:
                sem = int(raw_sem)
            except (TypeError, ValueError):
                continue
            if sem in SEMESTERS:
                source_semesters[sem] = list(semester.get("subjects") or [])

        subjects_out: list[dict[str, Any]] = []
        available_semesters: list[int] = []
        used_ids: set[str] = set()
        stubs = 0

        for semester in SEMESTERS:
            raw_subjects = source_semesters.get(semester)
            fallback_path: Path | None = None
            if raw_subjects is None:
                fallback = best_sylpy_semester(by_sem, code, semester)
                if fallback:
                    fallback_path, raw_subjects = fallback
                else:
                    gaps.append(
                        {
                            "dataset": "subjects",
                            "branch": code,
                            "semester": semester,
                            "reason": "no syllabus source for this semester",
                        }
                    )
                    continue
            if not raw_subjects:
                gaps.append(
                    {
                        "dataset": "subjects",
                        "branch": code,
                        "semester": semester,
                        "reason": "source semester has no subjects",
                    }
                )
                continue

            available_semesters.append(semester)
            seen: set[tuple[str, str]] = set()

            for index, raw in enumerate(raw_subjects, start=1):
                if not isinstance(raw, dict):
                    continue
                subject_name = tidy(raw.get("name")) or f"Subject {index}"
                subject_code = tidy(raw.get("code")) or "-"
                dedupe_key = (subject_code.lower(), subject_name.lower())
                if dedupe_key in seen:
                    continue
                seen.add(dedupe_key)

                content = clean_content(raw.get("content"))
                subject_source = fallback_path or source_path
                confidence = "high"
                from_fallback = fallback_path is not None

                if not content and not from_fallback:
                    fill = find_fill(by_name, code, semester, raw)
                    if fill:
                        fill_path, fill_subject = fill
                        filled = clean_content(fill_subject.get("content"))
                        if filled:
                            content = filled
                            subject_source = fill_path
                            confidence = "medium"

                if not content:
                    confidence = "none"
                    stubs += 1

                units = parse_syllabus(content, subject_name) if content else []
                if not units:
                    # Unparseable/absent syllabus: emit an empty array rather than
                    # inventing a unit or topic.  The gap is recorded in manifest.json.
                    units = []

                base = f"{code}-s{semester}-{slug(subject_code) or f'i{index}'}"
                subject_id = base
                suffix = 2
                while subject_id in used_ids:
                    subject_id = f"{base}-{suffix}"
                    suffix += 1
                used_ids.add(subject_id)

                unit_out: list[dict[str, Any]] = []
                for unit_index, unit in enumerate(units, start=1):
                    unit_id = f"{subject_id}-u{unit_index}"
                    topics_out = []
                    for topic_index, item in enumerate(unit.get("topics") or [], start=1):
                        topic_item = {
                            "id": f"{unit_id}-t{topic_index}",
                            "title": item.get("title") or "Topic",
                            "text": item.get("text") or "",
                        }
                        if item.get("hours") is not None:
                            topic_item["hours"] = item["hours"]
                        if item.get("stub"):
                            topic_item["stub"] = True
                        topics_out.append(topic_item)
                    if not topics_out:
                        topics_out = [
                            {
                                "id": f"{unit_id}-t1",
                                "title": unit.get("title") or "Topic",
                                "text": "",
                            }
                        ]
                    unit_item = {
                        "id": unit_id,
                        "number": unit.get("number", unit_index),
                        "title": unit.get("title") or f"Unit {unit_index}",
                        "topics": topics_out,
                    }
                    unit_out.append(unit_item)

                credits = clean_numeric(raw.get("credits"))
                subject_out: dict[str, Any] = {
                    "id": subject_id,
                    "semester": semester,
                    "code": subject_code,
                    "name": subject_name,
                    "type": tidy(raw.get("type")) or "Theory",
                    "credits": credits if credits is not None else 0,
                    "source": rel(subject_source),
                    "confidence": confidence,
                    "units": unit_out,
                }
                summary = raw.get("summary")
                if isinstance(summary, dict):
                    ltp = {
                        key: clean_numeric(summary.get(key))
                        for key in ("lecture", "tutorial", "practical")
                        if summary.get(key) is not None
                    }
                    if ltp:
                        subject_out["ltp"] = ltp
                if confidence == "none":
                    subject_out["stub"] = True
                subject_out["unitCount"] = len(unit_out)
                subject_out["topicCount"] = sum(len(u["topics"]) for u in unit_out)
                subjects_out.append(subject_out)

        if stubs:
            gaps.append(
                {
                    "dataset": "subjects",
                    "branch": code,
                    "count": stubs,
                    "reason": "subjects have no syllabus text in any source (emitted with units: [])",
                }
            )

        doc = {
            "dataset": "subjects",
            "branch": code,
            "branchName": name,
            "generatedAt": "",  # filled by caller
            "source": rel(source_path),
            "subjects": subjects_out,
        }
        docs[code] = doc
        branch_summary[code] = {
            "code": code,
            "name": name,
            "semesters": SEMESTERS,
            "syllabusSemesters": sorted(available_semesters),
            "subjectCount": len(subjects_out),
            "unitCount": sum(len(s["units"]) for s in subjects_out),
            "topicCount": sum(s["topicCount"] for s in subjects_out),
            "stubCount": stubs,
            "source": rel(source_path),
        }

    return docs, branch_summary


# ---------------------------------------------------------------- GATE


GATE_HEAD_RE = re.compile(r"(?:^|(?<=\s))([A-Z][A-Za-z0-9 ,&()/+.\-]{2,64}):\s+")


def gate_heading_ok(value: str) -> bool:
    if re.search(r"\.\s", value):
        return False
    if re.match(r"^[A-Z]\.\s", value):
        return False
    if value.lower().strip() in {"note", "notes", "example"}:
        return True
    return True


def split_gate(content: str) -> list[dict[str, Any]]:
    text = tidy(content)
    if not text:
        return []
    matches = [m for m in GATE_HEAD_RE.finditer(text) if gate_heading_ok(m.group(1))]
    if not matches:
        return [topic("Overview", text)]

    items: list[dict[str, Any]] = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        body = text[match.end() : end].strip(" ;,.")
        title = clean_title(match.group(1))
        if not body:
            continue
        items.append(topic(title or "Overview", body))
    return dedupe_topics(items) or [topic("Overview", text)]


def build_gate(gaps: list[dict[str, Any]]) -> dict[str, Any]:
    papers_path = ROOT / "src/assets/data/gate-papers.json"
    try:
        papers = read_json(papers_path)
    except (OSError, json.JSONDecodeError):
        papers = []
        gaps.append(
            {
                "dataset": "gate",
                "reason": f"missing/unreadable {rel(papers_path)}",
            }
        )

    gate_dir = ROOT / "src/assets/data/gate"
    fallback_dir = ROOT / "gatextract/gate"
    out: list[dict[str, Any]] = []
    section_total = 0
    topic_total = 0

    for paper in papers:
        code = tidy(paper.get("code"))
        name = tidy(paper.get("name")) or code
        source_path = None
        for candidate in (gate_dir / f"{code}.json", gate_dir / f"{code}-2026.json"):
            if candidate.exists():
                source_path = candidate
                break
        if source_path is None:
            for candidate in (fallback_dir / f"{code}.json", fallback_dir / f"{code}-2026.json"):
                if candidate.exists():
                    source_path = candidate
                    break

        sections_raw: list[dict[str, Any]] = []
        if source_path:
            try:
                data = read_json(source_path)
                sections_raw = data.get("sections") or []
            except (OSError, json.JSONDecodeError):
                sections_raw = []

        sections: list[dict[str, Any]] = []
        for index, section in enumerate(sections_raw, start=1):
            raw_title = tidy(section.get("title"))
            number_match = re.search(r"section\s+(\d+)\s*:", raw_title, re.I)
            number = int(number_match.group(1)) if number_match else index
            title = re.sub(r"^section\s+\d+\s*:\s*", "", raw_title, flags=re.I).strip()
            title = balance_title(title)
            topics = split_gate(section.get("content") or "")
            section_id = f"gate-{code.lower()}-s{index}"
            topic_out = [
                {
                    "id": f"{section_id}-t{topic_index}",
                    "title": item["title"],
                    "text": item["text"],
                }
                for topic_index, item in enumerate(topics, start=1)
            ]
            sections.append(
                {
                    "id": section_id,
                    "number": number,
                    "title": title or raw_title or f"Section {number}",
                    "topics": topic_out,
                }
            )

        confidence = "high" if sections else "none"
        if not sections:
            gaps.append(
                {
                    "dataset": "gate",
                    "code": code,
                    "reason": "source JSON has no parsed sections (PDF text is font-subset)",
                }
            )

        section_total += len(sections)
        topic_total += sum(len(section["topics"]) for section in sections)
        out.append(
            {
                "code": code,
                "name": name,
                "source": rel(source_path) if source_path else "",
                "confidence": confidence,
                "sections": sections,
                "sectionCount": len(sections),
                "topicCount": sum(len(section["topics"]) for section in sections),
            }
        )

    return {
        "dataset": "gate",
        "generatedAt": "",
        "source": f"{rel(papers_path)}; src/assets/data/gate/*.json; gatextract/gate/*.json",
        "paperCount": len(out),
        "sectionCount": section_total,
        "topicCount": topic_total,
        "papers": out,
    }


# ---------------------------------------------------------------- holidays


def parse_holidays(gaps: list[dict[str, Any]]) -> dict[str, Any]:
    path = ROOT / "src/pages/holidays-calendar.astro"
    try:
        source = path.read_text(encoding="utf-8")
    except OSError:
        source = ""

    holidays: list[dict[str, Any]] = []
    block_match = re.search(
        r"const\s+holidays2026\s*:[^=]*=\s*\[(.*?)\];", source, re.S
    )
    if block_match:
        for object_match in re.finditer(r"\{([^{}]*)\}", block_match.group(1), re.S):
            body = object_match.group(1)

            def text_field(key: str) -> str | None:
                found = re.search(rf'\b{key}\s*:\s*"([^"]*)"', body)
                return found.group(1) if found else None

            def bool_field(key: str) -> bool:
                return bool(re.search(rf"\b{key}\s*:\s*true\b", body))

            raw_id = re.search(r"\bid\s*:\s*(\d+)", body)
            if not raw_id:
                continue
            start = text_field("start")
            name = text_field("name")
            if not start or not name:
                continue
            entry: dict[str, Any] = {
                "id": int(raw_id.group(1)),
                "name": name,
                "start": start,
                "category": text_field("category") or "academic",
                "source": rel(path),
                "confidence": "high",
            }
            end = text_field("end")
            if end:
                entry["end"] = end
            if bool_field("moonBased"):
                entry["moonBased"] = True
            if bool_field("teacherOnly"):
                entry["teacherOnly"] = True
            holidays.append(entry)

    holidays.sort(key=lambda item: (item["start"], item["id"]))
    if not holidays:
        gaps.append(
            {
                "dataset": "holidays",
                "reason": f"could not parse holidays2026 from {rel(path)}",
            }
        )

    gaps.append(
        {
            "dataset": "holidays",
            "year": 2025,
            "reason": "only a PNG calendar exists (src/assets/holidays2025.png); dates are not machine-readable",
        }
    )
    return {
        "dataset": "holidays",
        "generatedAt": "",
        "source": rel(path),
        "year": 2026,
        "count": len(holidays),
        "holidays": holidays,
    }


# ---------------------------------------------------------------- grading


def build_grading(gaps: list[dict[str, Any]]) -> dict[str, Any]:
    path = ROOT / "src/lib/calculator/engine.ts"
    try:
        source = path.read_text(encoding="utf-8")
    except OSError:
        source = ""

    scale: list[dict[str, Any]] = []
    block = re.search(r"BEU_GRADES[^{]*\{(.*?)\}", source, re.S)
    if block:
        for grade, points in re.findall(r"'([A-Z][+]?)'\s*:\s*(\d+)", block.group(1)):
            scale.append({"grade": grade, "points": int(points)})

    thresholds: dict[str, int] = {}
    for minimum, grade in re.findall(
        r"if\s*\(\s*perc\s*>=\s*(\d+)\s*\)\s*return\s*'([^']+)'", source
    ):
        thresholds[grade] = int(minimum)

    for item in scale:
        if item["grade"] in thresholds:
            item["minPercent"] = thresholds[item["grade"]]
    scale.sort(key=lambda item: item["points"], reverse=True)
    if not scale:
        gaps.append(
            {
                "dataset": "grading",
                "reason": f"could not parse BEU_GRADES from {rel(path)}",
            }
        )

    ia_100 = re.search(r"const\s+maxIa\s*=\s*totalMarks\s*===\s*100\s*\?\s*(\d+)\s*:\s*(\d+)", source)
    ese_100 = re.search(r"const\s+maxEse\s*=\s*totalMarks\s*===\s*100\s*\?\s*(\d+)\s*:\s*(\d+)", source)
    ese_min = re.search(
        r"const\s+minEseRequired\s*=\s*totalMarks\s*===\s*100\s*\?\s*([\d.]+)\s*:\s*([\d.]+)",
        source,
    )

    marks = {
        "100": {
            "ia": int(ia_100.group(1)) if ia_100 else 30,
            "ese": int(ese_100.group(1)) if ese_100 else 70,
        },
        "50": {
            "ia": int(ia_100.group(2)) if ia_100 else 20,
            "ese": int(ese_100.group(2)) if ese_100 else 30,
        },
    }
    pass_ese = [
        {
            "total": total,
            "eseMin": float(ese_min.group(index)) if ese_min else (24.5 if total == 100 else 10.5),
        }
        for index, total in enumerate((100, 50), start=1)
    ]
    ese_percent = round(pass_ese[0]["eseMin"] / marks["100"]["ese"] * 100)
    overall_percent = min(thresholds.values()) if thresholds else 35

    return {
        "dataset": "grading",
        "generatedAt": "",
        "source": rel(path),
        "scale": scale,
        "pass": {
            "esePercent": ese_percent,
            "overallPercent": overall_percent,
            "eseMinByTotal": pass_ese,
        },
        "marks": marks,
        "maxGpa": 10,
    }


# ---------------------------------------------------------------- colleges


BRANCH_NAMES = {
    "101": "Civil Engineering",
    "102": "Mechanical Engineering",
    "103": "Electrical Engineering",
    "104": "Electronics & Communication Engineering",
    "105": "Computer Science & Engineering",
    "106": "Information Technology",
    "107": "Leather Technology Engineering",
    "110": "Electrical & Electronics Engineering",
    "161": "Electrical & Electronics Engineering (161)",
}
BRANCH_SLUGS = {
    "101": "civil",
    "102": "mech",
    "103": "ee",
    "104": "ece",
    "105": "cse",
    "106": "it",
    "107": "leather",
    "110": "eee",
    "161": "eee",
}


def parse_ts_maps(source: str, name: str) -> dict[str, str]:
    block = re.search(rf"export\s+const\s+{name}\s*:\s*Record<string,\s*string>\s*=\s*\{{(.*?)\}};", source, re.S)
    if not block:
        return {}
    return dict(re.findall(r'"(\d+)"\s*:\s*"([^"]+)"', block.group(1)))


def fetch_live_manifest() -> tuple[dict[str, Any] | None, str | None]:
    request = urllib.request.Request(
        MANIFEST_URL,
        headers={"User-Agent": "BEUConnect-data-forge/1.0"},
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.loads(response.read().decode("utf-8")), None
    except Exception as error:  # noqa: BLE001 - offline builds must not fail
        return None, f"{type(error).__name__}: {error}"


def add_availability(
    availability: dict[str, dict[str, dict[str, set[int]]]],
    sources: dict[tuple[str, str, str, int], set[str]],
    college: str,
    branch: str,
    batch: str,
    semester: int,
    source: str,
) -> None:
    if not college or not branch or not batch:
        return
    if semester not in SEMESTERS:
        return
    availability[college][branch][batch].add(semester)
    sources[(college, branch, batch, semester)].add(source)


def build_colleges(gaps: list[dict[str, Any]]) -> tuple[dict[str, Any], dict[str, Any]]:
    colleges_path = ROOT / "src/data/colleges.json"
    try:
        colleges_raw = read_json(colleges_path)
    except (OSError, json.JSONDecodeError):
        colleges_raw = []
        gaps.append(
            {
                "dataset": "colleges",
                "reason": f"missing/unreadable {rel(colleges_path)}",
            }
        )

    beu_reg_path = ROOT / "src/lib/beuReg.ts"
    try:
        beu_reg = beu_reg_path.read_text(encoding="utf-8")
    except OSError:
        beu_reg = ""
    college_map = parse_ts_maps(beu_reg, "collegeMap")
    branch_map = parse_ts_maps(beu_reg, "branchMap")

    names: dict[str, dict[str, Any]] = {}
    for item in colleges_raw:
        code = tidy(str(item.get("CollegeCode", "")))
        if not code:
            continue
        names[code] = {
            "name": tidy(item.get("Name")) or college_map.get(code) or f"College {code}",
            "link": tidy(item.get("link")),
            "abbr": tidy(item.get("abbreviations")),
            "source": rel(colleges_path),
        }

    for code, name in college_map.items():
        if code not in names:
            names[code] = {
                "name": name,
                "link": "",
                "abbr": "",
                "source": rel(beu_reg_path),
            }

    availability: dict[str, dict[str, dict[str, set[int]]]] = defaultdict(
        lambda: defaultdict(lambda: defaultdict(set))
    )
    source_map: dict[tuple[str, str, str, int], set[str]] = defaultdict(set)

    manifest_path = ROOT / "public/data/manifest/index.json"
    try:
        manifest = read_json(manifest_path)
        manifest_source = rel(manifest_path)
    except (OSError, json.JSONDecodeError):
        manifest = {}
        manifest_source = rel(manifest_path)
        gaps.append(
            {
                "dataset": "colleges",
                "reason": f"missing/unreadable {manifest_source}",
            }
        )

    provenance = {
        "manifest": manifest_source,
        "live-manifest": MANIFEST_URL,
        "students": "public/data/students_*.csv",
        "wide": "public/data/wide_*.csv",
    }

    live, live_error = fetch_live_manifest()
    if live_error:
        gaps.append(
            {
                "dataset": "colleges",
                "reason": f"live manifest fetch failed: {live_error}",
            }
        )

    for source_label, payload in (("manifest", manifest), ("live-manifest", live or {})):
        for batch, branches in (payload or {}).items():
            if not isinstance(branches, dict):
                continue
            for branch, paths in branches.items():
                for raw_path in paths or []:
                    parts = str(raw_path).replace("\\", "/").split("/")
                    if len(parts) < 2:
                        continue
                    match = re.search(r"sem(\d+)_(\d+)\.json$", parts[-1])
                    if not match:
                        continue
                    add_availability(
                        availability,
                        source_map,
                        match.group(2),
                        branch,
                        str(batch),
                        int(match.group(1)),
                        source_label,
                    )

    students_all_re = re.compile(r"students_(\d+)_all_(\d+)_sem(\d+)\.csv$")
    students_college_re = re.compile(r"students_(\d+)_(\d+)_(\d+)_sem(\d+)\.csv$")
    for path in sorted((ROOT / "public/data").glob("students_*.csv")):
        all_match = students_all_re.search(path.name)
        college_match = students_college_re.search(path.name) if not all_match else None
        if not all_match and not college_match:
            continue
        if all_match:
            batch, branch, semester = all_match.group(1), all_match.group(2), int(all_match.group(3))
            fixed_college = ""
        else:
            batch, branch, semester = college_match.group(1), college_match.group(3), int(college_match.group(4))
            fixed_college = college_match.group(2)
        try:
            with path.open("r", encoding="utf-8", newline="") as fh:
                for row in csv.DictReader(fh):
                    college = fixed_college or tidy(row.get("CollegeCode"))
                    if not college:
                        reg = tidy(row.get("RegNo"))
                        if len(reg) >= 10 and reg[:2] == batch:
                            college = reg[5:8]
                    add_availability(
                        availability,
                        source_map,
                        college,
                        branch,
                        batch,
                        semester,
                        "students",
                    )
        except (OSError, UnicodeDecodeError, csv.Error):
            continue

    wide_re = re.compile(r"wide_(\d+)_(\d+)_(\d+)_sem(\d+)\.csv$")
    for path in sorted((ROOT / "public/data").glob("wide_*.csv")):
        match = wide_re.search(path.name)
        if not match:
            continue
        add_availability(
            availability,
            source_map,
            match.group(2),
            match.group(3),
            match.group(1),
            int(match.group(4)),
            "wide",
        )

    batches = sorted(
        {batch for college in availability.values() for branch in college.values() for batch in branch}
    )
    branch_codes = sorted(
        {branch for college in availability.values() for branch in college}
    )
    branches_out = []
    for code in branch_codes:
        branch_colleges = [c for c in availability if code in availability[c]]
        branches_out.append(
            {
                "code": code,
                "name": branch_map.get(code) or BRANCH_NAMES.get(code, f"Branch {code}"),
                "slug": BRANCH_SLUGS.get(code, "other"),
                "collegeCount": len(branch_colleges),
            }
        )

    colleges_out: list[dict[str, Any]] = []
    for code in sorted(availability):
        meta = names.get(
            code,
            {"name": f"College {code}", "link": "", "abbr": "", "source": ""},
        )
        full_name = college_map.get(code, meta["name"])
        branches_for_college = []
        for branch_code in sorted(availability[code]):
            branch_availability = availability[code][branch_code]
            batch_map = {
                batch: sorted(semesters)
                for batch, semesters in sorted(branch_availability.items())
                if semesters
            }
            if not batch_map:
                continue
            used_sources = {
                source
                for (college, branch, batch, semester) in source_map
                if college == code and branch == branch_code
                for source in source_map[(college, branch, batch, semester)]
            }
            confidence = "high" if {"manifest", "live-manifest", "wide"} & used_sources else "medium"
            branches_for_college.append(
                {
                    "code": branch_code,
                    "name": branch_map.get(branch_code)
                    or BRANCH_NAMES.get(branch_code, f"Branch {branch_code}"),
                    "slug": BRANCH_SLUGS.get(branch_code, "other"),
                    "confidence": confidence,
                    "source": "; ".join(provenance.get(source, source) for source in sorted(used_sources)),
                    "batches": batch_map,
                }
            )
        entry: dict[str, Any] = {
            "code": code,
            "name": meta["name"],
            "source": meta["source"],
            "branches": branches_for_college,
        }
        if full_name and full_name != meta["name"]:
            entry["fullName"] = full_name
        if meta.get("abbr"):
            entry["abbr"] = meta["abbr"]
        if meta.get("link"):
            entry["link"] = meta["link"]
        colleges_out.append(entry)

    pair_count = sum(len(branches) for branches in availability.values())
    extra_codes = sorted(set(names) - set(availability))
    if extra_codes:
        gaps.append(
            {
                "dataset": "colleges",
                "count": len(extra_codes),
                "codes": extra_codes,
                "reason": "known collegeMap codes with no manifest/CSV rows; omitted (no coverage)",
            }
        )
    doc = {
        "dataset": "colleges",
        "generatedAt": "",
        "source": (
            f"{rel(colleges_path)}; {rel(beu_reg_path)}; {manifest_source}; "
            "public/data/students_*.csv; public/data/wide_*.csv; " + MANIFEST_URL
        ),
        "batches": batches,
        "branches": branches_out,
        "colleges": colleges_out,
    }
    summary = {
        "collegeCount": len(colleges_out),
        "collegeBranchCount": pair_count,
        "batchCount": len(batches),
    }
    return doc, summary


# ---------------------------------------------------------------- manifest


def main() -> int:
    generated = ""
    epoch = os.environ.get("SOURCE_DATE_EPOCH")
    if epoch and epoch.isdigit():
        stamp = datetime.fromtimestamp(int(epoch), timezone.utc)
    else:
        stamp = datetime.now(timezone.utc)
    generated = stamp.replace(microsecond=0).isoformat().replace("+00:00", "Z")

    gaps: list[dict[str, Any]] = []
    OUT.mkdir(parents=True, exist_ok=True)

    subjects_docs, branch_summary = build_subjects(gaps)
    branches_doc = {
        "dataset": "branches",
        "generatedAt": generated,
        "source": "src/assets/data/config.json; src/pages/syllabus/[branch]/index.astro",
        "branches": [branch_summary[code] for code in sorted(branch_summary)],
    }
    write_json(OUT / "branches.json", branches_doc)

    subject_entries: list[dict[str, Any]] = []
    expected_subject_files: set[str] = set()
    for code, doc in sorted(subjects_docs.items()):
        doc["generatedAt"] = generated
        path = OUT / f"subjects-{code}.json"
        write_json(path, doc)
        expected_subject_files.add(path.name)
        subject_entries.append(
            {
                "dataset": "subjects",
                "branch": code,
                "path": path.name,
                "count": len(doc["subjects"]),
                "generatedAt": generated,
                "source": doc["source"],
            }
        )
    # Remove generated subject files for branches that no longer exist.
    for path in OUT.glob("subjects-*.json"):
        if path.name not in expected_subject_files:
            path.unlink()

    gate_doc = build_gate(gaps)
    gate_doc["generatedAt"] = generated
    write_json(OUT / "gate.json", gate_doc)

    holidays_doc = parse_holidays(gaps)
    holidays_doc["generatedAt"] = generated
    write_json(OUT / "holidays.json", holidays_doc)

    grading_doc = build_grading(gaps)
    grading_doc["generatedAt"] = generated
    write_json(OUT / "grading.json", grading_doc)

    colleges_doc, colleges_summary = build_colleges(gaps)
    colleges_doc["generatedAt"] = generated
    write_json(OUT / "colleges.json", colleges_doc)

    gaps.append(
        {
            "dataset": "routine",
            "reason": "routine.astro proxies a live per-registration timetable; no static routine data exists in the repo",
        }
    )
    gaps.append(
        {
            "dataset": "subjects",
            "reason": "src/assets/data/branches/cse copy.json is ignored: no semesters/subjects",
        }
    )

    subject_count = sum(entry["count"] for entry in subject_entries)
    unit_count = sum(branch["unitCount"] for branch in branches_doc["branches"])
    topic_count = sum(branch["topicCount"] for branch in branches_doc["branches"])
    stub_count = sum(branch["stubCount"] for branch in branches_doc["branches"])
    semester_count = sum(
        len(branch["syllabusSemesters"]) for branch in branches_doc["branches"]
    )

    totals = {
        "branches": len(branches_doc["branches"]),
        "semestersInCourse": len(branches_doc["branches"]) * len(SEMESTERS),
        "semestersWithSyllabus": semester_count,
        "subjects": subject_count,
        "units": unit_count,
        "topics": topic_count,
        "subjectStubs": stub_count,
        "gatePapers": gate_doc["paperCount"],
        "gateSections": gate_doc["sectionCount"],
        "gateTopics": gate_doc["topicCount"],
        "holidays": len(holidays_doc["holidays"]),
        "colleges": colleges_summary["collegeCount"],
        "collegeBranches": colleges_summary["collegeBranchCount"],
        "batches": colleges_summary["batchCount"],
    }

    datasets: list[dict[str, Any]] = [
        {
            "dataset": "branches",
            "path": "branches.json",
            "count": totals["branches"],
            "generatedAt": generated,
            "source": branches_doc["source"],
        },
        *subject_entries,
        {
            "dataset": "gate",
            "path": "gate.json",
            "count": gate_doc["paperCount"],
            "generatedAt": generated,
            "source": gate_doc["source"],
        },
        {
            "dataset": "holidays",
            "path": "holidays.json",
            "count": len(holidays_doc["holidays"]),
            "generatedAt": generated,
            "source": holidays_doc["source"],
        },
        {
            "dataset": "grading",
            "path": "grading.json",
            "count": len(grading_doc["scale"]),
            "generatedAt": generated,
            "source": grading_doc["source"],
        },
        {
            "dataset": "colleges",
            "path": "colleges.json",
            "count": colleges_summary["collegeCount"],
            "generatedAt": generated,
            "source": colleges_doc["source"],
        },
    ]

    manifest = {
        "dataset": "manifest",
        "generatedAt": generated,
        "source": sorted({entry["source"] for entry in datasets}),
        "datasets": datasets,
        "totals": totals,
        "gaps": gaps,
    }
    write_json(OUT / "manifest.json", manifest)

    print(f"Wrote {len(datasets) + 1} files to {rel(OUT)}")
    print(
        "branches {branches} · semesters {semestersWithSyllabus}/{semestersInCourse} · "
        "subjects {subjects} · units {units} · topics {topics}".format(**totals)
    )
    print(
        "GATE {gatePapers} papers · {gateSections} sections · {gateTopics} topics · "
        "holidays {holidays} · colleges {colleges} · college-branches {collegeBranches}".format(
            **totals
        )
    )
    print(f"Gaps recorded: {len(gaps)} (see manifest.json · gaps and README.md)")

    if gaps:
        print("\nGap summary:")
        for gap in gaps:
            label = gap.get("dataset", "?")
            where = ""
            if gap.get("branch"):
                where += f" {gap['branch']}"
            if gap.get("semester"):
                where += f" sem{gap['semester']}"
            if gap.get("year"):
                where += f" {gap['year']}"
            if gap.get("code"):
                where += f" {gap['code']}"
            print(f"  - {label}{where}: {gap.get('reason', '')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
