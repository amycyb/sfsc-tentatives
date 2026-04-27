// Scrapes the SFSC tentative rulings page and returns structured data.
// Runs on: https://webapps.sftc.org/tr/tr.dll*

function scrape() {
  const container = document.getElementById('resultsRulings');
  if (!container) {
    return { error: 'No results block found. Run a search on this page first.' };
  }

  const countEl = document.getElementById('resultsCount');
  const totalText = countEl ? countEl.textContent : '';
  const totalMatch = totalText.match(/\d+/);
  const reportedTotal = totalMatch ? parseInt(totalMatch[0]) : null;

  // Detect department from <h4> text, e.g. "Law & Motion/Discovery Department 302"
  const h4 = document.querySelector('h4');
  let department = '302';
  if (h4) {
    const m = h4.textContent.match(/Department\s+(\d+)/i);
    if (m) department = m[1];
  }

  const rulings = [];
  let current = {};

  for (const tr of container.querySelectorAll('tr')) {
    const headerTd = tr.querySelector('td.dataHeader');
    if (!headerTd) {
      // Separator row — save current ruling if it has a case number
      if (current['Case Number']) {
        rulings.push({ ...current });
        current = {};
      }
      continue;
    }

    const field = headerTd.textContent.replace(':', '').trim();
    const tds   = tr.querySelectorAll('td');
    // Structure: <td class="dataHeader"> <td></td> <td>VALUE</td>
    const valueTd = tds[2] || tds[tds.length - 1];
    const value   = valueTd ? valueTd.innerText.trim() : '';

    if (['Case Number', 'Case Title', 'Court Date', 'Calendar Matter', 'Rulings'].includes(field)) {
      current[field] = value;
    }
  }
  // Capture last ruling if page doesn't end with a separator
  if (current['Case Number']) {
    rulings.push({ ...current });
  }

  return {
    department,
    scraped_at:  new Date().toISOString(),
    source_url:  window.location.href,
    reported_total: reportedTotal,
    rulings,
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  if (msg.action === 'scrape') {
    respond(scrape());
  }
  return true; // keep channel open for async
});
