# SFSC Tentative Rulings

Archived tentative rulings from the San Francisco Superior Court, Department 302.

**[Browse the data →](https://aimesy.github.io/sfsc-tentatives/)**

## Repository layout

| Path | Description |
|------|-------------|
| `tentatives.parquet` | Canonical dataset (committed to git) |
| `raw/*.json` | Raw JSON exports from the browser extension |
| `extension/` | Chrome extension source |
| `sfsc-extension.zip` | Installable extension package |
| `ingest.py` | Ingests raw JSON / XLSX files into the parquet |
| `index.html` | Data browser (served via GitHub Pages) |

## Browser extension

The extension scrapes the [SFSC tentative rulings page](https://webapps.sftc.org/tr/tr.dll) and commits results directly to this repository.

### Install

1. Download `sfsc-extension.zip` and unzip it.
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, select the unzipped folder.
3. Open the extension popup → **Settings** → enter your GitHub PAT (needs `Contents: write` on this repo) and save.

### Use

- **Single day:** navigate to the rulings page, run a search, then click **Send to GitHub**.
- **Bulk scrape:** enter a date range and click **Bulk Scrape Range**. The extension iterates every weekday, submits each date, and commits results automatically.

## Ingest pipeline

New JSON files pushed to `raw/` trigger the GitHub Actions workflow (`.github/workflows/ingest.yml`), which runs `ingest.py` to merge them into `tentatives.parquet` and commits the updated file.

To ingest locally:

```bash
pip install pandas pyarrow openpyxl
python ingest.py raw/2026-04-28-dept302-001117.json
```
