// Throwaway S5 service worker: opens the panel only.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
