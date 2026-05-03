#!/usr/bin/env python3
"""Regenerate README.md from tentatives.parquet — one collapsible section per department."""

import json
import pandas as pd
import holidays as hol
from datetime import date, timedelta
from pathlib import Path

HERE     = Path(__file__).parent
README   = HERE / 'README.md'
COVERAGE = HERE / 'coverage'
DATA_DIR = HERE / 'data'

DEPT_NAMES = {
    # Map each SFSC department number to its full name. Departments not in
    # this map fall back to the generic "Department <N>" label, so adding a
    # new dept never breaks anything — it just shows up un-named until you
    # extend this dict.
    '204': 'Department 204 — Probate',
    '301': 'Department 301 — Discovery',
    '302': 'Department 302 — Civil Law and Motion',
    '304': 'Department 304 — Asbestos Law and Motion / Discovery',
    '501': 'Department 501 — Real Property Court',
}

# Dept 304 hosts two sub-calendars on different days. The data browser
# merges them into a single Department 304 view, but the README's
# section-per-dept layout splits them so contributors can see each
# sub-calendar's gaps independently. Each tuple is
#   (calendar_kind, "<sub-folder name>", "Display name for the section").
DEPT_SUB_CALENDARS = {
    '304': [
        ('law-and-motion', 'law-and-motion', 'Department 304 — Asbestos Law and Motion'),
        ('discovery',      'discovery',      'Department 304 — Asbestos Discovery'),
    ],
}

# Per-dept floor: ignore parquet rows and raw-scrape dates older than this
# when computing coverage / gaps. Some departments simply didn't post
# tentatives online before a given date (Dept 301 came up on the SFTC
# tentatives page in mid-March 2024), so any earlier "data" is either a
# misclassified Asbestos-era ruling or an empty marker the bulk scraper
# laid down before the floor was enforced. Without the floor those
# stragglers manufacture a six-year "gap" in the dept summary that's
# misleading — there's nothing to fill.
DEPT_DATA_FLOORS = {
    '301': '2024-03-19',
}

