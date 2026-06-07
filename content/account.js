(async function initAccountHelper() {
  const CAPTURE_KEY = "aqwHelperCapturedInventoryPayload";
  const url = window.location.href.toLowerCase();
  const hasCharPageId = /[?&]id=/.test(url);
  const isInventoryPage = url.includes("/aqw/inventory");
  const isBuybackPage = url.includes("/aqw/buyback");
  const isManagePage = url.includes("/manage");

  if (!url.includes("account.aq.com")) {
    return;
  }

  async function fetchInventoryPayload() {
    const endpoints = ["/AQW/InventoryData", "/Aqw/InventoryData"];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(`${endpoint}?_=${Date.now()}`, {
          credentials: "include"
        });

        if (!response.ok) {
          continue;
        }

        const text = await response.text();
        const trimmed = text.trim();
        if (!trimmed || trimmed.startsWith("<")) {
          continue;
        }

        const payload = JSON.parse(text);
        if (payload) {
          return payload;
        }
      } catch (error) {
        // Ignore endpoints that return HTML or invalid payloads.
      }
    }

    return null;
  }

  async function fetchJsonFromUrl(urlToFetch) {
    try {
      const response = await fetch(urlToFetch, {
        credentials: "include",
        cache: "no-store"
      });

      if (!response.ok) {
        return null;
      }

      const text = await response.text();
      const trimmed = text.trim();
      if (!trimmed || trimmed.startsWith("<")) {
        return null;
      }

      return JSON.parse(text);
    } catch (_error) {
      return null;
    }
  }

  function readCellText(cell) {
    return (cell?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function looksLikeDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
  }

  function looksLikeItemType(value) {
    return /^(armor|axe|back item|bow|cape|class|dagger|floor item|gun|helm|house|item|mace|misc|necklace|pet|polearm|resource|staff|sword|wall item|wand|whip)$/i.test(String(value || "").trim());
  }

  function looksLikeInventoryName(value) {
    const text = String(value || "").trim();
    if (!text || text.length < 2) return false;
    if (/^(inventory item|quantity|type|bank|ac|member|date added|search)$/i.test(text)) return false;
    if (looksLikeDate(text) || looksLikeItemType(text)) return false;
    return /[a-z]/i.test(text);
  }

  function parseQuantity(value) {
    const quantity = Number.parseInt(String(value || "").replace(/[^\d]/g, ""), 10);
    return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
  }

  function cellHasCheck(cell) {
    if (!cell) return false;

    const checkbox = cell.querySelector?.("input[type='checkbox']");
    if (checkbox) {
      return Boolean(checkbox.checked || checkbox.getAttribute("checked") !== null);
    }

    const value = readCellText(cell).toLowerCase();
    return (
      Array.from(value).some((char) => [0x2713, 0x2714].includes(char.codePointAt(0))) ||
      value === "true" ||
      value === "yes"
    );
  }

  function getRowValue(row, keys, fallbackIndex = null) {
    if (Array.isArray(row)) {
      return fallbackIndex === null ? "" : row[fallbackIndex];
    }

    if (!row || typeof row !== "object") {
      return "";
    }

    const normalizedKeys = keys.map((key) => key.toLowerCase().replace(/[^a-z0-9]/g, ""));
    for (const [key, value] of Object.entries(row)) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (normalizedKeys.includes(normalizedKey)) {
        return value;
      }
    }

    return "";
  }

  function normalizeInventoryRow(row) {
    const rawName = String(getRowValue(row, ["name", "itemName", "inventoryItem", "item", "strName", "strItemName", "sName"], 0) || "").trim();
    if (!looksLikeInventoryName(rawName)) {
      return null;
    }

    let itemName = rawName;
    let quantity = parseQuantity(getRowValue(row, ["quantity", "qty", "intCount", "count", "iQty"], 1));
    const qtyMatch = rawName.match(/(.*?)\s+x(\d+)$/i);
    if (qtyMatch) {
      itemName = qtyMatch[1].trim();
      quantity = parseQuantity(qtyMatch[2]);
    }

    const bankValue = getRowValue(row, ["bank", "isBank", "banked", "bitBank", "bBank"], null);
    const locationValue = String(getRowValue(row, ["location", "where", "strLocation"], 3) || "").toLowerCase();
    const bankText = String(bankValue || "").toLowerCase();
    const isBanked = bankValue === true || bankValue === 1 || bankText.includes("bank") || bankText === "true" || locationValue.includes("bank");

    return {
      name: itemName,
      quantity,
      location: isBanked ? "Bank" : "Inventory",
      type: getRowValue(row, ["type", "category", "strType", "sType"], 2) || "",
      rawName
    };
  }

  function parseInventoryFromPayload(payload) {
    const candidates = [];

    function visit(value) {
      if (!value) {
        return;
      }

      if (Array.isArray(value)) {
        candidates.push(value);
        value.forEach(visit);
        return;
      }

      if (typeof value === "object") {
        Object.values(value).forEach(visit);
      }
    }

    visit(payload);

    let bestItems = [];
    for (const rows of candidates) {
      const items = rows
        .map((row) => {
          if (Array.isArray(row)) {
            return normalizeInventoryRow(row);
          }

          if (row && typeof row === "object") {
            return normalizeInventoryRow(row);
          }

          return null;
        })
        .filter(Boolean);

      if (items.length > bestItems.length) {
        bestItems = items;
      }
    }

    return bestItems;
  }

  function getPayloadTotalCount(payload) {
    if (!payload || typeof payload !== "object") {
      return 0;
    }

    const directValue =
      payload.totalCount ??
      payload.total ??
      payload.count ??
      payload.recordsTotal ??
      payload.TotalCount ??
      payload.Total ??
      payload.Count;

    const directTotal = Number.parseInt(directValue, 10);
    if (Number.isFinite(directTotal) && directTotal > 0) {
      return directTotal;
    }

    for (const value of Object.values(payload)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const nestedTotal = getPayloadTotalCount(value);
        if (nestedTotal > 0) {
          return nestedTotal;
        }
      }
    }

    return 0;
  }

  function mergeInventoryItems(target, source) {
    const seen = new Set(target.map((item) => `${normalizeItemName(item.name)}|${item.location || ""}`));

    for (const item of source) {
      const key = `${normalizeItemName(item.name)}|${item.location || ""}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      target.push(item);
    }

    return target;
  }

  async function fetchInventoryFromResourceHints() {
    const currentOrigin = window.location.origin;
    const urls = Array.from(new Set(
      performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((resourceUrl) => {
          try {
            const parsed = new URL(resourceUrl, window.location.href);
            const value = parsed.href.toLowerCase();
            return (
              parsed.origin === currentOrigin &&
              !value.includes(".css") &&
              !value.includes(".js") &&
              !value.includes(".png") &&
              !value.includes(".jpg") &&
              !value.includes(".jpeg") &&
              !value.includes(".gif") &&
              (
                value.includes("inventory") ||
                value.includes("buyback") ||
                value.includes("item")
              )
            );
          } catch (_error) {
            return false;
          }
        })
    ));

    for (const resourceUrl of urls) {
      const payload = await fetchJsonFromUrl(resourceUrl);
      const items = parseInventoryFromPayload(payload);
      if (items.length) {
        return items;
      }
    }

    return [];
  }

  function parseInventoryFromBrowserStorage() {
    const sources = [window.localStorage, window.sessionStorage].filter(Boolean);
    let bestItems = [];

    for (const source of sources) {
      for (let index = 0; index < source.length; index += 1) {
        const key = source.key(index) || "";
        const value = source.getItem(key) || "";
        if (!/inventory|item|aqw|account|grid/i.test(`${key} ${value.slice(0, 120)}`)) {
          continue;
        }

        try {
          const items = parseInventoryFromPayload(JSON.parse(value));
          if (items.length > bestItems.length) {
            bestItems = items;
          }
        } catch (_error) {}
      }
    }

    return bestItems;
  }

  function getCapturedInventoryPayload() {
    return new Promise((resolve) => {
      chrome.storage.local.get([CAPTURE_KEY], (result) => {
        const capture = result[CAPTURE_KEY];
        if (!capture?.payload) {
          resolve(null);
          return;
        }

        resolve(capture);
      });
    });
  }

  async function fetchAllCapturedInventoryPages(capture) {
    if (!capture?.url) {
      return [];
    }

    let urlToFetch;
    try {
      urlToFetch = new URL(capture.url, window.location.origin);
    } catch (_error) {
      return [];
    }

    if (!urlToFetch.href.toLowerCase().includes("inventory")) {
      return [];
    }

    const firstItems = parseInventoryFromPayload(capture.payload);
    const totalCount = getPayloadTotalCount(capture.payload);
    const takeFromUrl = Number.parseInt(urlToFetch.searchParams.get("take"), 10);
    const pageSize = Number.isFinite(takeFromUrl) && takeFromUrl > 0 ? takeFromUrl : Math.max(firstItems.length, 100);
    const targetTotal = totalCount > 0 ? totalCount : firstItems.length;

    if (!firstItems.length || targetTotal <= firstItems.length) {
      return firstItems;
    }

    const allItems = [...firstItems];
    urlToFetch.searchParams.set("take", String(pageSize));
    urlToFetch.searchParams.set("requireTotalCount", "true");

    for (let skip = pageSize; skip < targetTotal && skip < 50000; skip += pageSize) {
      urlToFetch.searchParams.set("skip", String(skip));
      const payload = await fetchJsonFromUrl(urlToFetch.href);
      const pageItems = parseInventoryFromPayload(payload);
      if (!pageItems.length) {
        break;
      }

      mergeInventoryItems(allItems, pageItems);
      console.log(`[AQW Helper] Inventario pagina capturada: ${allItems.length}/${targetTotal}`);
    }

    return allItems;
  }

  async function saveInventoryItems(items, source) {
    const currentItems = await getInventoryData();
    if (Array.isArray(currentItems) && currentItems.length > items.length && source !== "endpoint" && !source.startsWith("captured")) {
      console.warn(`[AQW Helper] Sincronizacao ignorada para nao trocar ${currentItems.length} itens por ${items.length} (${source}).`);
      return false;
    }

    await setInventoryData(items);
    await setInventoryMeta({
      itemCount: items.length,
      source,
      syncedAt: new Date().toISOString()
    });
    console.log(`[AQW Helper] Inventario sincronizado: ${items.length} itens (${source}).`);
    return true;
  }

  function parseInventoryFromTable() {
    const rows = Array.from(document.querySelectorAll("table tr, [role='row'], .k-grid-content tr, .k-master-row, .mud-table-row"));
    const items = [];

    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll("td, th, [role='gridcell'], [role='columnheader']"));
      if (cells.length < 3) {
        continue;
      }

      const name = readCellText(cells[0]);
      if (!name || /^inventory item$/i.test(name) || /^search/i.test(name)) {
        continue;
      }

      const type = readCellText(cells[2]);
      const dateAdded = readCellText(cells[6]);
      if (!type && !dateAdded && !cellHasCheck(cells[3]) && !cellHasCheck(cells[4])) {
        continue;
      }

      const item = normalizeInventoryRow({
        name,
        quantity: readCellText(cells[1]),
        type,
        bank: cellHasCheck(cells[3])
      });

      if (item) {
        items.push(item);
      }
    }

    return items;
  }

  function parseInventoryFromVisibleTextRows() {
    const root =
      document.querySelector(".k-grid-content, .k-grid-table, .mud-table, table, [role='grid'], [role='table']") ||
      document.querySelector("main, #main-content, .container, body");

    if (!root) {
      return [];
    }

    const rowCandidates = Array.from(root.querySelectorAll("tr, [role='row'], li, div"))
      .filter((node) => {
        const text = readCellText(node);
        return looksLikeDate(text) && looksLikeItemType(text) && looksLikeInventoryName(text.split(/\s+/).slice(0, -3).join(" "));
      });

    const items = [];
    const seen = new Set();

    for (const row of rowCandidates) {
      const text = readCellText(row);
      if (!text || /inventory item\s+quantity\s+type/i.test(text)) {
        continue;
      }

      const dateMatch = text.match(/\b\d{4}-\d{2}-\d{2}\b/);
      if (!dateMatch) {
        continue;
      }

      const beforeDate = text.slice(0, dateMatch.index).trim();
      const typeMatch = beforeDate.match(/\b(Armor|Axe|Back Item|Bow|Cape|Class|Dagger|Floor Item|Gun|Helm|House|Item|Mace|Misc|Necklace|Pet|Polearm|Resource|Staff|Sword|Wall Item|Wand|Whip)\b/i);
      if (!typeMatch) {
        continue;
      }

      const nameAndQuantity = beforeDate.slice(0, typeMatch.index).trim();
      const quantityMatch = nameAndQuantity.match(/^(.*?)\s+(\d+)$/);
      const name = (quantityMatch ? quantityMatch[1] : nameAndQuantity).trim();
      const quantity = quantityMatch ? quantityMatch[2] : 1;
      if (!looksLikeInventoryName(name)) {
        continue;
      }

      const key = normalizeItemName(name);
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      const item = normalizeInventoryRow({
        name,
        quantity,
        type: typeMatch[1],
        bank: text.includes(String.fromCodePoint(0x2713)) || text.includes(String.fromCodePoint(0x2714))
      });

      if (item) {
        items.push(item);
      }
    }

    return items;
  }

  async function syncInventory() {
    try {
      const json = await fetchInventoryPayload();
      const allItems = parseInventoryFromPayload(json);
      let source = allItems.length ? "endpoint" : "";

      if (!allItems.length) {
        const captured = await getCapturedInventoryPayload();
        allItems.push(...await fetchAllCapturedInventoryPages(captured));
        source = allItems.length ? `captured-pages:${captured.url || "unknown"}` : source;
      }

      if (!allItems.length) {
        allItems.push(...parseInventoryFromBrowserStorage());
        source = allItems.length ? "browser-storage" : source;
      }

      if (!allItems.length) {
        allItems.push(...await fetchInventoryFromResourceHints());
        source = allItems.length ? "resource" : source;
      }

      if (!allItems.length) {
        allItems.push(...parseInventoryFromTable());
        source = allItems.length ? "table" : source;
      }

      if (!allItems.length) {
        allItems.push(...parseInventoryFromVisibleTextRows());
        source = allItems.length ? "visible-text" : source;
      }

      if (!allItems.length) {
        return;
      }

      return await saveInventoryItems(allItems, source);
    } catch (error) {
    }

    return false;
  }

  function scheduleInventorySync() {
    let attempts = 0;
    const maxAttempts = 10;

    const run = async () => {
      attempts += 1;
      const synced = await syncInventory();
      if (!synced && attempts < maxAttempts) {
        setTimeout(run, 1000);
      }
    };

    run();
  }

  if (isInventoryPage || isBuybackPage || isManagePage) {
    scheduleInventorySync();
  }
})();
