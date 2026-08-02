// PragmaOS PJe Extension — background service worker.
// Handles extension lifecycle and message routing.

chrome.runtime.onInstalled.addListener(() => {
  console.log("PragmaOS PJe Extension installed.");
});