STATIC_TOP = """\
# SFSC Tentative Rulings

A searchable archive of every **tentative ruling** posted by the San Francisco Superior Court. While tentative rulings are freely available at <https://sf.courts.ca.gov/online-services/tentative-rulings>, they can only be found by date and case number. This repo allows numerous data operations that are not possible under that limited format, as discussed below. Departments covered:

- Department 204 (Probate)
- Department 301 (Discovery)
- Department 302 (Civil Law and Motion)
- Department 304 (Asbestos Law and Motion + Asbestos Discovery)
- Department 501 (Real Property)

**[Open the searchable database →](https://aimesy.github.io/sfsc-tentatives/)**

## How to use the searchable database

Open <https://aimesy.github.io/sfsc-tentatives/>. The first time you visit, a **📥 Database Downloads** menu opens in the upper right; pick the department(s) you want to look at. Your selection is remembered, so the next visit auto-loads them.

Once data is loaded, you have a table you can:

- **Search** — type a case number, party name, or any phrase from the ruling text in the **Search** box.
- **Filter by date range** — set **From** and **To** to a window of hearing dates.
- **Filter by department, judge, or motion type** — use the dropdowns in the toolbar.
- **Add an arbitrary filter** — click **+ Filter** to build conditions like "Motion Type *is* Demurrer AND Outcome *is* Granted / Sustained AND Judge *contains* Karnow".
- **Filter a single column the way Excel does** — click the small **▾** filter icon in any column header to pick the values you want to keep (with a search box and Sort A→Z / Z→A buttons).
- **Sort** — click any column header.
- **See the full ruling** — click any row to open the ruling, the motion caption, the judge's full text, the contestation procedure block, and any remote-appearance instructions.
- **Export to CSV** — click **⬇ CSV** in the upper right to download whatever the current filters return. Opens in Excel or Google Sheets.
- **Charts** — click **📊 Charts** to add visualizations (rulings over time, top motion types, judges, outcome breakdowns, etc.). You can rearrange the panels by dragging them.
- **Tooltips** — toggle the **? Tips** button in the upper right to show short on-hover explanations of every interactive element.

Filters and the current page are saved in the URL, so you can bookmark or share a particular search.

## Browser extension (for contributors)

The browser extension at `sfsc-extension.zip` lets you load the SFSC tentative-rulings page in your browser, click a button, and add the day's rulings directly to the archive on GitHub. You only need this if you want to help fill in missing days or add new departments.

### Install (Chrome / Edge)

1. Download `sfsc-extension.zip` from this repository and unzip it.
2. Open `chrome://extensions`, turn on **Developer mode** (top right), click **Load unpacked**, and pick the unzipped folder.
3. Click the puzzle-piece icon → pin **SFSC Tentative Rulings** to the toolbar.
4. Click the extension's icon → **⚙ Settings**, and paste a GitHub Personal Access Token. (The token authorises the extension to commit on your behalf. Generate one at github.com → Settings → Developer settings → Personal access tokens → "Contents: write" permission on this repository.)

### Install (Firefox)

1. Download and unzip `sfsc-extension.zip`.
2. Open `about:debugging` → **This Firefox** → **Load Temporary Add-on…** → pick `manifest.json` from the unzipped folder. (Temporary add-ons are removed when Firefox closes — for a permanent install, use Firefox Developer Edition or build a signed `.xpi`.)
3. Click the extension icon → **⚙ Settings**, and paste a GitHub PAT.
4. To change the keyboard shortcut: `about:addons` → ⚙ menu → **Manage Extension Shortcuts**.

### Using the extension

Open the SFSC tentative rulings page (<https://webapps.sftc.org/tr/tr.dll>) in your browser, run a search for the date you want, then open the extension popup. The extension reads the page and offers several ways to commit the data:

- **One day at a time** — click **Send to GitHub**.
- **A date range** — fill **From** / **To** and click **Bulk Scrape Range**. The extension steps through every business day in the range, skipping weekends and California court holidays, and commits each day's rulings to the repository.
- **Skip days you've already done** — tick **"Skip dates already scanned in this range"** before clicking **Bulk Scrape Range** and the extension will only request days that aren't already in the archive.
- **Fill in every gap** — **Scan Unscanned Pages** automatically finds every business day from the first scanned date through today that's missing, and scrapes them.
- **Multiple tabs at once** — open the SFSC site in two (or more) browser tabs, click the extension icon in each, and start an independent scrape in each tab. The popup only shows progress for the tab it was opened from, and each tab can be stopped, resumed, or paused without affecting the others.
- **Pause / Resume** — the SFSC site logs you out after roughly fifty searches and challenges you with a CAPTCHA. The extension notices, pauses the run, and reloads the page so you see the CAPTCHA. Solve it, then click **Resume after CAPTCHA** and the run continues at the same date that triggered the timeout — no days lost.
- **Stop / Resume** — **Stop** halts the run. Use **⏭ Resume** to start again from the day after the last commit.
- **Tooltips** — toggle the **?** button in the popup's upper right to display short on-hover explanations of every button and field.
- **Keyboard shortcut** — `Alt+Shift+S` (default) commits the current page and loads the next business day in one keystroke. Useful for stepping through manually.
- **Updates** — when a newer version of the extension is published, the popup shows an **Update available** banner with one-click download.

## Glossary

- **Tentative ruling** — the court's preliminary written ruling on a motion, posted the day before the hearing. Becomes final unless a party "contests" it under the local rules.
- **Department** — a courtroom and the judge assigned to it. Department 204 hears probate matters; Department 301 hears discovery motions; Department 302 hears civil law-and-motion calendars; Department 304 hears asbestos matters on two distinct sub-calendars (Asbestos Law and Motion + Asbestos Discovery, on different days); Department 501 hears real-property matters.
- **Motion type** — the kind of motion (demurrer, summary judgment, motion to compel, anti-SLAPP, etc.). Auto-classified from the calendar caption; you can correct misclassifications by filing a bug report from the ruling's detail view.
- **Outcome** — whether the motion was granted, denied, continued, taken off calendar, etc. Auto-classified from the ruling text; same correction path as motion type.

---

## For developers / archivists

<details>
<summary>Repository layout, data ingestion pipeline, and contribution mechanics</summary>

### Repo layout

| Path | What |
|------|------|
| `tentatives.parquet` | Canonical dataset (all rulings, all departments) — kept for back-compat with downstream scripts |
| `data/tentatives-<N>.parquet` | Per-department slice the data browser fetches on demand |
| `data/manifest.json` | Description of every per-department parquet (rulings, size, latest date) |
| `raw/dept<N>/*.json` | Per-day raw scrapes, organised by department |
| `coverage/dept<N>.json` | Union of dates covered by parquet rows + raw filenames; one of three inputs the extension reads to find unscanned days (alongside the live `raw/dept<N>/` listing and an in-extension commit log) |
| `extension/` | Browser extension source (Chrome + Firefox) |
| `sfsc-extension.zip` | Pre-built, installable extension |
| `index.html` | Static data browser (served via GitHub Pages) |
| `ingest.py` | Merges raw JSON into the parquet |
| `update-readme.py` | Regenerates the per-department parquets, coverage files, and the sections below |

### Ingest

Raw JSON pushed to `raw/dept<N>/` triggers `.github/workflows/ingest.yml`. The workflow throttles back-to-back runs: every push queues a run, runs execute sequentially via the concurrency group, and any run within 60 seconds of the last bot commit exits fast — so a 50-file bulk-scrape burst collapses to roughly one ingest plus quick no-ops. Each pass diffs against the last bot commit, so any file that a previous run missed gets picked up automatically; `workflow_dispatch` with `mode: all-raw` re-ingests every raw JSON if a deeper repair is needed.

Local:

```bash
pip install pandas pyarrow openpyxl
python ingest.py raw/dept302/2026-04-28-120000.json
```

To regenerate the per-department parquets, coverage files, and department sections below:

```bash
pip install pandas pyarrow holidays
python update-readme.py
```

</details>

---

"""

