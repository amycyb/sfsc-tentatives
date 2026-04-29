// Service worker: GitHub commits + background bulk scraping.

// ── Message router ────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  const handlers = {
    commit:          () => commitToGitHub(msg.payload),
    'check-updates': checkForUpdates,
    'download-update': downloadUpdate,
    'start-bulk':    () => startBulk(msg.payload),
    'stop-bulk':     stopBulk,
    'bulk-status':   () => chrome.storage.local.get(['_bulkJob']).then(r => r._bulkJob || null),
  };
  const handler = handlers[msg.action];
  if (!handler) return false;
  Promise.resolve().then(handler).then(respond).catch(err => respond({ error: err.message }));
  return true;
});

// ── Update checking ───────────────────────────────────────────────────────────

async function checkForUpdates() {
  const res = await fetch(
    'https://api.github.com/repos/aimesy/sfsc-tentatives/contents/sfsc-extension.zip',
    { headers: { 'X-GitHub-Api-Version': '2022-11-28' } }
  );
  if (!res.ok) return { hasUpdate: false };
  const { sha: latestSha } = await res.json();
  const { _lastExtensionSha: lastSha } = await chrome.storage.local.get(['_lastExtensionSha']);
  if (latestSha === lastSha) return { hasUpdate: false };
  await chrome.storage.local.set({ _lastExtensionSha: latestSha });
  return { hasUpdate: true, latestSha };
}

