document.addEventListener("DOMContentLoaded", () => {
  const openWikiButton = document.getElementById("openWiki");
  const openInventoryButton = document.getElementById("openInventory");
  const openCharPageButton = document.getElementById("openCharPage");
  const openFarmadorButton = document.getElementById("openFarmador");
  const syncStatus = document.getElementById("syncStatus");
  const wikiDataStatus = document.getElementById("wikiDataStatus");
  const updateWikiDataButton = document.getElementById("updateWikiData");

  function formatSyncStatus(meta) {
    if (!meta || !meta.syncedAt) {
      return "Nenhuma sincronizacao encontrada ainda.";
    }

    const date = new Date(meta.syncedAt);
    const formattedDate = Number.isNaN(date.getTime())
      ? meta.syncedAt
      : date.toLocaleString("pt-BR");
    const itemCount = Number.isFinite(meta.itemCount) ? meta.itemCount : 0;

    return `Ultima sincronizacao: ${formattedDate} (${itemCount} itens).`;
  }

  function formatWikiDataStatus(meta) {
    if (!meta || !meta.updatedAt) {
      return "Base online ainda nao foi baixada. A extensao vai usar o arquivo local.";
    }

    const date = new Date(meta.updatedAt);
    const formattedDate = Number.isNaN(date.getTime())
      ? meta.updatedAt
      : date.toLocaleString("pt-BR");
    const itemCount = Number.isFinite(meta.itemCount) ? meta.itemCount : 0;

    return `Base atualizada em: ${formattedDate} (${itemCount} itens).`;
  }

  async function openTab(url) {
    await chrome.tabs.create({ url });
    window.close();
  }

  if (openWikiButton) {
    openWikiButton.addEventListener("click", () => {
      openTab("https://aqwwiki.wikidot.com/");
    });
  }

  if (openInventoryButton) {
    openInventoryButton.addEventListener("click", () => {
      openTab("https://account.aq.com/AQW/Inventory");
    });
  }

  if (openCharPageButton) {
    openCharPageButton.addEventListener("click", () => {
      openTab("https://account.aq.com/CharPage");
    });
  }

  if (openFarmadorButton) {
    openFarmadorButton.addEventListener("click", () => {
      openTab(chrome.runtime.getURL("farmador/index.html"));
    });
  }

  chrome.storage.local.get(["aqwHelperMeta"], (result) => {
    if (!syncStatus) return;
    syncStatus.textContent = formatSyncStatus(result.aqwHelperMeta || null);
  });

  chrome.storage.local.get(["aqwHelperWikiMeta"], (result) => {
    if (!wikiDataStatus) return;
    wikiDataStatus.textContent = formatWikiDataStatus(result.aqwHelperWikiMeta || null);
  });

  if (updateWikiDataButton) {
    updateWikiDataButton.addEventListener("click", async () => {
      if (wikiDataStatus) {
        wikiDataStatus.textContent = "Baixando base do GitHub...";
      }

      updateWikiDataButton.disabled = true;

      try {
        const response = await fetch(AQW_HELPER_WIKI_DATA_URL, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        if (!data || typeof data !== "object" || Array.isArray(data)) {
          throw new Error("JSON invalido");
        }

        const meta = {
          updatedAt: new Date().toISOString(),
          itemCount: Object.keys(data).length,
          source: AQW_HELPER_WIKI_DATA_URL
        };

        await chrome.storage.local.set({
          aqwHelperWikiData: data,
          aqwHelperWikiMeta: meta
        });

        if (wikiDataStatus) {
          wikiDataStatus.textContent = formatWikiDataStatus(meta);
        }
      } catch (error) {
        if (wikiDataStatus) {
          wikiDataStatus.textContent = `Falha ao atualizar base: ${error.message}`;
        }
      } finally {
        updateWikiDataButton.disabled = false;
      }
    });
  }
});
