// Service worker: handles GitHub API commits.

chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  if (msg.action === 'commit') {
    commitToGitHub(msg.payload).then(respond).catch(err => respond({ error: err.message }));
    return true;
  }
});

// ── Duplicate detection ───────────────────────────────────────────────────────

let _rawDirCache = null;
let _rawDirTime  = 0;

async function getRawDir(token, owner, repo, branch) {
  if (_rawDirCache && Date.now() - _rawDirTime < 60_000) return _rawDirCache;
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/raw?ref=${branch}`,
    { headers: { Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  _rawDirCache = Array.isArray(data) ? data : [];
  _rawDirTime  = Date.now();
  return _rawDirCache;
}

async function isDuplicate(token, owner, repo, branch, date, department) {
  const files = await getRawDir(token, owner, repo, branch);
  return files.some(f => f.name.startsWith(`${date}-dept${department}-`));
}

// ── Commit ────────────────────────────────────────────────────────────────────

async function commitToGitHub({ token, owner, repo, branch, data }) {
  const { department, scraped_at, rulings } = data;

  const now  = new Date(scraped_at);
  const date = now.toISOString().slice(0, 10);
  const time = now.toISOString().slice(11, 19).replace(/:/g, '');
  const path = `raw/${date}-dept${department}-${time}.json`;

  // Refuse silently-duplicate submissions
  if (await isDuplicate(token, owner, repo, branch, date, department)) {
    return { duplicate: true, path };
  }

  const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: {
      Authorization:        `Bearer ${token}`,
      'Content-Type':       'application/json',
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

  _rawDirCache = null; // invalidate so next call re-fetches
  const json = await res.json();
  return { ok: true, path, sha: json.content?.sha };
}
