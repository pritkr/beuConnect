#!/usr/bin/env python3
"""Build the GECS student roster from the college register dump.

Source (read-only, never touched by this script):

    ~/gecs-cli/dumps/20261026_031340/students_basic_details.csv

Outputs:

    native/assets/data/students-gecs.json        canonical roster (the app reads this)
    native/assets/data/manifest.json             one "students" dataset entry + totals.students
    src/data/students/gecs-<branch>.csv          site CSVs, 4-column contract + extra columns
    src/data/students/gecsheikhpura<branch>.csv  legacy 4-column files kept for old consumers

Python 3 standard library only.  Run from anywhere:

    uv run python native/scripts/build-students-data.py
    uv run python native/scripts/build-students-data.py --check
    uv run python native/scripts/build-students-data.py --source /path/to/students_basic_details.csv

`extract.py` rewrites ``manifest.json`` and does not know about students, so run
this script *after* it:

    uv run python native/scripts/extract.py
    uv run python native/scripts/build-students-data.py

See ``native/docs/STUDENTS_DATA.md`` for the shape and the field rules.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import sys
from collections import Counter
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "native" / "assets" / "data"
SITE_CSV = ROOT / "src" / "data" / "students"
JSON_NAME = "students-gecs.json"
DEFAULT_SOURCE = (
    Path.home() / "gecs-cli" / "dumps" / "20261026_031340" / "students_basic_details.csv"
)
SOURCE_LABEL = "gecs-cli/dumps/20261026_031340/students_basic_details.csv"

# Batch -> session.  2K22 == 2022-26 … 2K26 == 2026-30.
SESSION_BY_BATCH = {
    "2K22": "2022-26",
    "2K23": "2023-27",
    "2K24": "2024-28",
    "2K25": "2025-29",
    "2K26": "2026-30",
}

# Register spellings -> app/site branch slugs.  `MET` is its own programme
# (Mechatronics Engineering, BEU branch code 161); it is deliberately *not*
# folded into `mech` or `eee`.
REGISTER_BRANCHES = {
    "CE": "civil",
    "CSE": "cse",
    "CSE-A": "cse",
    "CSE-B": "cse",
    "EE": "ee",
    "ECE": "ece",
    "ME": "mech",
    "MET": "met",
}

# Display / serialisation order.  CSE first, then the departments by intake.
BRANCHES: list[dict[str, str]] = [
    {"slug": "cse", "label": "Computer Science & Engineering", "short": "CSE"},
    {"slug": "ece", "label": "Electronics & Communication Engineering", "short": "ECE"},
    {"slug": "ee", "label": "Electrical Engineering", "short": "EE"},
    {"slug": "mech", "label": "Mechanical Engineering", "short": "MECH"},
    {"slug": "civil", "label": "Civil Engineering", "short": "CIVIL"},
    {"slug": "met", "label": "Mechatronics Engineering", "short": "MET"},
]
BRANCH_BY_SLUG = {branch["slug"]: branch for branch in BRANCHES}
BRANCH_ORDER = {branch["slug"]: index for index, branch in enumerate(BRANCHES)}

# Legacy file names that already exist on the site.  Kept so nothing that
# imports them breaks; the content is regenerated from the same records.
LEGACY_CSV = {
    "civil": "gecsheikhpuracivil.csv",
    "cse": "gecsheikhpuracse.csv",
    "ece": "gecsheikhpuraece.csv",
    "ee": "gecsheikhpuraee.csv",
    "mech": "gecsheikhpuramech.csv",
    "met": "gecsheikhpuramet.csv",
}

RICH_COLUMNS = [
    "Session",
    "Sno",
    "RegNo",
    "Name",
    "RollNo",
    "Section",
    "Hosteller",
    "Batch",
    "Branch",
    "Provisional",
]
LEGACY_COLUMNS = ["Session", "Sno", "RegNo", "Name"]

# ---------------------------------------------------------------- utilities


def tidy(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def natural(value: str) -> list[tuple[int, Any]]:
    """Sort `26CSE9` before `26CSE10` and `23CV32` after `23CV9`."""
    return [
        (0, int(part)) if part.isdigit() else (1, part.lower())
        for part in re.split(r"(\d+)", value or "")
        if part
    ]


def phone(value: str | None) -> str:
    digits = re.sub(r"\D", "", value or "")
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    return digits


def iso_date(value: str | None) -> str:
    text = tidy(value)
    if not text:
        return ""
    try:
        date.fromisoformat(text)
    except ValueError:
        return ""
    return text


def put(record: dict[str, Any], key: str, value: Any) -> None:
    """Omit empty values instead of writing "" (keeps the bundle small)."""
    if value is None or value == "":
        return
    record[key] = value


def read_source(path: Path) -> list[dict[str, str]]:
    if not path.is_file():
        raise FileNotFoundError(
            f"source dump not found: {path}\n"
            "Pass --source /path/to/students_basic_details.csv"
        )
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def build_records(rows: Iterable[dict[str, str]]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    problems: list[str] = []
    for row in rows:
        register_branch = tidy(row.get("branch")).upper()
        batch = tidy(row.get("batch")).upper()
        branch = REGISTER_BRANCHES.get(register_branch)
        if branch is None:
            problems.append(f"unknown branch {register_branch!r} (id {row.get('id')})")
            continue
        session = SESSION_BY_BATCH.get(batch)
        if session is None:
            problems.append(f"unknown batch {batch!r} (id {row.get('id')})")
            continue

        name = tidy(row.get("name"))
        if not name:
            problems.append(f"empty name (id {row.get('id')})")
            continue
        roll_no = tidy(row.get("roll_no")).upper()
        reg_no = tidy(row.get("registration_no")).upper()
        if not roll_no or not reg_no:
            problems.append(f"missing roll/reg (id {row.get('id')})")
            continue

        # 2K26 was admitted before BEU issued registration numbers: the register
        # stores the roll number in `registration_no`.  Flag it, never present it
        # as an official registration number.
        provisional = roll_no == reg_no
        section = ""
        if register_branch in {"CSE-A", "CSE-B"}:
            section = register_branch[-1]

        branch_meta = BRANCH_BY_SLUG[branch]
        hosteller = tidy(row.get("is_hosteller")).lower() == "true"
        record: dict[str, Any] = {
            "id": int(row["id"]) if tidy(row.get("id")).isdigit() else tidy(row.get("id")),
            "name": name,
            "rollNo": roll_no,
            "regNo": reg_no,
            "provisionalReg": provisional,
            "batch": batch,
            "session": session,
            "branch": branch,
            "branchLabel": branch_meta["label"],
        }
        put(record, "section", section)
        put(record, "gender", tidy(row.get("gender")))
        put(record, "dob", iso_date(row.get("date_of_birth")))
        put(record, "guardian", tidy(row.get("guardian_name")))
        put(record, "guardianPhone", phone(row.get("guardian_mobile_no")))
        put(record, "phone", phone(row.get("mobile_no")))
        put(record, "email", tidy(row.get("email_id")).lower())
        record["hosteller"] = hosteller
        put(record, "category", tidy(row.get("category")))
        put(record, "admissionType", tidy(row.get("admission_type")))
        put(record, "status", tidy(row.get("status")))
        records.append(record)

    if problems:
        raise ValueError("source rows rejected:\n  " + "\n  ".join(problems[:20]))

    ids = [record["id"] for record in records]
    duplicates = [value for value, count in Counter(ids).items() if count > 1]
    if duplicates:
        raise ValueError(f"duplicate source ids: {duplicates[:10]}")

    records.sort(
        key=lambda record: (
            -int(record["batch"][2:]),
            BRANCH_ORDER[record["branch"]],
            record.get("section", ""),
            natural(record["regNo"]),
            record["name"].upper(),
        )
    )
    return records


# ---------------------------------------------------------------- writers


def records_by_branch(records: Iterable[dict[str, Any]], slug: str) -> list[dict[str, Any]]:
    return [record for record in records if record["branch"] == slug]


def csv_text(records: list[dict[str, Any]], columns: list[str]) -> str:
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=columns, lineterminator="\n")
    writer.writeheader()
    sno = 0
    session = None
    for record in records:
        if record["session"] != session:
            session = record["session"]
            sno = 0
        sno += 1
        row = {
            "Session": record["session"],
            "Sno": sno,
            "RegNo": record["regNo"],
            "Name": record["name"],
            "RollNo": record["rollNo"],
            "Section": record.get("section", ""),
            "Hosteller": "Yes" if record.get("hosteller") else "No",
            "Batch": record["batch"],
            "Branch": record["branch"],
            "Provisional": "yes" if record["provisionalReg"] else "",
        }
        writer.writerow({column: row[column] for column in columns})
    return buffer.getvalue()


def write_json_array(path: Path, records: list[dict[str, Any]]) -> None:
    """One record per line: compact, and every change is one diff line."""
    lines = [json.dumps(record, ensure_ascii=False, separators=(",", ":")) for record in records]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("[\n" + ",\n".join(lines) + "\n]\n", encoding="utf-8")


def stamp() -> str:
    epoch = os.environ.get("SOURCE_DATE_EPOCH")
    if epoch and epoch.isdigit():
        moment = datetime.fromtimestamp(int(epoch), timezone.utc)
    else:
        moment = datetime.now(timezone.utc)
    return moment.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def summary(records: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "total": len(records),
        "batches": dict(Counter(record["batch"] for record in records)),
        "branches": dict(Counter(record["branch"] for record in records)),
        "provisional": sum(1 for record in records if record["provisionalReg"]),
    }


def update_manifest(records: list[dict[str, Any]], generated: str) -> dict[str, Any]:
    path = DATA / "manifest.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    stats = summary(records)
    entry = {
        "dataset": "students",
        "college": "157",
        "collegeName": "Government Engineering College, Sheikhpura",
        "path": JSON_NAME,
        "count": stats["total"],
        "generatedAt": generated,
        "source": SOURCE_LABEL,
        "batches": stats["batches"],
        "branches": stats["branches"],
        "provisionalRegistrations": stats["provisional"],
    }
    datasets = [
        dataset
        for dataset in manifest.get("datasets", [])
        if not (dataset.get("dataset") == "students" and dataset.get("path") == JSON_NAME)
    ]
    datasets.append(entry)
    manifest["datasets"] = datasets
    manifest.setdefault("totals", {})["students"] = stats["total"]
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return entry


def write_all(records: list[dict[str, Any]]) -> None:
    write_json_array(DATA / JSON_NAME, records)
    update_manifest(records, stamp())

    SITE_CSV.mkdir(parents=True, exist_ok=True)
    for branch in BRANCHES:
        slug = branch["slug"]
        rows = records_by_branch(records, slug)
        (SITE_CSV / f"gecs-{slug}.csv").write_text(
            csv_text(rows, RICH_COLUMNS), encoding="utf-8"
        )
        (SITE_CSV / LEGACY_CSV[slug]).write_text(
            csv_text(rows, LEGACY_COLUMNS), encoding="utf-8"
        )


# ---------------------------------------------------------------- check


def check(records: list[dict[str, Any]]) -> int:
    errors: list[str] = []
    path = DATA / JSON_NAME
    if not path.is_file():
        print(f"FAILED: {path.relative_to(ROOT)} is missing")
        return 1
    stored = json.loads(path.read_text(encoding="utf-8"))
    if stored != records:
        errors.append("students-gecs.json does not match the source dump")

    stats = summary(records)
    expected_batches = {
        "2K26": 334,
        "2K25": 294,
        "2K24": 359,
        "2K23": 183,
        "2K22": 153,
    }
    expected_branches = {
        "cse": 478,
        "ece": 193,
        "ee": 239,
        "mech": 79,
        "civil": 290,
        "met": 44,
    }
    for batch, count in expected_batches.items():
        if stats["batches"].get(batch) != count:
            errors.append(f"batch {batch}: {stats['batches'].get(batch)} != {count}")
    for branch, count in expected_branches.items():
        if stats["branches"].get(branch) != count:
            errors.append(f"branch {branch}: {stats['branches'].get(branch)} != {count}")
    if stats["total"] != 1323:
        errors.append(f"total: {stats['total']} != 1323")
    if stats["provisional"] != 334:
        errors.append(f"provisional registrations: {stats['provisional']} != 334")

    manifest = json.loads((DATA / "manifest.json").read_text(encoding="utf-8"))
    entry = next(
        (
            item
            for item in manifest.get("datasets", [])
            if item.get("dataset") == "students" and item.get("path") == JSON_NAME
        ),
        None,
    )
    if entry is None:
        errors.append('manifest.json has no "students" dataset entry (run this script after extract.py)')
    elif entry.get("count") != stats["total"]:
        errors.append(f"manifest students count: {entry.get('count')} != {stats['total']}")

    for branch in BRANCHES:
        slug = branch["slug"]
        for name, columns in (
            (f"gecs-{slug}.csv", RICH_COLUMNS),
            (LEGACY_CSV[slug], LEGACY_COLUMNS),
        ):
            file = SITE_CSV / name
            if not file.is_file():
                errors.append(f"missing {file.relative_to(ROOT)}")
                continue
            if file.read_text(encoding="utf-8") != csv_text(records_by_branch(records, slug), columns):
                errors.append(f"{file.relative_to(ROOT)} does not match the roster")

    print(f"{'batch':<8}{'students':>10}")
    for batch in sorted(stats["batches"], key=lambda value: -int(value[2:])):
        print(f"{batch:<8}{stats['batches'][batch]:>10}")
    print(f"{'total':<8}{stats['total']:>10}")
    print()
    print(f"{'branch':<10}{'students':>10}")
    for branch in BRANCHES:
        print(f"{branch['slug']:<10}{stats['branches'].get(branch['slug'], 0):>10}")
    print()
    print(f"provisional registrations: {stats['provisional']}")

    if errors:
        print(f"\nFAILED: {len(errors)} error(s)")
        for error in errors:
            print(f"  x {error}")
        return 1
    print("\nOK: 1323 students · 334 in 2K26 · all counts match the source")
    return 0


# ---------------------------------------------------------------- main


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--source",
        type=Path,
        default=Path(os.environ.get("GECS_STUDENTS_CSV", DEFAULT_SOURCE)),
        help=f"students_basic_details.csv (default: {DEFAULT_SOURCE})",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="verify the committed files against the source instead of writing",
    )
    args = parser.parse_args(argv)

    try:
        rows = read_source(args.source)
        records = build_records(rows)
    except (OSError, ValueError) as error:
        print(f"FAILED: {error}")
        return 1

    if args.check:
        return check(records)

    write_all(records)
    stats = summary(records)
    print(f"Wrote {JSON_NAME}: {stats['total']} students")
    print(f"Batches: {stats['batches']}")
    print(f"Branches: {stats['branches']}")
    print(f"Provisional registrations: {stats['provisional']}")
    print(f"Site CSVs: {len(BRANCHES) * 2} files in src/data/students/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
