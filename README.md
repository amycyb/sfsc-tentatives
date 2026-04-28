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

## Departments

<details>
<summary>**Department 302 — Civil Law & Motion** &nbsp;·&nbsp; 45,822 rulings &nbsp;·&nbsp; Latest: 2026-04-24 &nbsp;·&nbsp; 128 gaps</summary>

45,822 tentative rulings. Latest: 2026-04-24.

### Gaps (128)

- 2014-01-20
- 2014-02-12
- 2014-02-17
- 2014-03-31
- 2014-05-26
- 2014-07-04
- 2014-09-01
- 2014-10-13
- 2014-11-11
- 2014-11-27 → 2014-11-28
- 2014-12-25
- 2015-01-01
- 2015-01-19
- 2015-02-12
- 2015-02-16
- 2015-03-31
- 2015-05-01
- 2015-05-25
- 2015-07-03
- 2015-09-07
- 2015-10-12
- 2015-11-11
- 2015-11-26 → 2015-11-27
- 2015-12-25
- 2016-01-01
- 2016-01-18
- 2016-02-12 → 2016-02-15
- 2016-03-31 → 2016-04-01
- 2016-05-30
- 2016-07-04
- 2016-09-05
- 2016-09-16
- 2016-10-10
- 2016-10-25
- 2016-11-11
- 2016-11-24 → 2016-11-25
- 2016-12-26
- 2017-01-02
- 2017-01-16
- 2017-02-13
- 2017-02-20
- 2017-03-31
- 2017-05-29
- 2017-06-21 → 2017-06-22
- 2017-07-04
- 2017-09-04
- 2017-10-09
- 2017-11-10
- 2017-11-23 → 2017-11-24
- 2017-12-25
- 2018-01-01
- 2018-01-15
- 2018-02-12
- 2018-02-19
- 2018-03-30
- 2018-04-17 → 2020-01-01
- 2020-01-20
- 2020-02-12
- 2020-02-17
- 2020-03-31 → 2020-05-14
- 2020-05-18
- 2020-05-20
- 2020-05-22 → 2020-05-25
- 2020-05-27
- 2020-06-01
- 2020-06-08
- 2020-06-10
- 2020-06-15
- 2020-06-17
- 2020-07-03
- 2020-08-03 → 2020-08-28
- 2020-09-07
- 2020-10-12
- 2020-11-11
- 2020-11-26 → 2020-11-27
- 2020-12-25
- 2021-01-01
- 2021-01-18
- 2021-02-12 → 2021-02-15
- 2021-03-31
- 2021-05-03 → 2021-05-31
- 2021-07-05
- 2021-09-06
- 2021-10-11
- 2021-11-11
- 2021-11-25 → 2021-11-26
- 2021-12-24
- 2021-12-31
- 2022-01-17
- 2022-02-11
- 2022-02-21
- 2022-03-31
- 2022-05-30
- 2022-07-04
- 2022-09-05
- 2022-09-23
- 2022-11-11
- 2022-11-24 → 2022-11-25
- 2022-12-26
- 2023-01-02
- 2023-01-16
- 2023-02-13
- 2023-02-20
- 2023-03-31
- 2023-05-29
- 2023-06-19
- 2023-07-04
- 2023-09-04
- 2023-09-22
- 2023-11-10
- 2023-11-23 → 2023-11-24
- 2023-12-21
- 2023-12-25
- 2024-01-01
- 2024-01-15
- 2024-02-12
- 2024-02-19
- 2024-04-01
- 2024-04-23 → 2024-04-24
- 2024-05-27
- 2024-05-30
- 2024-06-19
- 2024-07-04 → 2024-07-22
- 2024-07-29
- 2024-07-31
- 2024-08-02 → 2024-08-06
- 2024-08-08 → 2024-09-02
- 2024-09-04 → 2026-04-23

</details>
