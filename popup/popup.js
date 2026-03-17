document.addEventListener("DOMContentLoaded", () => {
  const openWikiButton = document.getElementById("openWiki");
  const openInventoryButton = document.getElementById("openInventory");
  const openCharPageButton = document.getElementById("openCharPage");
  const syncStatus = document.getElementById("syncStatus");

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

  chrome.storage.local.get(["aqwHelperMeta"], (result) => {
    if (!syncStatus) return;
    syncStatus.textContent = formatSyncStatus(result.aqwHelperMeta || null);
  });
});
