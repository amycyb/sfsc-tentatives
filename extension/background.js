// Service worker: handles GitHub API commits.

chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  if (msg.action === 'commit') {
    commitToGitHub(msg.payload).then(respond).catch(err => respond({ error: err.message }));
    return true; // async
  }
});

async function commitToGitHub({ token, owner, repo, branch, data }) {
  const { department, scraped_at, rulings } = data;

  // Build filename: raw/YYYY-MM-DD-dept302-HHmmss.json
  const now    = new Date(scraped_at);
  const date   = now.toISOString().slice(0, 10);
  const time   = now.toISOString().slice(11, 19).replace(/:/g, '');
  const path   = `raw/${date}-dept${department}-${time}.json`;

  const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));

  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
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

  const json = await res.json();
  return { ok: true, path, sha: json.content?.sha };
}
