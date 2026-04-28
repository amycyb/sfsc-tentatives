#!/usr/bin/env python3
"""Regenerate README.md from tentatives.parquet — one collapsible section per department."""

import re
import pandas as pd
from datetime import date, timedelta
from pathlib import Path

HERE   = Path(__file__).parent
README = HERE / 'README.md'

DEPT_NAMES = {
    '302': 'Department 302 — Civil Law & Motion',
}

STATIC_TOP = """\
# SFSC Tentative Rulings

Tentative rulings from the San Francisco Superior Court, archived by department.

**[Browse the data →](https://aimesy.github.io/sfsc-tentatives/)**

---

## Repository layout

| Path | Description |
|------|-------------|
| `tentatives.parquet` | Canonical dataset (all departments) |
| `raw/dept<N>/` | Raw JSON exports per department |
| `extension/` | Chrome extension source |
| `sfsc-extension.zip` | Installable extension package |
| `ingest.py` | Ingests raw JSON into the parquet |
| `index.html` | Data browser (served via GitHub Pages) |

## Browser extension

The extension scrapes the [SFSC tentative rulings page](https://webapps.sftc.org/tr/tr.dll) and commits results directly to this repository.

### Install

1. Download `sfsc-extension.zip` and unzip it.
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, select the unzipped folder.
3. Open the extension popup → **Settings** → enter your GitHub PAT (needs `Contents: write`) and save.

### Use

- **Single day:** navigate to the rulings page, run a search, then click **Send to GitHub**.
- **Bulk scrape:** enter a date range and click **Bulk Scrape Range**. The extension iterates every weekday, commits each date automatically.
- **Stop:** click **Stop** to halt after the current date finishes; nothing in-flight is lost.
- **Updates:** click **📦 Check for updates** to auto-download the latest `sfsc-extension.zip`.

## Ingest pipeline

New JSON files pushed to `raw/dept<N>/` trigger the GitHub Actions workflow (`.github/workflows/ingest.yml`), which runs `ingest.py` to merge them into `tentatives.parquet`.

To ingest locally:

```bash
pip install pandas pyarrow openpyxl
python ingest.py raw/dept302/2026-04-28-120000.json
```

## Maintaining this README

Run `update-readme.py` to refresh the department sections with current stats:

```bash
pip install pandas pyarrow
python update-readme.py
```

---

"""

def missing_weekdays(min_date: str, max_date: str, checked: set) -> list[str]:
    d   = date.fromisoformat(min_date)
    end = date.fromisoformat(max_date)
    out = []
    while d <= end:
        if d.weekday() < 5 and d.isoformat() not in checked:
            out.append(d.isoformat())
        d += timedelta(days=1)
    return out

def format_missing(dates: list[str]) -> str:
    if not dates:
        return '_None — all weekdays in range are accounted for._'
    chunks = [dates[i:i+12] for i in range(0, len(dates), 12)]
    return '\n\n'.join(', '.join(c) for c in chunks)

def dept_section(dept: str, df_dept: pd.DataFrame) -> str:
    name   = DEPT_NAMES.get(dept, f'Department {dept}')
    count  = len(df_dept)
    dates  = sorted(df_dept['court_date'].unique())
    min_d  = dates[0]
    max_d  = dates[-1]
    checked = set(dates)

    missing = missing_weekdays(min_d, max_d, checked)
    n_miss  = len(missing)

    summary = f'**{name}** &nbsp;·&nbsp; {count:,} rulings &nbsp;·&nbsp; {min_d} → {max_d} &nbsp;·&nbsp; {n_miss} missing weekdays'

    body = f"""\

{count:,} tentative rulings from {min_d} to {max_d}.
Civil law and motion calendar; missing dates are court holidays or non-hearing days.

### Missing dates ({n_miss})

{format_missing(missing)}

"""

    return f'<details>\n<summary>{summary}</summary>\n{body}</details>\n'

def main():
    if not (HERE / 'tentatives.parquet').exists():
        print('tentatives.parquet not found'); return

    df = pd.read_parquet(HERE / 'tentatives.parquet')
    df['court_date'] = pd.to_datetime(df['court_date']).dt.date.astype(str)

    sections = ''
    for dept in sorted(df['department'].unique()):
        sections += dept_section(dept, df[df['department'] == dept])

    content = STATIC_TOP + '## Departments\n\n' + sections
    README.write_text(content)
    print(f'Updated README.md — {len(df["department"].unique())} department(s)')

if __name__ == '__main__':
    main()
