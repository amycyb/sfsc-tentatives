// popup.js — runs in the extension popup.

const $ = id => document.getElementById(id);
let scrapedData = null;

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

// ── On open: scrape current tab ───────────────────────────────────────────────
async function init() {
  setStatus('Checking page…', 'loading');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab.url?.includes('webapps.sftc.org/tr/')) {
    setStatus('Navigate to the SFSC Tentative Rulings page first.', 'warn');
    return;
  }

  // Inject content script if not already there
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js'],
    });
  } catch (_) { /* already injected */ }

  chrome.tabs.sendMessage(tab.id, { action: 'scrape' }, result => {
    if (chrome.runtime.lastError || !result) {
      setStatus('Could not read page. Refresh and try again.', 'error');
      return;
    }
    if (result.error) {
      setStatus(result.error, 'warn');
      return;
    }

    scrapedData = result;
    const n = result.rulings.length;
    const dept = result.department;

    if (n === 0) {
      setStatus('No rulings found on this page.', 'warn');
      return;
    }

    const warn = result.reported_total && result.reported_total !== n
      ? ` (page reports ${result.reported_total} — scroll to load all)`
      : '';

    setStatus(`Found ${n} ruling${n !== 1 ? 's' : ''} — Dept ${dept}.${warn}`,
              warn ? 'warn' : '');
    $('send-btn').disabled = false;
  });
}

// ── Send to GitHub ────────────────────────────────────────────────────────────
$('send-btn').addEventListener('click', async () => {
  if (!scrapedData) return;
  $('send-btn').disabled = true;
  setStatus('Committing to GitHub…', 'loading');

  const s = await loadSettings();
  const err = validateSettings(s);
  if (err) { setStatus(err, 'error'); $('send-btn').disabled = false; return; }

  const [owner, repo] = s.repo.split('/');
  chrome.runtime.sendMessage(
    {
      action: 'commit',
      payload: {
        token:  s.token,
        owner,
        repo,
        branch: s.branch || 'master',
        data:   scrapedData,
      },
    },
    res => {
      if (res?.error) {
        setStatus('Error: ' + res.error, 'error');
        $('send-btn').disabled = false;
      } else {
        setStatus(`✓ Committed ${scrapedData.rulings.length} rulings → ${res.path}`, 'success');
      }
    }
  );
});

// ── Settings panel ────────────────────────────────────────────────────────────
$('settings-btn').addEventListener('click', async () => {
  const panel = $('settings');
  const open  = panel.style.display === 'block';
  panel.style.display = open ? 'none' : 'block';
  if (!open) {
    const s = await loadSettings();
    $('token').value  = s.token  || '';
    $('repo').value   = s.repo   || 'amitabho/sfsc-tentatives';
    $('branch').value = s.branch || 'master';
  }
});

$('save-btn').addEventListener('click', () => {
  chrome.storage.local.set({
    token:  $('token').value.trim(),
    repo:   $('repo').value.trim(),
    branch: $('branch').value.trim() || 'master',
  }, () => {
    $('settings').style.display = 'none';
    setStatus('Settings saved.', 'success');
    setTimeout(init, 800);
  });
});

// ── Boot ──────────────────────────────────────────────────────────────────────
init();
