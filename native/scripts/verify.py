#!/usr/bin/env python3
"""Validate the generated offline data in ``native/assets/data``.

Checks manifest counts, unique ids, required shapes, and the documented gaps.
Python 3 standard library only:

    uv run python native/scripts/verify.py
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from datetime import date
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "native" / "assets" / "data"
SEMESTERS = set(range(1, 9))

errors: list[str] = []
warnings: list[str] = []
rows: list[tuple[str, int, str]] = []


def check(condition: bool, message: str) -> bool:
    if not condition:
        errors.append(message)
    return condition


def load(path: Path) -> Any:
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, json.JSONDecodeError) as error:
        errors.append(f"{path.name}: {type(error).__name__}: {error}")
        return None


def unique(values: list[str]) -> list[str]:
    seen: set[str] = set()
    duplicates: list[str] = []
    for value in values:
        if value in seen:
            duplicates.append(value)
        seen.add(value)
    return duplicates


def required(entry: dict[str, Any], fields: tuple[str, ...], label: str) -> None:
    for field in fields:
        if field not in entry:
            errors.append(f"{label}: missing '{field}'")


def main() -> int:
    manifest = load(DATA / "manifest.json")
    if not isinstance(manifest, dict):
        print("manifest.json is missing or unreadable")
        return 1

    check(manifest.get("dataset") == "manifest", "manifest: dataset must be 'manifest'")
    check(bool(manifest.get("generatedAt")), "manifest: generatedAt is empty")
    check(isinstance(manifest.get("source"), list), "manifest: source must be an array")
    gaps = manifest.get("gaps") or []
    check(isinstance(gaps, list), "manifest: gaps must be an array")
    gap_keys = {
        (gap.get("dataset"), gap.get("branch"), gap.get("semester"), gap.get("code"))
        for gap in gaps
        if isinstance(gap, dict)
    }

    entries = manifest.get("datasets") or []
    check(isinstance(entries, list) and bool(entries), "manifest: datasets is empty")
    listed_paths: set[str] = set()
    counts: dict[str, Any] = {}

    branch_doc = None
    subject_counts: dict[str, int] = {}
    subject_units: dict[str, int] = {}
    subject_topics: dict[str, int] = {}
    subject_stubs: dict[str, int] = {}
    all_subject_ids: list[str] = []
    all_unit_ids: list[str] = []
    all_topic_ids: list[str] = []
    all_subject_sources: set[str] = set()
    empty_topics = 0
    missing_codes = 0
    missing_credits = 0

    for entry in entries:
        if not isinstance(entry, dict):
            errors.append("manifest: dataset entry is not an object")
            continue
        required(entry, ("dataset", "path", "count", "generatedAt", "source"), "manifest dataset")
        path = DATA / str(entry.get("path", ""))
        listed_paths.add(path.name)
        if not check(path.is_file(), f"manifest: missing file {path.name}"):
            continue
        doc = load(path)
        if not isinstance(doc, dict):
            continue

        dataset = entry.get("dataset")
        if dataset == "branches":
            branch_doc = doc
            branches = doc.get("branches") or []
            counts["branches"] = len(branches)
            check(entry["count"] == len(branches), f"{path.name}: count {entry['count']} != {len(branches)}")
            codes = [str(branch.get("code")) for branch in branches]
            check(not unique(codes), f"{path.name}: duplicate branch code")
            for branch in branches:
                required(branch, ("code", "name", "semesters", "syllabusSemesters"), "branches entry")
                check(set(branch.get("semesters") or []) == SEMESTERS, f"{path.name}: {branch.get('code')} semesters")
                check(
                    set(branch.get("syllabusSemesters") or []) <= SEMESTERS,
                    f"{path.name}: {branch.get('code')} invalid syllabus semester",
                )

        elif dataset == "subjects":
            branch = str(entry.get("branch"))
            subjects = doc.get("subjects") or []
            counts[f"subjects:{branch}"] = len(subjects)
            check(entry["count"] == len(subjects), f"{path.name}: count {entry['count']} != {len(subjects)}")
            check(doc.get("branch") == branch, f"{path.name}: branch mismatch")

            subject_ids = []
            units = topics = stubs = 0
            for subject in subjects:
                required(
                    subject,
                    ("id", "semester", "code", "name", "type", "credits", "source", "confidence", "units"),
                    path.name,
                )
                subject_id = str(subject.get("id", ""))
                subject_ids.append(subject_id)
                all_subject_ids.append(subject_id)
                check(bool(subject.get("name")), f"{path.name}: {subject_id} has empty name")
                check(subject.get("semester") in SEMESTERS, f"{path.name}: {subject_id} bad semester")
                if subject.get("stub"):
                    check(subject.get("units") == [], f"{path.name}: {subject_id} stub must have empty units")
                else:
                    check(bool(subject.get("units")), f"{path.name}: {subject_id} has no units")
                if subject.get("code") in ("", "-", None):
                    missing_codes += 1
                if subject.get("credits") in (None, ""):
                    missing_credits += 1

                source = str(subject.get("source", ""))
                if source:
                    all_subject_sources.add(source)
                    check((ROOT / source).is_file(), f"{path.name}: {subject_id} source missing: {source}")

                confidence = subject.get("confidence")
                check(
                    confidence in {"high", "medium", "none"},
                    f"{path.name}: {subject_id} bad confidence",
                )
                if confidence == "none":
                    stubs += 1
                    check(subject.get("stub") is True, f"{path.name}: {subject_id} missing stub flag")
                    check(
                        subject.get("units") == [],
                        f"{path.name}: {subject_id} stub units must be empty",
                    )

                non_empty = 0
                for unit in subject.get("units") or []:
                    units += 1
                    required(unit, ("id", "number", "title", "topics"), f"{path.name}:{subject_id} unit")
                    unit_id = str(unit.get("id", ""))
                    all_unit_ids.append(unit_id)
                    check(
                        unit_id.startswith(f"{subject_id}-u"),
                        f"{path.name}: {subject_id} unit id {unit_id}",
                    )
                    unit_topics = unit.get("topics") or []
                    check(bool(unit_topics), f"{path.name}: {subject_id} unit {unit_id} has no topics")
                    for topic in unit_topics:
                        topics += 1
                        required(topic, ("id", "title", "text"), f"{path.name}:{unit_id} topic")
                        topic_id = str(topic.get("id", ""))
                        all_topic_ids.append(topic_id)
                        check(
                            topic_id.startswith(f"{unit_id}-t"),
                            f"{path.name}: {unit_id} topic id {topic_id}",
                        )
                        check(bool(topic.get("title")), f"{path.name}: {topic_id} empty title")
                        if str(topic.get("text", "")).strip():
                            non_empty += 1
                        elif not topic.get("stub"):
                            empty_topics += 1
                if not subject.get("stub"):
                    check(non_empty > 0, f"{path.name}: {subject_id} has no text at all")

            check(not unique(subject_ids), f"{path.name}: duplicate subject id")
            subject_counts[branch] = len(subjects)
            subject_units[branch] = units
            subject_topics[branch] = topics
            subject_stubs[branch] = stubs

        elif dataset == "gate":
            papers = doc.get("papers") or []
            counts["gate_papers"] = len(papers)
            check(entry["count"] == len(papers), f"{path.name}: count {entry['count']} != {len(papers)}")
            paper_codes = [str(paper.get("code")) for paper in papers]
            check(not unique(paper_codes), f"{path.name}: duplicate paper code")
            sections = topics = 0
            for paper in papers:
                required(paper, ("code", "name", "sections", "confidence"), f"{path.name} paper")
                code = str(paper.get("code"))
                paper_sections = paper.get("sections") or []
                sections += len(paper_sections)
                if not paper_sections:
                    check(
                        ("gate", None, None, code) in gap_keys,
                        f"{path.name}: empty paper {code} has no documented gap",
                    )
                    continue
                section_ids = []
                for section in paper_sections:
                    required(section, ("id", "number", "title", "topics"), f"{path.name}:{code} section")
                    section_id = str(section.get("id", ""))
                    section_ids.append(section_id)
                    check(
                        section_id.startswith(f"gate-{code.lower()}-s"),
                        f"{path.name}: {code} bad section id {section_id}",
                    )
                    check(bool(section.get("title")), f"{path.name}: {section_id} empty title")
                    check(bool(section.get("topics")), f"{path.name}: {section_id} has no topics")
                    for topic in section.get("topics") or []:
                        topics += 1
                        required(topic, ("id", "title", "text"), f"{path.name}:{section_id} topic")
                        all_topic_ids.append(str(topic.get("id", "")))
                        check(bool(topic.get("title")), f"{path.name}: {section_id} empty topic title")
                check(not unique(section_ids), f"{path.name}: {code} duplicate section id")
            counts["gate_sections"] = sections
            counts["gate_topics"] = topics
            check(doc.get("paperCount") == len(papers), f"{path.name}: paperCount mismatch")
            check(doc.get("sectionCount") == sections, f"{path.name}: sectionCount mismatch")
            check(doc.get("topicCount") == topics, f"{path.name}: topicCount mismatch")

        elif dataset == "holidays":
            holidays = doc.get("holidays") or []
            counts["holidays"] = len(holidays)
            check(entry["count"] == len(holidays), f"{path.name}: count {entry['count']} != {len(holidays)}")
            ids = [str(item.get("id")) for item in holidays]
            check(not unique(ids), f"{path.name}: duplicate holiday id")
            previous = ""
            for item in holidays:
                required(item, ("id", "name", "start", "category", "source", "confidence"), "holiday")
                try:
                    start = date.fromisoformat(str(item.get("start")))
                except ValueError:
                    errors.append(f"{path.name}: holiday {item.get('id')} bad start date")
                    continue
                check(start.year == doc.get("year"), f"{path.name}: holiday {item.get('id')} wrong year")
                check(str(item.get("start")) >= previous, f"{path.name}: holidays not date-sorted")
                previous = str(item.get("start"))
                if item.get("end"):
                    try:
                        end = date.fromisoformat(str(item["end"]))
                    except ValueError:
                        errors.append(f"{path.name}: holiday {item.get('id')} bad end date")
                        continue
                    check(end >= start, f"{path.name}: holiday {item.get('id')} end before start")

        elif dataset == "grading":
            scale = doc.get("scale") or []
            counts["grading_scale"] = len(scale)
            check(entry["count"] == len(scale), f"{path.name}: count {entry['count']} != {len(scale)}")
            check(len(scale) == 7, f"{path.name}: expected 7 grades")
            check([item.get("points") for item in scale] == [10, 9, 8, 7, 6, 5, 0], f"{path.name}: grade points")
            check(doc.get("maxGpa") == 10, f"{path.name}: maxGpa")
            check(doc.get("marks", {}).get("100") == {"ia": 30, "ese": 70}, f"{path.name}: 100-mark split")
            check(doc.get("marks", {}).get("50") == {"ia": 20, "ese": 30}, f"{path.name}: 50-mark split")
            pass_ese = doc.get("pass", {}).get("eseMinByTotal") or []
            check(
                [(item.get("total"), item.get("eseMin")) for item in pass_ese]
                == [(100, 24.5), (50, 10.5)],
                f"{path.name}: ESE pass minimums",
            )

        elif dataset == "colleges":
            colleges = doc.get("colleges") or []
            counts["colleges"] = len(colleges)
            check(entry["count"] == len(colleges), f"{path.name}: count {entry['count']} != {len(colleges)}")
            college_codes = [str(college.get("code")) for college in colleges]
            check(not unique(college_codes), f"{path.name}: duplicate college code")
            pairs = 0
            for college in colleges:
                required(college, ("code", "name", "source", "branches"), "college")
                check(bool(college.get("branches")), f"{path.name}: college {college.get('code')} has no branches")
                branch_codes = []
                for branch in college.get("branches") or []:
                    pairs += 1
                    required(branch, ("code", "name", "slug", "confidence", "batches"), "college branch")
                    branch_codes.append(str(branch.get("code")))
                    check(bool(branch.get("batches")), f"{path.name}: {college.get('code')}/{branch.get('code')}")
                    for batch, semesters in (branch.get("batches") or {}).items():
                        check(str(batch).isdigit(), f"{path.name}: bad batch {batch}")
                        check(
                            bool(semesters) and set(semesters) <= SEMESTERS,
                            f"{path.name}: {college.get('code')}/{branch.get('code')}/{batch} semesters",
                        )
                        check(
                            list(semesters) == sorted(set(semesters)),
                            f"{path.name}: {college.get('code')}/{branch.get('code')}/{batch} unsorted",
                        )
                check(not unique(branch_codes), f"{path.name}: {college.get('code')} duplicate branch")
            check(doc.get("batches") == sorted(doc.get("batches") or []), f"{path.name}: batches unsorted")
            counts["college_branches"] = pairs
            counts["batches"] = len(doc.get("batches") or [])

        else:
            errors.append(f"manifest: unknown dataset '{dataset}'")
            continue

        rows.append((f"{dataset}:{entry.get('branch')}" if entry.get("branch") else dataset, entry["count"], "ok"))

    # Global id checks across all per-branch subject files.
    check(not unique(all_subject_ids), "subjects: duplicate subject id across branches")
    check(not unique(all_unit_ids), "subjects: duplicate unit id across branches")
    check(not unique(all_topic_ids), "subjects: duplicate topic id across branches")
    for source in sorted(all_subject_sources):
        check((ROOT / source).is_file(), f"subjects: missing source {source}")

    # Manifest totals must match what was actually emitted.
    expected = {
        "branches": counts.get("branches", 0),
        "semestersInCourse": 48,
        "semestersWithSyllabus": sum(
            len(branch.get("syllabusSemesters") or []) for branch in (branch_doc or {}).get("branches", [])
        ),
        "subjects": sum(subject_counts.values()),
        "units": sum(subject_units.values()),
        "topics": sum(subject_topics.values()),
        "subjectStubs": sum(subject_stubs.values()),
        "gatePapers": counts.get("gate_papers", 0),
        "gateSections": counts.get("gate_sections", 0),
        "gateTopics": counts.get("gate_topics", 0),
        "holidays": counts.get("holidays", 0),
        "colleges": counts.get("colleges", 0),
        "collegeBranches": counts.get("college_branches", 0),
        "batches": counts.get("batches", 0),
    }
    totals = manifest.get("totals") or {}
    for key, value in expected.items():
        check(totals.get(key) == value, f"manifest totals: {key} {totals.get(key)} != {value}")

    # Every branch summary must agree with its subject file.
    for branch in (branch_doc or {}).get("branches", []):
        code = str(branch.get("code"))
        check(branch.get("subjectCount") == subject_counts.get(code), f"branches: {code} subjectCount")
        check(branch.get("unitCount") == subject_units.get(code), f"branches: {code} unitCount")
        check(branch.get("topicCount") == subject_topics.get(code), f"branches: {code} topicCount")
        check(branch.get("stubCount") == subject_stubs.get(code), f"branches: {code} stubCount")

    # No stray generated files.
    on_disk = {path.name for path in DATA.glob("*.json")}
    expected_files = listed_paths | {"manifest.json"}
    check(not (on_disk - expected_files), f"data: unexpected files {sorted(on_disk - expected_files)}")
    check(not (expected_files - on_disk), f"data: missing files {sorted(expected_files - on_disk)}")

    documented_gaps = Counter(gap.get("dataset") for gap in gaps if isinstance(gap, dict))
    if empty_topics:
        warnings.append(f"{empty_topics} topics are heading-only (empty text) in the source")
    if missing_codes:
        warnings.append(f"{missing_codes} subjects have no code in the source")
    if missing_credits:
        warnings.append(f"{missing_credits} subjects have no credits in the source")
    print(f"{'dataset':<22}{'entries':>8}  status")
    print(f"{'-' * 22}{'-' * 8}  {'-' * 6}")
    for label, count, status in rows:
        print(f"{label:<22}{count:>8}  {status}")
    print(f"{'-' * 22}{'-' * 8}  {'-' * 6}")
    print(f"{'TOTAL':<22}{sum(count for _, count, _ in rows):>8}")
    print()
    print(
        f"subjects: {expected['subjects']} · units: {expected['units']} · topics: {expected['topics']} · "
        f"stubs: {expected['subjectStubs']}"
    )
    print(
        f"GATE: {expected['gatePapers']} papers · {expected['gateSections']} sections · "
        f"{expected['gateTopics']} topics (8 empty papers documented)"
    )
    print(
        f"holidays: {expected['holidays']} · grading grades: {counts.get('grading_scale', 0)} · "
        f"colleges: {expected['colleges']} · college-branches: {expected['collegeBranches']}"
    )
    print(
        f"quality: {missing_codes} subjects without a source code · {missing_credits} without credits · "
        f"{empty_topics} heading-only topics"
    )
    print(
        "gaps: "
        + ", ".join(f"{name} {count}" for name, count in sorted(documented_gaps.items(), key=lambda item: str(item[0])))
    )
    print()

    if warnings:
        print(f"{len(warnings)} warning(s)")
        for warning in warnings:
            print(f"  ! {warning}")
    if errors:
        print(f"FAILED: {len(errors)} error(s)")
        for error in errors:
            print(f"  x {error}")
        return 1
    print("OK: all checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
