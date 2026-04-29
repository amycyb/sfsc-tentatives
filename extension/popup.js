// popup.js — runs in the extension popup.

const $ = id => document.getElementById(id);
let scrapedData = null;
let bulkRunning = false;

// ── Helpers ───────────────────────────────────────────────────────────────────

function setStatus(msg, type = '') {
  const el = $('status');
  el.className = 'status' + (type ? ' ' + type : '');
  el.innerHTML = type === 'loading'
    ? `<div class="spinner"></div><span>${msg}</span>`
    : `<span>${msg}</span>`;
}

function loadSettings() {
  return new Promise(resolve =>
    chrome.storage.local.get(['token', 'repo', 'branch'], resolve)
  );
}

function validateSettings(s) {
  if (!s.token) return 'GitHub token not set — open Settings below.';
  if (!s.repo || !s.repo.includes('/')) return 'Repository not set — open Settings below.';
  return null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// YYYY-MM-DD using local-date components (avoids UTC-shift artefacts in TZ ≥ +13)
function localISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Accepts YYYY-MM-DD, MM/DD/YYYY, M/D/YYYY, MM-DD-YYYY → returns YYYY-MM-DD or null
function parseDate(str) {
  if (!str) return null;
  str = str.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const slash = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) return `${slash[3]}-${slash[1].padStart(2,'0')}-${slash[2].padStart(2,'0')}`;
  const dash = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dash)  return `${dash[3]}-${dash[1].padStart(2,'0')}-${dash[2].padStart(2,'0')}`;
  return null;
}

