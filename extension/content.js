// PragmaOS PJe Extension — content script.
// Runs on PJe pages, detects case numbers and scrapes movements.

// Detect CNJ number from the page.
function detectCaseNumber() {
  // CNJ format: NNNNNNN-DD.AAAA.J.TR.OOOO
  const cnjRegex = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/;
  const bodyText = document.body.innerText;
  const match = bodyText.match(cnjRegex);
  return match ? match[0] : null;
}

// Scrape movements from the page.
function scrapeMovements() {
  const movements = [];
  const documents = [];

  // PJe typically uses tables for movements.
  // The exact selectors depend on the PJe version, but we try common patterns.
  const movementRows = document.querySelectorAll("table tbody tr, .movimentacao tr, #movimentacoes tr");

  movementRows.forEach((row) => {
    const cells = row.querySelectorAll("td");
    if (cells.length >= 2) {
      const date = cells[0]?.textContent?.trim();
      const description = cells[1]?.textContent?.trim();
      if (date && description && date.match(/\d{2}\/\d{2}\/\d{4}/)) {
        movements.push({
          date: date,
          description: description.slice(0, 500),
          content: cells[1]?.innerHTML ?? "",
        });
      }
    }
  });

  // Scrape document links.
  const docLinks = document.querySelectorAll("a[href*='documento'], a[href*='download'], a[title*='Documento']");
  docLinks.forEach((link) => {
    const title = link.textContent?.trim() || link.getAttribute("title") || "Documento";
    const href = link.getAttribute("href");
    if (href) {
      documents.push({
        title: title,
        url: href.startsWith("http") ? href : window.location.origin + href,
        type: "outro",
      });
    }
  });

  return { movements, documents };
}

// Listen for messages from popup.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "detectCase") {
    sendResponse({ caseNumber: detectCaseNumber() });
  } else if (request.action === "scrapeMovements") {
    sendResponse(scrapeMovements());
  }
  return true;
});
