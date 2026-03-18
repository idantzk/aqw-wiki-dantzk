(async function initAccountHelper() {
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
        if (payload && Array.isArray(payload.data)) {
          return payload;
        }
      } catch (error) {
        // Ignore endpoints that return HTML or invalid payloads.
      }
    }

    return null;
  }

  async function syncInventory() {
    try {
      const json = await fetchInventoryPayload();
      if (!json || !Array.isArray(json.data)) {
        return;
      }

      const allItems = [];

      for (const row of json.data) {
        const rawName = row?.[0] || "";
        let itemName = rawName;
        let quantity = 1;

        const qtyMatch = rawName.match(/(.*?)\s+x(\d+)$/i);
        if (qtyMatch) {
          itemName = qtyMatch[1].trim();
          quantity = Number.parseInt(qtyMatch[2], 10) || 1;
        }

        allItems.push({
          name: itemName,
          quantity,
          location: row?.[3] || "Inventory",
          rawName
        });
      }

      if (!allItems.length) {
        return;
      }

      await setInventoryData(allItems);
      await setInventoryMeta({
        itemCount: allItems.length,
        syncedAt: new Date().toISOString()
      });
      console.log(`[AQW Helper] Inventario sincronizado: ${allItems.length} itens.`);
    } catch (error) {
      console.error("[AQW Helper] Erro ao sincronizar inventario:", error);
    }
  }

  if (isInventoryPage || isBuybackPage || isManagePage) {
    syncInventory();
  }
})();
