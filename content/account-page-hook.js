(function installAqwInventoryPageHook() {
  const MESSAGE_SOURCE = "AQW_HELPER_ACCOUNT_CAPTURE";

  function shouldCapture(url) {
    const value = String(url || "").toLowerCase();
    return (
      value.includes("inventory") ||
      value.includes("buyback") ||
      value.includes("items")
    );
  }

  function postPayload(url, text) {
    if (!shouldCapture(url) || !text || String(text).trim().startsWith("<")) {
      return;
    }

    try {
      window.postMessage({
        source: MESSAGE_SOURCE,
        url: String(url || ""),
        payload: JSON.parse(text)
      }, "*");
    } catch (_error) {}
  }

  function getObjectValue(row, names) {
    if (!row || typeof row !== "object") return "";

    const wanted = names.map((name) => name.toLowerCase().replace(/[^a-z0-9]/g, ""));
    for (const [key, value] of Object.entries(row)) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (wanted.includes(normalizedKey)) {
        return value;
      }
    }

    return "";
  }

  function normalizeCandidateRow(row) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return null;
    }

    const name = String(getObjectValue(row, [
      "name",
      "item",
      "itemName",
      "inventoryItem",
      "strName",
      "strItemName",
      "sName"
    ]) || "").trim();

    if (!name || /^(inventory item|search)$/i.test(name)) {
      return null;
    }

    const type = getObjectValue(row, ["type", "category", "strType", "sType"]);
    const quantity = getObjectValue(row, ["quantity", "qty", "intCount", "count", "iQty"]) || 1;
    const bank = getObjectValue(row, ["bank", "isBank", "banked", "bitBank", "bBank"]);
    const location = getObjectValue(row, ["location", "where", "strLocation"]);

    return {
      name,
      quantity,
      type,
      bank,
      location,
      rawName: name
    };
  }

  function collectRowsFromValue(value, state) {
    if (!value || state.visited.has(value) || state.nodes > 2500 || state.rows.length > 10000) {
      return;
    }

    if (typeof value !== "object") {
      return;
    }

    state.visited.add(value);
    state.nodes += 1;

    if (Array.isArray(value)) {
      const rows = value.map(normalizeCandidateRow).filter(Boolean);
      if (rows.length > state.rows.length) {
        state.rows = rows;
      }

      value.slice(0, 300).forEach((entry) => collectRowsFromValue(entry, state));
      return;
    }

    for (const key of Object.keys(value).slice(0, 80)) {
      try {
        collectRowsFromValue(value[key], state);
      } catch (_error) {}
    }
  }

  function scanPageStateForInventory() {
    const state = {
      visited: new WeakSet(),
      nodes: 0,
      rows: []
    };

    const preferredKeys = Object.keys(window).filter((key) =>
      /inventory|item|grid|account|aqw|blazor|kendo/i.test(key)
    );

    for (const key of preferredKeys) {
      try {
        collectRowsFromValue(window[key], state);
      } catch (_error) {}
    }

    if (state.rows.length) {
      window.postMessage({
        source: MESSAGE_SOURCE,
        url: "window-state:inventory",
        payload: { data: state.rows }
      }, "*");
    }
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    window.fetch = async function aqwHelperFetch(input, init) {
      const response = await originalFetch.apply(this, arguments);
      const requestUrl = typeof input === "string" ? input : input?.url;

      if (shouldCapture(requestUrl)) {
        response.clone().text().then((text) => postPayload(requestUrl, text)).catch(() => {});
      }

      return response;
    };
  }

  const xhrPrototype = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
  if (xhrPrototype && typeof xhrPrototype.open === "function") {
    const originalOpen = xhrPrototype.open;
    const originalSend = xhrPrototype.send;

    xhrPrototype.open = function aqwHelperOpen(method, url) {
      this.__aqwHelperUrl = url;
      return originalOpen.apply(this, arguments);
    };

    xhrPrototype.send = function aqwHelperSend() {
      this.addEventListener("load", () => {
        if (shouldCapture(this.__aqwHelperUrl)) {
          postPayload(this.__aqwHelperUrl, this.responseText);
        }
      });

      return originalSend.apply(this, arguments);
    };
  }

  setTimeout(scanPageStateForInventory, 1500);
  setTimeout(scanPageStateForInventory, 4000);
  setTimeout(scanPageStateForInventory, 8000);
})();