// CA court holidays 2014-2032 — generated from the Python `holidays` library
// (US-CA public + US government categories) plus Lincoln's Birthday (Gov. Code §6700).
// Keep in sync with update-readme.py:ca_court_holidays. Regenerate from
// scripts when extending the range.
const COURT_HOLIDAYS = new Set([
  '2014-01-01','2014-01-20','2014-02-12','2014-02-17','2014-03-31','2014-05-26','2014-07-04','2014-09-01','2014-10-13','2014-11-11','2014-11-27','2014-11-28','2014-12-25','2014-12-26',
  '2015-01-01','2015-01-19','2015-02-12','2015-02-16','2015-03-31','2015-05-25','2015-07-03','2015-09-07','2015-10-12','2015-11-11','2015-11-26','2015-11-27','2015-12-24','2015-12-25',
  '2016-01-01','2016-01-18','2016-02-12','2016-02-15','2016-03-31','2016-05-30','2016-07-04','2016-09-05','2016-10-10','2016-11-11','2016-11-24','2016-11-25','2016-12-26',
  '2017-01-02','2017-01-16','2017-02-13','2017-02-15','2017-02-20','2017-03-31','2017-05-29','2017-07-04','2017-09-04','2017-10-09','2017-11-10','2017-11-23','2017-11-24','2017-12-25',
  '2018-01-01','2018-01-15','2018-02-12','2018-02-15','2018-02-19','2018-05-28','2018-07-04','2018-09-03','2018-10-08','2018-11-12','2018-11-22','2018-11-23','2018-12-05','2018-12-24','2018-12-25',
  '2019-01-01','2019-01-21','2019-02-12','2019-02-15','2019-02-18','2019-04-01','2019-05-27','2019-07-04','2019-09-02','2019-10-14','2019-11-11','2019-11-28','2019-11-29','2019-12-24','2019-12-25',
  '2020-01-01','2020-01-20','2020-02-12','2020-02-17','2020-03-31','2020-05-25','2020-07-03','2020-09-07','2020-10-12','2020-11-11','2020-11-26','2020-11-27','2020-12-24','2020-12-25',
  '2021-01-01','2021-01-18','2021-02-12','2021-02-15','2021-03-31','2021-05-31','2021-06-18','2021-07-05','2021-09-06','2021-10-11','2021-11-11','2021-11-25','2021-11-26','2021-12-24','2021-12-31',
  '2022-01-17','2022-02-11','2022-02-15','2022-02-21','2022-03-31','2022-05-30','2022-06-20','2022-07-04','2022-09-05','2022-10-10','2022-11-11','2022-11-24','2022-11-25','2022-12-26',
  '2023-01-02','2023-01-16','2023-02-13','2023-02-15','2023-02-20','2023-03-31','2023-05-29','2023-06-19','2023-07-04','2023-09-04','2023-10-09','2023-11-10','2023-11-23','2023-11-24','2023-12-25',
  '2024-01-01','2024-01-15','2024-02-12','2024-02-15','2024-02-19','2024-04-01','2024-05-27','2024-06-19','2024-07-04','2024-09-02','2024-10-14','2024-11-11','2024-11-28','2024-11-29','2024-12-24','2024-12-25',
  '2025-01-01','2025-01-09','2025-01-20','2025-02-12','2025-02-17','2025-03-31','2025-05-26','2025-06-19','2025-07-04','2025-09-01','2025-10-13','2025-11-11','2025-11-27','2025-11-28','2025-12-24','2025-12-25','2025-12-26',
  '2026-01-01','2026-01-19','2026-02-12','2026-02-16','2026-03-31','2026-05-25','2026-06-19','2026-07-03','2026-09-07','2026-10-12','2026-11-11','2026-11-26','2026-11-27','2026-12-25',
  '2027-01-01','2027-01-18','2027-02-12','2027-02-15','2027-03-31','2027-05-31','2027-06-18','2027-07-05','2027-09-06','2027-10-11','2027-10-29','2027-11-11','2027-11-25','2027-11-26','2027-12-24','2027-12-31',
  '2028-01-17','2028-02-11','2028-02-15','2028-02-21','2028-03-31','2028-05-29','2028-06-19','2028-07-04','2028-09-04','2028-10-09','2028-10-17','2028-11-10','2028-11-23','2028-11-24','2028-12-25',
  '2029-01-01','2029-01-15','2029-02-12','2029-02-15','2029-02-19','2029-05-28','2029-06-19','2029-07-04','2029-09-03','2029-10-08','2029-11-05','2029-11-12','2029-11-22','2029-11-23','2029-12-25',
  '2030-01-01','2030-01-21','2030-02-12','2030-02-15','2030-02-18','2030-04-01','2030-05-27','2030-06-19','2030-07-04','2030-09-02','2030-10-14','2030-11-11','2030-11-28','2030-11-29','2030-12-25',
  '2031-01-01','2031-01-20','2031-02-12','2031-02-17','2031-03-31','2031-05-26','2031-06-19','2031-07-04','2031-09-01','2031-10-13','2031-11-11','2031-11-14','2031-11-27','2031-11-28','2031-12-25',
  '2032-01-01','2032-01-19','2032-02-12','2032-02-16','2032-03-31','2032-05-31','2032-06-18','2032-07-05','2032-09-06','2032-10-11','2032-11-02','2032-11-11','2032-11-25','2032-11-26','2032-12-24','2032-12-31',
]);

// Returns ISO date strings (YYYY-MM-DD) for every business day (Mon-Fri, non-holiday) in [from, to]
function weekdaysBetween(from, to) {
  const dates = [];
  const d   = new Date(from + 'T12:00:00');
  const end = new Date(to   + 'T12:00:00');
  while (d <= end) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) {
      const iso = localISO(d);
      if (!COURT_HOLIDAYS.has(iso)) dates.push(iso);
    }
    d.setDate(d.getDate() + 1);
  }
  return dates;
}


// ── GitHub date helpers ───────────────────────────────────────────────────────