def ca_court_holidays(min_year: int, max_year: int) -> set[str]:
    """Return ISO date strings for California court holidays in the given year range.

    Combines CA state public holidays with federal government holidays (to
    capture Columbus Day), then manually adds Lincoln's Birthday (Feb 12),
    which is a California legal holiday (Gov. Code § 6700) not included in
    the holidays library's CA subdivision.
    """
    years = range(min_year, max_year + 1)
    ca_public = hol.country_holidays('US', subdiv='CA', years=years)
    us_gov    = hol.country_holidays('US', categories=hol.GOVERNMENT, years=years)
    combined: set[date] = set(ca_public.keys()) | set(us_gov.keys())

    for year in years:
        lincoln = date(year, 2, 12)
        if lincoln.weekday() == 5:      # Saturday → observe Friday
            lincoln = date(year, 2, 11)
        elif lincoln.weekday() == 6:    # Sunday → observe Monday
            lincoln = date(year, 2, 13)
        combined.add(lincoln)

    return {d.isoformat() for d in combined}


def find_gap_runs(min_date: str, max_date: str, checked: set,
                  court_holidays: set | None = None) -> list[tuple[str, str]]:
    """Returns (start, end) tuples for each gap of missing weekdays.

    Weekends and court holidays are skipped — they don't open or close a gap.
    A gap closes only when a weekday with data is encountered.
    """
    court_holidays = court_holidays or set()
    d   = date.fromisoformat(min_date)
    end = date.fromisoformat(max_date)
    runs = []
    run_start = run_end = None
    while d <= end:
        if d.weekday() < 5 and d.isoformat() not in court_holidays:
            if d.isoformat() not in checked:
                if run_start is None:
                    run_start = d.isoformat()
                run_end = d.isoformat()
            else:
                if run_start is not None:
                    runs.append((run_start, run_end))
                    run_start = run_end = None
        d += timedelta(days=1)
    if run_start is not None:
        runs.append((run_start, run_end))
    return runs

def format_gaps(runs: list[tuple[str, str]]) -> str:
    if not runs:
        return '_None — all weekdays in range are accounted for._'
    lines = []
    for start, end in runs:
        lines.append(f'- {start}' if start == end else f'- {start} → {end}')
    return '\n'.join(lines)

def scraped_dates_for_dept(dept: str, subfolder: str = '') -> set[str]:
    """Dates we have raw scrape evidence for, derived from filenames in
    raw/dept<N>/[<subfolder>/]. A date with a raw file is *not* a gap
    even if no rulings landed in the parquet for it (e.g. the page
    returned zero tentatives, or returned tentatives whose hearings are
    on a different date).

    `subfolder` scopes the walk to a single sub-calendar (used for
    Dept 304's per-kind coverage). Empty `subfolder` walks the
    top-level dept dir only — non-recursive — to keep
    sub-calendar files from contaminating the merged dept-level
    coverage."""
    raw_dir = HERE / 'raw' / f'dept{dept}'
    if subfolder:
        raw_dir = raw_dir / subfolder
    if not raw_dir.is_dir():
        return set()
    out = set()
    for p in raw_dir.glob('*.json'):
        stem = p.stem
        if len(stem) >= 10 and stem[4] == '-' and stem[7] == '-':
            out.add(stem[:10])
    return out


