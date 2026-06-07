(function installAqwInventoryHook() {
  const CAPTURE_KEY = "aqwHelperCapturedInventoryPayload";
  const MESSAGE_SOURCE = "AQW_HELPER_ACCOUNT_CAPTURE";

  function shouldCapture(url) {
    const value = String(url || "").toLowerCase();
    return (
      value.includes("inventory") ||
      value.includes("buyback") ||
      value.includes("items")
    );
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== MESSAGE_SOURCE) {
      return;
    }

    const payload = event.data.payload;
    const url = event.data.url || "";
    if (!payload || !shouldCapture(url)) {
      return;
    }

    chrome.storage.local.set({
      [CAPTURE_KEY]: {
        url,
        payload,
        capturedAt: new Date().toISOString()
      }
    });
  });
})();