async function downloadUpdate() {
  try {
    const downloadId = await new Promise((resolve, reject) => {
      chrome.downloads.download({
        url: 'https://raw.githubusercontent.com/aimesy/sfsc-tentatives/master/sfsc-extension.zip',
        filename: 'sfsc-extension.zip',
        saveAs: false,
      }, id => id !== undefined ? resolve(id) : reject(new Error('Download failed')));
    });
    return { success: true, downloadId };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Duplicate detection (cached for 60s per dept) ─────────────────────────────

const _dirCache = new Map();

async function getDeptDir(token, owner, repo, branch, department) {
  const cached = _dirCache.get(department);
  if (cached && Date.now() - cached.time < 60_000) return cached.files;
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/raw/dept${department}?ref=${branch}`,
    { headers: { Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' } }
  );
  const json = res.ok ? await res.json().catch(() => []) : [];
  const files = Array.isArray(json) ? json : [];
  _dirCache.set(department, { files, time: Date.now() });
  return files;
}

// ── Commit ────────────────────────────────────────────────────────────────────

function courtDate(rulings) {
  const raw = rulings?.[0]?.['Court Date'] ?? '';
  const m = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return null;
}

async function commitToGitHub({ token, owner, repo, branch, data }) {
  const { department, scraped_at, rulings } = data;
  const date = data._date || courtDate(rulings);
  if (!date) throw new Error('No court date — pass _date in payload when rulings is empty.');
  const time = new Date(scraped_at).toISOString().slice(11, 19).replace(/:/g, '');
  const path = `raw/dept${department}/${date}-${time}.json`;

  const files = await getDeptDir(token, owner, repo, branch, department);
  if (files.some(f => f.name.startsWith(`${date}-`))) return { duplicate: true, path };

  const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      message: `Add ${rulings.length} rulings for ${date} (Dept ${department})`,
      content,
      branch,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `GitHub API error ${res.status}`);
  }

  // Append to cache so the next duplicate check sees this file without a re-fetch
  files.push({ name: `${date}-${time}.json` });

  const json = await res.json();
  return { ok: true, path, sha: json.content?.sha };
}

// ── Bulk scraping state machine ───────────────────────────────────────────────
// State lives in chrome.storage.local._bulkJob so it survives popup close and
// service-worker restarts.
//
// Schema: {
//   runId,                       // monotonic ID; used to discard stale callbacks
//   running, done, fatalError,
//   dates[], index, currentDate,
//   tabId, settings, waitMs,
//   committed, skipped, errors,
//   waitingForTab,               // true while a navigation is in flight
// }

const BULK_ALARM = 'sfsc-bulk-next';

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === BULK_ALARM) bulkStep();
});

// When the SFTC tab finishes loading after a form-submit navigation,
// resume scraping immediately rather than waiting for the next alarm.
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status !== 'complete') return;
  const job = await readJob();
  if (!job?.running || !job.waitingForTab || job.tabId !== tabId) return;
  bulkScrapeAfterLoad(job);
});

async function readJob() {
  const { _bulkJob } = await chrome.storage.local.get('_bulkJob');
  return _bulkJob;
}

// Apply `mutator` to the latest job state, but ONLY if `runId` still matches —
// otherwise the in-flight callback was superseded by Stop or a new Start, and
// the update is silently discarded. Returns the new state, or null if discarded.
async function applyJobUpdate(runId, mutator) {
  const current = await readJob();
  if (!current?.running || current.runId !== runId) return null;
  const next = mutator({ ...current });
  await chrome.storage.local.set({ _bulkJob: next });
  return next;
}

async function startBulk({ dates, tabId, settings, waitMs }) {
  await chrome.alarms.clear(BULK_ALARM);
  const job = {
    runId: Date.now(),
    running: true, done: false, fatalError: null,
    dates, index: 0, currentDate: null,
    tabId, settings, waitMs: waitMs || 1000,
    committed: 0, skipped: 0, errors: 0,
    waitingForTab: false,
  };
  await chrome.storage.local.set({ _bulkJob: job });
  bulkStep();
  return { ok: true };
}

async function stopBulk() {
  await chrome.alarms.clear(BULK_ALARM);
  const current = await readJob();
  if (current) await chrome.storage.local.set({ _bulkJob: { ...current, running: false } });
  return { ok: true };
}

async function bulkStep() {
  const job = await readJob();
  if (!job?.running) return;

  if (job.index >= job.dates.length) {
    await chrome.storage.local.set({ _bulkJob: { ...job, running: false, done: true } });
    return;
  }

  const date = job.dates[job.index];
  await chrome.storage.local.set({ _bulkJob: { ...job, currentDate: date } });

  if (!await injectContentScript(job)) return;

  // fill-and-scrape may navigate (form submit reloads the page).
  // If it does, the message channel disconnects (lastError is set);
  // tabs.onUpdated → bulkScrapeAfterLoad will resume once the page loads.
  const result = await new Promise(resolve => {
    chrome.tabs.sendMessage(job.tabId, { action: 'fill-and-scrape', date, waitMs: job.waitMs }, r =>
      resolve(chrome.runtime.lastError ? { navigated: true } : r)
    );
  });

  if (result?.navigated) {
    await applyJobUpdate(job.runId, j => ({ ...j, currentDate: date, waitingForTab: true }));
    return;
  }

  await bulkHandleResult(job, date, result);
}

async function bulkScrapeAfterLoad(job) {
  if (!await injectContentScript(job)) return;
  await new Promise(r => setTimeout(r, 200));

  // One retry if content script isn't quite ready yet
  let data = await sendScrape(job.tabId);
  if (!data || data.error) {
    await new Promise(r => setTimeout(r, 400));
    data = await sendScrape(job.tabId);
  }
  await bulkHandleResult(job, job.currentDate, data);
}

async function sendScrape(tabId) {
  return new Promise(resolve =>
    chrome.tabs.sendMessage(tabId, { action: 'scrape' }, r =>
      resolve(chrome.runtime.lastError ? null : r)
    )
  );
}

async function injectContentScript(job) {
  try {
    await chrome.scripting.executeScript({ target: { tabId: job.tabId }, files: ['content.js'] });
    return true;
  } catch {
    await applyJobUpdate(job.runId, j => ({
      ...j, running: false, waitingForTab: false,
      fatalError: 'SFTC tab was closed. Reopen it and Resume.',
    }));
    return false;
  }
}

async function bulkHandleResult(job, date, data) {
  // Commit first — we can't unwind a network call, and duplicate detection
  // makes it idempotent on Resume. Then atomically advance the job state
  // (or discard the update if Stop landed during the commit).
  let outcome = 'errors';
  if (data?.sessionExpired) {
    outcome = 'session';
  } else if (data && !data.error && !data.pending) {
    try {
      const { token, repo, branch } = job.settings;
      const [owner, repoName] = repo.split('/');
      const res = await commitToGitHub({
        token, owner, repo: repoName, branch,
        data: { ...data, _date: date },
      });
      outcome = res.duplicate ? 'skipped' : 'committed';
    } catch {
      outcome = 'errors';
    }
  }

  const next = await applyJobUpdate(job.runId, j => {
    const u = { ...j, waitingForTab: false };
    if (outcome === 'session') {
      u.running = false;
      u.fatalError = 'Session has expired. Please log in again and Resume.';
      return u;
    }
    u[outcome]++;
    u.index++;
    if (u.index >= u.dates.length) { u.running = false; u.done = true; }
    return u;
  });

  if (next?.running) chrome.alarms.create(BULK_ALARM, { when: Date.now() + 300 });
}