def dept_section(dept: str, df_dept: pd.DataFrame,
                 *, kind: str | None = None,
                 subfolder: str = '',
                 display_name: str | None = None) -> str:
    """Render one collapsible <details> block for a department (or one
    sub-calendar of a department). `kind` filters df_dept to rows whose
    `calendar_kind` equals it; `subfolder` scopes the raw-file scan;
    `display_name` overrides the DEPT_NAMES default for the section
    header (used for Dept 304 sub-calendar splits)."""
    if kind is not None and 'calendar_kind' in df_dept.columns:
        df_dept = df_dept[df_dept['calendar_kind'] == kind]
    name    = display_name or DEPT_NAMES.get(dept, f'Department {dept}')
    count   = len(df_dept)
    # `dates`: hearing dates that produced rulings — the meaningful coverage
    #          for someone searching the archive ("days with data").
    # `scraped`: dates we have a raw scrape file for — includes days the
    #            court posted nothing, which still close gaps but aren't
    #            useful as search anchors.
    # The collapsed summary leads with first/last day-with-data because
    # that's what users actually care about; the harvest extents and gap
    # mechanics live inside as an aside.
    dates   = set(df_dept['court_date'].unique())
    scraped = scraped_dates_for_dept(dept, subfolder=subfolder)
    # Apply the per-dept floor: if a department only began publishing
    # tentatives online on a given date, anything before it is excluded
    # from gap calculation entirely (otherwise three pre-floor empty-marker
    # files manufacture a multi-year fake "gap").
    floor = DEPT_DATA_FLOORS.get(dept)
    if floor:
        dates   = {d for d in dates   if d >= floor}
        scraped = {d for d in scraped if d >= floor}
    checked = dates | scraped

    if not checked:
        # For a sub-calendar (kind set) we still render an empty section
        # so the reader sees "this calendar exists, no data yet" — that
        # was the whole point of separate counters for Dept 304's two
        # sub-calendars. For a top-level dept with no data anywhere
        # we'd genuinely have nothing useful to show.
        if kind is None:
            return ''
        summary = (f'<strong>{name}</strong>'
                   f' &nbsp;·&nbsp; 0 rulings'
                   f' &nbsp;·&nbsp; no scans yet')
        body = ('\n_No rulings or scans have landed for this sub-calendar yet. '
                'Once the extension records its first scrape it will start '
                'showing here, and gaps will be enumerated against the '
                'court\'s posted hearing days._\n')
        return f'<details>\n<summary>{summary}</summary>\n{body}</details>\n'

    earliest_harvest = min(checked)
    latest_harvest   = max(checked)
    earliest_data    = min(dates) if dates else earliest_harvest
    latest_data      = max(dates) if dates else latest_harvest
    n_days_data      = len(dates)
    n_days_scanned   = len(checked)

    holidays = ca_court_holidays(int(earliest_harvest[:4]), int(latest_harvest[:4]))
    gaps     = find_gap_runs(earliest_harvest, latest_harvest, checked, holidays)
    n_gaps   = len(gaps)

    # Total weekdays (excluding court holidays) inside the harvest window —
    # the denominator for "X of Y weekdays scanned".
    holidays_within_data = ca_court_holidays(int(earliest_data[:4]), int(latest_data[:4]))
    weekdays_in_data_range = sum(
        1 for d in pd.date_range(earliest_data, latest_data)
        if d.weekday() < 5 and d.strftime('%Y-%m-%d') not in holidays_within_data
    ) if dates else 0

    # Markdown bold (`**...**`) inside a <summary> tag is rendered literally
    # by GitHub — the asterisks show up as text. Use <strong> so the
    # department name renders bold in the collapsed header.
    summary = (f'<strong>{name}</strong>'
               f' &nbsp;·&nbsp; {count:,} rulings'
               f' &nbsp;·&nbsp; {earliest_data} → {latest_data}'
               f' &nbsp;·&nbsp; {n_days_data:,} hearing day{"s" if n_days_data != 1 else ""}'
               f' &nbsp;·&nbsp; {n_gaps} gap{"s" if n_gaps != 1 else ""}')

    coverage_pct = (n_days_data / weekdays_in_data_range * 100) if weekdays_in_data_range else 0

    # Per-dept availability notes — surfaced inside the collapsible body
    # so a reader doesn't wonder why the gap list excludes a long stretch.
    # Dept 301 didn't post tentatives online before mid-March 2024 (the
    # date its calendar started showing up on the SFTC tentatives page);
    # we explicitly trim raw scrapes + parquet rows to that floor.
    avail_notes = {
        '301': 'Department 301 tentatives are not available online before 2024-03-19 — earlier dates are excluded from gap-finding and bulk scraping.',
    }
    avail_note = avail_notes.get(dept, '')

    body = f"""\

{count:,} tentative rulings across {n_days_data:,} hearing day{"s" if n_days_data != 1 else ""} ({earliest_data} → {latest_data}).
{f'{chr(10)}> _{avail_note}_{chr(10)}' if avail_note else ''}
### Coverage

- **Hearing days with data:** {n_days_data:,} of {weekdays_in_data_range:,} weekdays in range ({coverage_pct:.1f}%)
- **Days scanned:** {n_days_scanned:,} (including days the court posted no rulings)
- **Earliest harvested:** {earliest_harvest}{' (same as first hearing day)' if earliest_harvest == earliest_data else ''}
- **Latest harvested:** {latest_harvest}{' (same as last hearing day)' if latest_harvest == latest_data else ''}

### Gaps ({n_gaps})

{format_gaps(gaps)}

"""

    return f'<details>\n<summary>{summary}</summary>\n{body}</details>\n'

