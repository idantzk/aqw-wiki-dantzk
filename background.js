chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "fetchHtml") {
    fetch(message.url)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.text();
      })
      .then((html) => sendResponse({ ok: true, html }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));

    return true;
  }

  if (message.acao === "buscarHTML") {
    fetch(message.url)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.text();
      })
      .then((html) => sendResponse({ sucesso: true, html }))
      .catch((error) => sendResponse({ sucesso: false, erro: error.message }));

    return true;
  }

  if (message.action === "fetchArtixCalendar") {
    fetch("https://www.artix.com/calendar/")
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.text();
      })
      .then((html) => sendResponse({ success: true, data: html }))
      .catch((error) => sendResponse({ success: false, error: error.message }));

    return true;
  }
});
