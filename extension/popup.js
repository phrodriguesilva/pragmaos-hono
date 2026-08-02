// PragmaOS PJe Extension — popup logic.

document.addEventListener("DOMContentLoaded", async () => {
  const status = document.getElementById("status");
  const caseInfo = document.getElementById("case-info");
  const caseNumber = document.getElementById("case-number");
  const captureBtn = document.getElementById("capture");
  const settingsBtn = document.getElementById("settings");
  const result = document.getElementById("result");
  const openLink = document.getElementById("open-pragmaos");

  // Load settings.
  const { pragmaosUrl = "", pragmaosApiKey = "" } = await chrome.storage.sync.get(["pragmaosUrl", "pragmaosApiKey"]);

  if (!pragmaosUrl || !pragmaosApiKey) {
    status.textContent = "Configure em Configuracoes";
    status.className = "status disconnected";
    settingsBtn.onclick = () => chrome.runtime.openOptionsPage();
    return;
  }

  status.textContent = `Conectado a ${pragmaosUrl}`;
  status.className = "status connected";
  openLink.onclick = () => chrome.tabs.create({ url: pragmaosUrl });

  // Get active tab and check if it's PJe.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (tab && tab.url && tab.url.match(/pje\.(jus|trt|tj|trf)\.jus\.br/)) {
    // Inject content script to detect case number.
    chrome.tabs.sendMessage(tab.id, { action: "detectCase" }, (response) => {
      if (chrome.runtime.lastError) {
        // Content script not loaded yet — inject manually.
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"],
        }, () => {
          chrome.tabs.sendMessage(tab.id, { action: "detectCase" }, (retryResponse) => {
            handleCaseDetection(retryResponse);
          });
        });
      } else {
        handleCaseDetection(response);
      }
    });
  } else {
    status.textContent = "Nao estamos em uma pagina PJe";
    status.className = "status disconnected";
  }

  function handleCaseDetection(response) {
    if (response && response.caseNumber) {
      caseInfo.style.display = "block";
      caseNumber.textContent = response.caseNumber;
      captureBtn.disabled = false;
      captureBtn.onclick = () => captureMovements(tab.id, response.caseNumber, pragmaosUrl, pragmaosApiKey);
    }
  }

  settingsBtn.onclick = () => chrome.runtime.openOptionsPage();

  async function captureMovements(tabId, cnj, url, apiKey) {
    captureBtn.disabled = true;
    captureBtn.textContent = "Capturando...";
    result.innerHTML = "";

    // Ask content script to scrape movements.
    chrome.tabs.sendMessage(tabId, { action: "scrapeMovements" }, async (movements) => {
      if (chrome.runtime.lastError || !movements) {
        result.innerHTML = '<div class="result error">Erro ao capturar movimentos da pagina.</div>';
        captureBtn.disabled = false;
        captureBtn.textContent = "Capturar Andamentos";
        return;
      }

      // Send to PragmaOS API.
      try {
        const resp = await fetch(`${url}/api/v1/extension/capture`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            case_number: cnj,
            source: "pje_extension",
            movements: movements.movements || [],
            documents: movements.documents || [],
          }),
        });

        const data = await resp.json();

        if (resp.ok && data.success) {
          const c = data.captured;
          result.innerHTML = `<div class="result success">Capturado: ${c.movements} movimento(s), ${c.documents} documento(s).</div>`;
        } else {
          result.innerHTML = `<div class="result error">${data.error || "Erro ao enviar para o PragmaOS."}</div>`;
        }
      } catch (err) {
        result.innerHTML = `<div class="result error">Erro de conexao: ${err.message}</div>`;
      }

      captureBtn.disabled = false;
      captureBtn.textContent = "Capturar Andamentos";
    });
  }
});