def write_coverage(dept: str, df_dept: pd.DataFrame,
                   *, kind: str | None = None, subfolder: str = ''):
    """Write coverage/dept<N>[-<subfolder>].json — the union of dates
    that appear in the parquet (court_date) and dates with a raw
    scrape file in this dept (or sub-calendar). The browser extension
    uses this to decide which dates still need scraping; without it,
    the extension only sees raw filenames and treats every
    parquet-only date as unscanned (historical Excel imports
    populated 2017-2024 rulings without any raw files).

    For Dept 304 this is called twice — once per sub-calendar — so
    the extension's "scan unscanned" check on an Asbestos Discovery
    page only counts dates already scraped on the discovery
    sub-calendar, and likewise for Law and Motion."""
    if kind is not None and 'calendar_kind' in df_dept.columns:
        df_dept = df_dept[df_dept['calendar_kind'] == kind]
    parquet_dates = set(df_dept['court_date'].dropna().unique())
    file_dates    = scraped_dates_for_dept(dept, subfolder=subfolder)
    covered       = sorted(parquet_dates | file_dates)
    COVERAGE.mkdir(exist_ok=True)
    fname = f'dept{dept}-{subfolder}.json' if subfolder else f'dept{dept}.json'
    out = COVERAGE / fname
    out.write_text(json.dumps({
        'department': dept,
        'calendar_kind': kind,
        'covered':    covered,
        'min':        covered[0] if covered else None,
        'max':        covered[-1] if covered else None,
        'count':      len(covered),
    }, indent=0, separators=(',', ':')))