function nextWeekday(isoDate) {
  const d = new Date(isoDate + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return localISO(d);
}

async function fetchScannedDates(s) {
  const [owner, repo] = s.repo.split('/');
  // Determine department from current page if possible, default to 302
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let dept = '302';
  if (tab?.url?.includes('webapps.sftc.org')) {
    try {
      const results = await new Promise(resolve =>
        chrome.tabs.sendMessage(tab.id, { action: 'scrape' }, r =>
          resolve(chrome.runtime.lastError ? null : r)
        )
      );
      if (results?.department) dept = results.department;
    } catch (_) {}
  }

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/raw/dept${dept}?ref=${s.branch || 'master'}`,
    { headers: { Authorization: `Bearer ${s.token}`, 'X-GitHub-Api-Version': '2022-11-28' } }
  );
  if (!res.ok) return null;
  const files = await res.json();
  if (!Array.isArray(files)) return null;
  return files
    .map(f => f.name.match(/^(\d{4}-\d{2}-\d{2})/)?.[1])
    .filter(Boolean)
    .sort();
}

async function jumpToFirstGap() {
  const s = await loadSettings();
  const err = validateSettings(s);
  if (err) { setStatus(err, 'error'); return; }
  setStatus('Fetching scanned dates…', 'loading');
  const dates = await fetchScannedDates(s);
  if (!dates?.length) { setStatus('No scanned dates found.', 'warn'); return; }
  const scanned = new Set(dates);
  const min = dates[0], max = dates[dates.length - 1];
  // Find first weekday in range that's missing
  const d = new Date(min + 'T12:00:00');
  const end = new Date(max + 'T12:00:00');
  while (d <= end) {
    const iso = localISO(d);
    if ((d.getDay() !== 0 && d.getDay() !== 6) && !COURT_HOLIDAYS.has(iso) && !scanned.has(iso)) {
      $('bulk-from').value = iso; $('bulk-from-picker').value = iso;
      $('bulk-to').value   = max; $('bulk-to-picker').value   = max;
      setStatus(`First gap: ${iso}`, 'success');
      return;
    }
    d.setDate(d.getDate() + 1);
  }
  setStatus('No gaps found in scanned range.', 'success');
}

async function jumpToResume() {
  const s = await loadSettings();
  const err = validateSettings(s);
  if (err) { setStatus(err, 'error'); return; }
  setStatus('Fetching last scanned date…', 'loading');
  const dates = await fetchScannedDates(s);
  if (!dates?.length) { setStatus('No scanned dates found.', 'warn'); return; }
  const last = dates[dates.length - 1];
  const from = nextWeekday(last);
  $('bulk-from').value = from; $('bulk-from-picker').value = from;
  $('bulk-to').value   = '';   $('bulk-to-picker').value   = '';
  setStatus(`Resuming from ${from} (To = today)`, 'success');
}

// ── Auto-scan: fetch gaps and start bulk immediately ──────────────────────────

async function autoScanUnscanned() {
  const s = await loadSettings();
  const err = validateSettings(s);
  if (err) { setStatus(err, 'error'); return; }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.includes('webapps.sftc.org/tr/')) {
    setStatus('Navigate to the SFSC page first.', 'warn');
    return;
  }

  $('auto-scan-btn').disabled = true;
  setStatus('Finding unscanned dates…', 'loading');

  const scannedDates = await fetchScannedDates(s);
  const today = localISO(new Date());

  let allWeekdays;
  if (scannedDates?.length) {
    allWeekdays = weekdaysBetween(scannedDates[0], today);
  } else {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    allWeekdays = weekdaysBetween(localISO(oneYearAgo), today);
  }

  const scanned = new Set(scannedDates || []);
  const unscanned = allWeekdays.filter(d => !scanned.has(d));

  if (!unscanned.length) {
    setStatus('All dates up to today are already scanned!', 'success');
    $('auto-scan-btn').disabled = false;
    return;
  }

  const waitMs = parseInt($('bulk-wait').value) || 1_000;
  const settings = { token: s.token, repo: s.repo, branch: s.branch || 'master' };

  $('bulk-btn').disabled = true;
  $('bulk-stop').style.display = 'block';
  $('send-btn').disabled = true;
  setStatus(`Starting scan of ${unscanned.length} unscanned dates…`, 'loading');

  chrome.runtime.sendMessage(
    { action: 'start-bulk', payload: { dates: unscanned, tabId: tab.id, settings, waitMs } },
    res => {
      if (res?.error) {
        setStatus('Error starting auto-scan: ' + res.error, 'error');
        $('bulk-btn').disabled = false;
        $('bulk-stop').style.display = 'none';
        $('auto-scan-btn').disabled = false;
      }
    }
  );
}

// ── Date inputs (text + hidden calendar picker) ───────────────────────────────

function wireDateInput(textId, pickerId, calBtnId) {
  const text   = $(textId);
  const picker = $(pickerId);
  const calBtn = $(calBtnId);

  function applyIso(iso) {
    text.value   = iso;
    picker.value = iso;
    text.classList.remove('invalid');
  }

  text.addEventListener('blur', () => {
    const iso = parseDate(text.value);
    if (iso)              applyIso(iso);
    else if (text.value)  text.classList.add('invalid');
  });

  text.addEventListener('paste', e => {
    const raw = (e.clipboardData || window.clipboardData).getData('text');
    const iso = parseDate(raw);
    if (iso) { e.preventDefault(); applyIso(iso); }
  });

  // Calendar button opens the native date picker
  calBtn.addEventListener('click', () => {
    if (picker.showPicker) picker.showPicker();
    else picker.click();
  });

  picker.addEventListener('change', () => {
    if (picker.value) applyIso(picker.value);
  });
}

wireDateInput('bulk-from', 'bulk-from-picker', 'cal-from');
wireDateInput('bulk-to',   'bulk-to-picker',   'cal-to');

// ── Settings: auto-save on blur ───────────────────────────────────────────────

function flashSaved(labelId) {
  const el = $(labelId);
  if (!el) return;
  el.textContent = '✓ saved';
  setTimeout(() => { el.textContent = ''; }, 2000);
}

function saveField(field) {
  const update = {};
  update[field] = $(field).value.trim() || (field === 'branch' ? 'master' : '');
  chrome.storage.local.set(update, () => flashSaved(field + '-saved'));
  if (field === 'token') {
    // Token saved — try re-initialising
    setTimeout(init, 300);
  }
}

$('token').addEventListener('blur',  () => saveField('token'));
$('repo').addEventListener('blur',   () => saveField('repo'));
$('branch').addEventListener('blur', () => saveField('branch'));

$('settings-btn').addEventListener('click', async () => {
  const panel = $('settings');
  const open  = panel.style.display === 'block';
  panel.style.display = open ? 'none' : 'block';
  if (!open) {
    const s = await loadSettings();
    $('token').value  = s.token  || '';
    $('repo').value   = s.repo   || 'aimesy/sfsc-tentatives';
    $('branch').value = s.branch || 'master';
  }
});

// ── Auto-update check ─────────────────────────────────────────────────────────

function checkAndDownloadUpdate() {
  chrome.runtime.sendMessage({ action: 'check-updates' }, result => {
    if (!result?.hasUpdate) return;
    $('update-banner').style.display = 'flex';
  });
}

$('update-download').addEventListener('click', () => {
  $('update-download').disabled = true;
  $('update-banner').querySelector('span').textContent = 'Downloading…';
  chrome.runtime.sendMessage({ action: 'download-update' }, dlResult => {
    $('update-download').style.display = 'none';
    $('update-banner').querySelector('span').textContent = dlResult?.success
      ? 'Downloaded — unzip sfsc-extension.zip and reload in chrome://extensions'
      : 'Download failed — get sfsc-extension.zip from GitHub';
  });
});

$('update-dismiss').addEventListener('click', () => {
  $('update-banner').style.display = 'none';
});

// ── On open: scrape current tab ───────────────────────────────────────────────

async function init() {
  setStatus('Checking page…', 'loading');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab.url?.includes('webapps.sftc.org/tr/')) {
    setStatus('Navigate to the SFSC Tentative Rulings page first.', 'warn');
    return;
  }

  $('bulk-btn').disabled = false;
  $('auto-scan-btn').disabled = false;

  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  } catch (_) {}

  // Pre-fill date range from current page date input
  chrome.tabs.sendMessage(tab.id, { action: 'get-date' }, r => {
    if (!chrome.runtime.lastError && r?.date) {
      if (!$('bulk-from').value) { $('bulk-from').value = r.date; $('bulk-from-picker').value = r.date; }
      if (!$('bulk-to').value)   { $('bulk-to').value   = r.date; $('bulk-to-picker').value   = r.date; }
    }
  });

  chrome.tabs.sendMessage(tab.id, { action: 'scrape' }, result => {
    if (chrome.runtime.lastError || !result) {
      setStatus('Could not read page. Refresh and try again.', 'error');
      return;
    }
    if (result.sessionExpired) {
      setStatus('Session has expired. Please log in to the SFSC page again.', 'error');
      return;
    }
    if (result.error) { setStatus(result.error, 'warn'); return; }

    scrapedData = result;
    const n    = result.rulings.length;
    const dept = result.department;

    // Pre-fill date range from scraped ruling court date
    if (!$('bulk-from').value && result.rulings[0]?.['Court Date']) {
      const iso = parseDate(result.rulings[0]['Court Date']);
      if (iso) {
        if (!$('bulk-from').value) { $('bulk-from').value = iso; $('bulk-from-picker').value = iso; }
        if (!$('bulk-to').value)   { $('bulk-to').value   = iso; $('bulk-to-picker').value   = iso; }
      }
    }

    if (n === 0) { setStatus('No rulings found on this page.', 'warn'); return; }

    // Use `!= null` (not truthy) so reported_total === 0 still triggers when
    // the rulings DOM is non-empty — observed in stale-session pages where
    // the resultsCount label shows 0 but cached rulings remain rendered.
    const warn = result.reported_total != null && result.reported_total !== n
      ? ` (page reports ${result.reported_total} — scroll to load all)`
      : '';
    setStatus(`Found ${n} ruling${n !== 1 ? 's' : ''} — Dept ${dept}.${warn}`, warn ? 'warn' : '');
    $('send-btn').disabled = false;
  });
}

// ── Send to GitHub (single page) ──────────────────────────────────────────────

$('send-btn').addEventListener('click', async () => {
  if (!scrapedData) return;
  $('send-btn').disabled = true;
  setStatus('Committing to GitHub…', 'loading');

  const s = await loadSettings();
  const err = validateSettings(s);
  if (err) { setStatus(err, 'error'); $('send-btn').disabled = false; return; }

  const [owner, repo] = s.repo.split('/');
  // Inject _date from the page's date input so background commitToGitHub can file
  // the commit under the searched date even when rulings happen to be empty.
  const pageDate = parseDate($('bulk-from').value);
  const data = pageDate ? { ...scrapedData, _date: pageDate } : scrapedData;
  chrome.runtime.sendMessage(
    { action: 'commit', payload: { token: s.token, owner, repo, branch: s.branch || 'master', data } },
    res => {
      if (res?.error) {
        setStatus('Error: ' + res.error, 'error');
        $('send-btn').disabled = false;
      } else if (res?.duplicate) {
        setStatus(`Already submitted for this date — skipped. (${res.path})`, 'warn');
        $('send-btn').disabled = false;
      } else {
        setStatus(`Committed ${scrapedData.rulings.length} rulings → ${res.path}`, 'success');
      }
    }
  );
});

// ── Bulk status display ───────────────────────────────────────────────────────

function updateBulkStatus(job) {
  if (!job) return;
  if (job.fatalError) {
    setStatus(job.fatalError, 'error');
    $('bulk-btn').disabled = false;
    $('auto-scan-btn').disabled = false;
    $('bulk-stop').style.display = 'none';
    return;
  }
  if (job.done) {
    setStatus(
      `Done: ${job.committed} committed, ${job.skipped} skipped, ${job.errors} errors`,
      job.errors > 0 ? 'warn' : 'success'
    );
    $('bulk-btn').disabled = false;
    $('auto-scan-btn').disabled = false;
    $('bulk-stop').style.display = 'none';
    return;
  }
  if (job.running) {
    const pct = job.dates?.length ? Math.round(job.index / job.dates.length * 100) : 0;
    setStatus(
      `[${job.index}/${job.dates?.length}] ${job.currentDate || '…'} — ` +
      `${job.committed} saved, ${job.skipped} skipped, ${job.errors} err — ${pct}% ` +
      `(close popup freely)`,
      'loading'
    );
    $('bulk-btn').disabled = true;
    $('bulk-stop').style.display = 'block';
  }
}

// Keep popup in sync with background job even while open
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes._bulkJob) {
    updateBulkStatus(changes._bulkJob.newValue);
  }
});

// ── Bulk Scrape ───────────────────────────────────────────────────────────────

$('bulk-btn').addEventListener('click', async () => {
  const from = parseDate($('bulk-from').value);
  const to   = parseDate($('bulk-to').value) || localISO(new Date());
  if (!from || from > to) {
    setStatus('Enter a valid start date (YYYY-MM-DD or MM/DD/YYYY).', 'warn');
    return;
  }

  const s = await loadSettings();
  const err = validateSettings(s);
  if (err) { setStatus(err, 'error'); return; }

  const waitMs = parseInt($('bulk-wait').value) || 1_000;
  const dates  = weekdaysBetween(from, to);
  if (!dates.length) { setStatus('No weekdays in that range.', 'warn'); return; }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.includes('webapps.sftc.org/tr/')) {
    setStatus('Navigate to the SFSC page first.', 'warn');
    return;
  }

  const settings = { token: s.token, repo: s.repo, branch: s.branch || 'master' };

  $('bulk-btn').disabled = true;
  $('bulk-stop').style.display = 'block';
  $('send-btn').disabled = true;
  setStatus(`Starting background scrape of ${dates.length} dates…`, 'loading');

  chrome.runtime.sendMessage(
    { action: 'start-bulk', payload: { dates, tabId: tab.id, settings, waitMs } },
    res => {
      if (res?.error) {
        setStatus('Error starting bulk: ' + res.error, 'error');
        $('bulk-btn').disabled = false;
        $('bulk-stop').style.display = 'none';
      }
      // Otherwise, storage changes will drive the status display
    }
  );
});

$('bulk-stop').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'stop-bulk' });
});
$('auto-scan-btn').addEventListener('click', autoScanUnscanned);
$('jump-first').addEventListener('click', jumpToFirstGap);
$('jump-last').addEventListener('click',  jumpToResume);

// ── Diagnose ──────────────────────────────────────────────────────────────────

$('diag-btn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  } catch (_) {}
  chrome.tabs.sendMessage(tab.id, { action: 'diagnose' }, result => {
    if (chrome.runtime.lastError || !result) {
      setStatus('Could not diagnose — refresh page and try again.', 'error');
      return;
    }
    const msg = result.foundInput
      ? `Input: name="${result.foundInput.name}" id="${result.foundInput.id}" | Form action: ${result.formAction} | Btn: "${result.btnText}" | Forms: ${result.allForms.length}`
      : `No date input found. Forms: ${JSON.stringify(result.allForms)}`;
    setStatus(msg, result.foundInput ? 'warn' : 'error');
    console.log('SFSC diagnose:', JSON.stringify(result, null, 2));
  });
});

// ── Boot ──────────────────────────────────────────────────────────────────────

loadSettings().then(s => {
  $('token').value  = s.token  || '';
  $('repo').value   = s.repo   || 'aimesy/sfsc-tentatives';
  $('branch').value = s.branch || 'master';
  if (!s.token) $('settings').style.display = 'block';
});

// Restore any in-progress background bulk job
chrome.runtime.sendMessage({ action: 'bulk-status' }, job => {
  if (job?.running) updateBulkStatus(job);
});

checkAndDownloadUpdate();
init();
