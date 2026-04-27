#!/usr/bin/env python3
"""
Ingest tentative rulings into tentatives.db.

Usage:
    python ingest.py                         # ingest both source files (initial setup)
    python ingest.py path/to/new.xlsx        # append new xlsx export
    python ingest.py path/to/new.json        # append new json export

Schema normalizes both historical (2014-2018) and current (2020+) formats.
Duplicate detection is based on (case_number, court_date, ruling) hash.
"""

import sys
import json
import sqlite3
import hashlib
from pathlib import Path
from datetime import datetime, date, time

try:
    import openpyxl
except ImportError:
    sys.exit("Missing dependency: pip install openpyxl")

DB_PATH = Path(__file__).parent / "tentatives.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS tentatives (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    case_number     TEXT,
    case_title      TEXT,
    court_date      DATE,
    hearing_time    TEXT,
    calendar_matter TEXT,
    judge           TEXT,
    ruling          TEXT,
    row_hash        TEXT UNIQUE,
    inserted_at     TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_case_number ON tentatives(case_number);
CREATE INDEX IF NOT EXISTS idx_court_date  ON tentatives(court_date);
CREATE INDEX IF NOT EXISTS idx_judge       ON tentatives(judge);
"""

def make_hash(case_number, court_date, ruling):
    key = f"{case_number}|{court_date}|{ruling}"
    return hashlib.sha1(key.encode()).hexdigest()

def normalize_date(val):
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.date().isoformat()
    if isinstance(val, date):
        return val.isoformat()
    if isinstance(val, str):
        for fmt in ("%b-%d-%Y %I:%M %p", "%Y-%m-%d", "%m/%d/%Y"):
            try:
                return datetime.strptime(val.strip(), fmt).date().isoformat()
            except ValueError:
                continue
        try:
            return datetime.strptime(val.strip().split()[0], "%b-%d-%Y").date().isoformat()
        except ValueError:
            return val
    return str(val)

def normalize_time(val):
    if val is None:
        return None
    if isinstance(val, time):
        return val.strftime("%H:%M")
    if isinstance(val, datetime):
        return val.strftime("%H:%M")
    return str(val)

def ingest_rows(conn, rows, source_label):
    cur = conn.cursor()
    inserted = skipped = 0
    for row in rows:
        h = make_hash(row["case_number"] or "", row["court_date"] or "", row["ruling"] or "")
        try:
            cur.execute(
                """INSERT INTO tentatives
                   (case_number, case_title, court_date, hearing_time, calendar_matter, judge, ruling, row_hash)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (row["case_number"], row["case_title"], row["court_date"],
                 row["hearing_time"], row["calendar_matter"], row["judge"],
                 row["ruling"], h),
            )
            inserted += 1
        except sqlite3.IntegrityError:
            skipped += 1
    conn.commit()
    print(f"  {source_label}: {inserted} inserted, {skipped} skipped (duplicates)")

def load_xlsm_2014_2018(path):
    wb = openpyxl.load_workbook(path, read_only=True, keep_vba=True)
    ws = wb.active
    rows = []
    for r in ws.iter_rows(min_row=2, values_only=True):
        case_number, case_title, court_date, calendar_matter, ruling = r[:5]
        if not any([case_number, ruling]):
            continue
        hearing_time = None
        if isinstance(court_date, datetime) and (court_date.hour or court_date.minute):
            hearing_time = court_date.strftime("%H:%M")
        rows.append({
            "case_number":     str(case_number).strip() if case_number else None,
            "case_title":      str(case_title).strip() if case_title else None,
            "court_date":      normalize_date(court_date),
            "hearing_time":    hearing_time,
            "calendar_matter": str(calendar_matter).strip() if calendar_matter else None,
            "judge":           None,
            "ruling":          str(ruling).strip() if ruling else None,
        })
    return rows

def load_xlsx_2020_plus(path):
    wb = openpyxl.load_workbook(path, read_only=True)
    ws = wb["tentatives"]
    rows = []
    for r in ws.iter_rows(min_row=2, values_only=True):
        case_number, case_title, court_date, hearing_time, calendar_matter, judge, ruling = r[:7]
        if not any([case_number, ruling]):
            continue
        rows.append({
            "case_number":     str(case_number).strip() if case_number else None,
            "case_title":      str(case_title).strip() if case_title else None,
            "court_date":      normalize_date(court_date),
            "hearing_time":    normalize_time(hearing_time),
            "calendar_matter": str(calendar_matter).strip() if calendar_matter else None,
            "judge":           str(judge).strip() if judge else None,
            "ruling":          str(ruling).strip() if ruling else None,
        })
    return rows

def load_json(path):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    rows = []
    for rec in data:
        court_date_raw = rec.get("Court Date", "")
        hearing_time = None
        parts = court_date_raw.strip().split()
        if len(parts) >= 3:
            try:
                t = datetime.strptime(f"{parts[1]} {parts[2]}", "%I:%M %p")
                hearing_time = t.strftime("%H:%M")
            except ValueError:
                pass
        rows.append({
            "case_number":     rec.get("Case Number", "").strip() or None,
            "case_title":      rec.get("Case Title", "").strip() or None,
            "court_date":      normalize_date(court_date_raw),
            "hearing_time":    hearing_time,
            "calendar_matter": rec.get("Calendar Matter", "").strip() or None,
            "judge":           None,
            "ruling":          rec.get("Rulings", "").strip() or None,
        })
    return rows

def setup_db(conn):
    conn.executescript(SCHEMA)
    conn.commit()

def main():
    conn = sqlite3.connect(DB_PATH)
    setup_db(conn)

    here = Path(__file__).parent

    if len(sys.argv) > 1:
        for arg in sys.argv[1:]:
            p = Path(arg)
            if not p.exists():
                print(f"File not found: {p}")
                continue
            suffix = p.suffix.lower()
            if suffix == ".json":
                rows = load_json(p)
                ingest_rows(conn, rows, p.name)
            elif suffix in (".xlsx", ".xlsm"):
                wb = openpyxl.load_workbook(p, read_only=True, keep_vba=(suffix == ".xlsm"))
                ws = wb.active
                headers = [c.value for c in next(ws.iter_rows(min_row=1, max_row=1))]
                wb.close()
                if "Judge" in headers or "Hearing Time" in headers:
                    rows = load_xlsx_2020_plus(p)
                else:
                    rows = load_xlsm_2014_2018(p)
                ingest_rows(conn, rows, p.name)
            else:
                print(f"Unsupported file type: {p}")
    else:
        xlsm = here / "tentatives.xlsm"
        xlsx = here / "sfsc tentatives 01-2020 to 07-2025.xlsx"

        if xlsm.exists():
            print("Loading 2014-2018 (xlsm)...")
            rows = load_xlsm_2014_2018(xlsm)
            ingest_rows(conn, rows, "tentatives.xlsm")
        else:
            print(f"Not found: {xlsm}")

        if xlsx.exists():
            print("Loading 2020-2024 (xlsx)...")
            rows = load_xlsx_2020_plus(xlsx)
            ingest_rows(conn, rows, xlsx.name)
        else:
            print(f"Not found: {xlsx}")

    cur = conn.cursor()
    cur.execute("SELECT COUNT(*), MIN(court_date), MAX(court_date) FROM tentatives")
    total, lo, hi = cur.fetchone()
    print(f"\nDatabase: {total} total rows, {lo} → {hi}")
    conn.close()

if __name__ == "__main__":
    main()