def write_dept_parquet(dept: str, df_dept: pd.DataFrame):
    """Write data/tentatives-<N>.parquet — a single-department slice the
    browser can fetch on demand. Two parquets are emitted per dept:

    - tentatives-<N>.parquet (main): everything the table view needs,
      with ruling_substantive promoted to `ruling`. No admin /
      courtcall — those bytes are deferred to the extras file.
    - tentatives-<N>-extras.parquet (sidecar): row_hash + ruling_admin
      + ruling_courtcall. The data browser fetches this only when a
      user opens a modal and expands the admin / CourtCall
      collapsible.

    The combined tentatives.parquet stays unchanged (canonical, with
    all three split columns) for anyone scripting against it directly.
    """
    DATA_DIR.mkdir(exist_ok=True)
    df_dept = df_dept.reset_index(drop=True).copy()

    # Fall back gracefully if the canonical parquet pre-dates the
    # ruling-split columns — in that case we ship the original ruling
    # in the main file and emit no extras file.
    has_splits = all(c in df_dept.columns for c in (
        'ruling_substantive', 'ruling_admin', 'ruling_courtcall'))

    main_out = DATA_DIR / f'tentatives-{dept}.parquet'
    if has_splits:
        main = df_dept.drop(columns=['ruling_admin', 'ruling_courtcall']).copy()
        # Promote the substantive split into the user-facing `ruling`
        # column so the browser doesn't have to know about the
        # split-column convention.
        main['ruling'] = main['ruling_substantive']
        main = main.drop(columns=['ruling_substantive'])
        main.to_parquet(main_out, index=False, compression='zstd')

        extras_out = DATA_DIR / f'tentatives-{dept}-extras.parquet'
        extras = df_dept[['row_hash', 'ruling_admin', 'ruling_courtcall']].copy()
        # Drop rows with neither admin nor courtcall — keeps the
        # sidecar small and the lookup-by-row_hash cheap on the
        # browser side.
        keep = (extras['ruling_admin'].fillna('').ne('')
                | extras['ruling_courtcall'].fillna('').ne(''))
        extras[keep].to_parquet(extras_out, index=False, compression='zstd')
    else:
        df_dept.to_parquet(main_out, index=False, compression='zstd')


def write_manifest(dept_stats: list[dict]):
    """Write data/manifest.json — describes each per-dept parquet so the
    browser can populate the Database Downloads dropdown without hard-coding
    department numbers."""
    DATA_DIR.mkdir(exist_ok=True)
    out = DATA_DIR / 'manifest.json'
    out.write_text(json.dumps({
        'departments': dept_stats,
    }, indent=2))


def main():
    if not (HERE / 'tentatives.parquet').exists():
        print('tentatives.parquet not found'); return

    df = pd.read_parquet(HERE / 'tentatives.parquet')
    df['court_date'] = pd.to_datetime(df['court_date']).dt.date.astype(str)

    sections = ''
    dept_stats = []
    for dept in sorted(df['department'].unique()):
        sub = df[df['department'] == dept]
        # Always emit a single per-dept parquet + manifest entry — the
        # data browser shows departments as one row each, with sub-
        # calendar (if any) preserved as a column for downstream tooling.
        write_dept_parquet(dept, sub)
        size_bytes = (DATA_DIR / f'tentatives-{dept}.parquet').stat().st_size
        # Extras parquet (admin + courtcall, lazy-loaded by the data
        # browser when the user opens a modal and expands the
        # collapsible). Optional — older parquets without the split
        # columns won't have a sidecar file.
        extras_path = DATA_DIR / f'tentatives-{dept}-extras.parquet'
        extras_size = int(extras_path.stat().st_size) if extras_path.exists() else None
        latest = sub['court_date'].max() if not sub.empty else None
        entry = {
            'department': dept,
            'name':       DEPT_NAMES.get(dept, f'Department {dept}'),
            'rulings':    int(len(sub)),
            'size_bytes': int(size_bytes),
            'latest':     latest,
        }
        if extras_size is not None:
            entry['extras_size_bytes'] = extras_size
        dept_stats.append(entry)
        # Sub-calendar split (currently only Dept 304): emit a separate
        # README section + coverage file per sub-calendar so contributors
        # can see each sub-calendar's gaps independently. The data
        # browser still merges them into a single Department 304 view.
        subcals = DEPT_SUB_CALENDARS.get(dept)
        if subcals:
            for kind, subfolder, display_name in subcals:
                sections += dept_section(dept, sub,
                                         kind=kind, subfolder=subfolder,
                                         display_name=display_name)
                write_coverage(dept, sub, kind=kind, subfolder=subfolder)
            # Also write the merged dept-level coverage so any
            # downstream tooling that asks for coverage/dept304.json
            # (without a sub-calendar suffix) still works.
            write_coverage(dept, sub)
        else:
            sections += dept_section(dept, sub)
            write_coverage(dept, sub)
    write_manifest(dept_stats)

    content = STATIC_TOP + '## Departments\n\n' + sections
    README.write_text(content)
    print(f'Updated README.md, coverage/, data/ for {len(dept_stats)} department(s)')

if __name__ == '__main__':
    main()
