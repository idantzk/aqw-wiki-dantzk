let filteredItems = [];
let currentIndex = 0;
const limitPerBatch = 250;

let hardFarmData = {};
let classesData = {};
let wikiData = {};
let fastInventorySet = new Set();
let inventoryIndex = new Map();
const previewCache = new Map();
let previewTimer = null;
let activePreviewHref = "";

const previewBox = document.createElement("div");
previewBox.className = "farm-preview";
document.body.appendChild(previewBox);

function extractProperty(itemArray, propertyName) {
  return itemArray.find((item) => Array.isArray(item) && item[0] === propertyName) || null;
}

function getBaseName(itemName) {
  return normalizeItemName(itemName);
}

function buildOwnershipMarkup(itemName, fullUrl) {
  const hasOwnedItem = fastInventorySet.has(getBaseName(itemName));
  const markClass = hasOwnedItem ? "have" : "missing";
  const markText = hasOwnedItem ? "✔" : "X";
  const markTitle = hasOwnedItem ? "Voce tem este item" : "Voce nao tem este item";
  const location = hasOwnedItem ? getBestLocation(inventoryIndex, itemName) : null;

  let icons = "";
  if (location === "inventory") {
    icons += `<img src="${chrome.runtime.getURL("images/inventory.png")}" alt="Inventario" title="No inventario">`;
  } else if (location === "bank") {
    icons += `<img src="${chrome.runtime.getURL("images/bank.png")}" alt="Banco" title="No banco">`;
  }

  return `
    <div class="farm-item-cell">
      <span class="farm-item-mark ${markClass}" title="${markTitle}">${markText}</span>
      <a class="farm-item-link" href="${fullUrl}" target="_blank" rel="noopener noreferrer">
        <strong>${itemName}</strong>
        ${icons}
      </a>
    </div>
  `;
}

function setStatus(message) {
  const status = document.getElementById("farmadorStatus");
  if (status) {
    status.textContent = message;
  }
}

function hidePreview() {
  previewBox.classList.remove("visible");
  previewBox.innerHTML = "";
}

function isValidPreviewImage(src) {
  const value = String(src || "").toLowerCase();
  if (!value) return false;
  if (!/\.(png|jpg|jpeg|gif|webp)(\?|$)/.test(value)) return false;
  if (value.includes("/image-tags/")) return false;
  if (value.includes("acsmall") || value.includes("aclarge")) return false;
  if (value.includes("raresmall") || value.includes("rarelarge")) return false;
  if (value.includes("legendsmall") || value.includes("legendlarge")) return false;
  if (value.includes("membersmall") || value.includes("memberlarge")) return false;
  if (value.includes("/map/") || value.includes("/npc/")) return false;
  return true;
}

function normalizePreviewImageUrl(src) {
  const value = String(src || "").trim();
  if (!value) return "";
  if (value.startsWith("//")) return `https:${value}`;
  if (value.startsWith("/")) return `https://aqwwiki.wikidot.com${value}`;
  return value.replace("http://", "https://");
}

function getImageCandidateSrc(img) {
  if (!img) return "";
  return (
    img.getAttribute("src") ||
    img.getAttribute("data-src") ||
    img.getAttribute("data-lazy-src") ||
    img.getAttribute("data-original") ||
    img.currentSrc ||
    ""
  );
}

function extractPreviewImagesFromHtml(html) {
  const images = [];
  const pushImage = (src) => {
    const normalized = normalizePreviewImageUrl(src);
    if (!normalized || !isValidPreviewImage(normalized) || images.includes(normalized)) {
      return;
    }
    images.push(normalized);
  };

  const imgRegex = /<img[^>]+(?:src|data-src|data-lazy-src|data-original)="([^"]+)"[^>]*>/gi;
  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    pushImage(match[1]);
  }

  const hrefImgRegex = /https?:\/\/(?:i\.imgur\.com|imgur\.com|cdn\.wikimg\.net|de37si2544cgmp\.cloudfront\.net|wdfiles\.com)\/[^\s"'<>]+\.(?:png|jpg|jpeg|gif|webp)/gi;
  while ((match = hrefImgRegex.exec(html)) !== null) {
    pushImage(match[0]);
  }

  return images;
}

function renderPreview(data, itemName) {
  if (!data || !Array.isArray(data.images) || data.images.length === 0) {
    hidePreview();
    return;
  }

  previewBox.innerHTML = "";
  previewBox.classList.add("visible");

  const imgWrap = document.createElement("div");
  imgWrap.className = `farm-preview-images ${data.images.length > 1 ? "multi" : "single"}`;

  data.images.forEach((src) => {
    const image = document.createElement("img");
    image.src = src;
    image.alt = itemName;
    imgWrap.appendChild(image);
  });

  const title = document.createElement("h3");
  title.className = "farm-preview-title";
  title.textContent = itemName;

  previewBox.appendChild(imgWrap);
  previewBox.appendChild(title);

  if (data.description) {
    const text = document.createElement("div");
    text.className = "farm-preview-text";
    text.textContent = data.description;
    previewBox.appendChild(text);
  }
}

async function getPreviewData(url) {
  if (!url) return null;
  if (previewCache.has(url)) {
    return previewCache.get(url);
  }

  try {
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) return null;

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const images = [];
    const pushImage = (src) => {
      const normalized = normalizePreviewImageUrl(src);
      if (!normalized || !isValidPreviewImage(normalized) || images.includes(normalized)) {
        return;
      }
      images.push(normalized);
    };

    pushImage(getImageCandidateSrc(doc.querySelector("#wiki-tab-0-0 img")));
    pushImage(getImageCandidateSrc(doc.querySelector("#wiki-tab-0-1 img")));

    [
      "#page-content img",
      ".yui-content img",
      ".image-container img",
      ".scp-image-block img",
      'meta[property="og:image"]',
      'meta[name="og:image"]'
    ].forEach((selector) => {
      doc.querySelectorAll(selector).forEach((node) => {
        if (node.tagName === "META") {
          pushImage(node.getAttribute("content"));
        } else {
          pushImage(getImageCandidateSrc(node));
        }
      });
    });

    if (images.length === 0) {
      extractPreviewImagesFromHtml(html).forEach(pushImage);
    }

    const descriptionNode = doc.querySelector("#page-content");
    let description = "";
    if (descriptionNode) {
      const text = descriptionNode.textContent.replace(/\s+/g, " ").trim();
      const match = text.match(/Description:\s*(.+?)(?:Price:|Sellback:|Notes:|Also see:|$)/i);
      description = match ? match[1].trim() : "";
    }

    const result = { images, description };
    previewCache.set(url, result);
    return result;
  } catch (_error) {
    return null;
  }
}

async function handlePreview(link) {
  const href = link?.getAttribute("href") || "";
  if (!href) return;
  activePreviewHref = href;

  const itemName = link.textContent.replace(/\s+/g, " ").trim();
  const data = await getPreviewData(href);
  if (activePreviewHref !== href) return;
  renderPreview(data, itemName);
}

function bindPreviewHandlers(scope = document) {
  scope.querySelectorAll(".farm-table a").forEach((link) => {
    if (link.dataset.previewBound === "1") return;
    link.dataset.previewBound = "1";
    link.classList.add("preview-trigger");

    link.addEventListener("mouseenter", () => {
      clearTimeout(previewTimer);
      previewTimer = setTimeout(() => {
        handlePreview(link);
      }, 60);
    });

    link.addEventListener("mouseleave", (event) => {
      const related = event.relatedTarget;
      if (related && (link.contains(related) || previewBox.contains(related))) {
        return;
      }
      clearTimeout(previewTimer);
      activePreviewHref = "";
      hidePreview();
    });
  });
}

async function loadJsonFromRuntime(path) {
  const response = await fetch(chrome.runtime.getURL(path));
  if (!response.ok) {
    throw new Error(`Falha ao carregar ${path}`);
  }
  return response.json();
}

function formatObtainedFrom(priceData) {
  if (!Array.isArray(priceData)) {
    return "Desconhecido";
  }

  if (priceData[0] === "Drop") {
    return `Drop: ${priceData[1] || "N/A"}`;
  }

  if (priceData[0] === "Merge" || priceData[0] === "Quest") {
    return `${priceData[0]}: ${priceData[1] || "N/A"}`;
  }

  if (priceData.length >= 2) {
    return `${priceData[0]} ${priceData[1] || ""}`.trim();
  }

  return String(priceData[0] || "Desconhecido");
}

function buildTags(itemName, itemData, onlyDonate) {
  const tags = [];
  const isAC = !!extractProperty(itemData, "AC")?.[1];
  const isLegend = !!extractProperty(itemData, "Legend")?.[1];
  const isRare = !!extractProperty(itemData, "Rare")?.[1];
  const isSeasonal = !!extractProperty(itemData, "Seasonal")?.[1];
  const inHardFarm = Object.prototype.hasOwnProperty.call(hardFarmData, itemName) ||
    Object.prototype.hasOwnProperty.call(hardFarmData, getBaseName(itemName));
  const inClassDb = Object.prototype.hasOwnProperty.call(classesData, itemName) ||
    Object.prototype.hasOwnProperty.call(classesData, `${getBaseName(itemName)} (Class)`);

  if (isAC) tags.push('<span class="tag ac">AC</span>');
  if (isLegend) tags.push('<span class="tag legend">Legend</span>');
  if (isRare) tags.push('<span class="tag rare">Rare</span>');
  if (isSeasonal) tags.push('<span class="tag seasonal">Seasonal</span>');
  if (inHardFarm) tags.push('<span class="tag hard">Hard</span>');
  if (inClassDb) tags.push('<span class="tag class">Class</span>');
  if (onlyDonate && isRare) tags.push('<span class="tag rare">Doar</span>');

  return tags.join("");
}

function updateCounters() {
  const availableItemsCounter = document.getElementById("count-available-items");
  if (availableItemsCounter) {
    availableItemsCounter.textContent = filteredItems.length;
  }
}

function renderBatch() {
  const tableBody = document.getElementById("corpo-tabela");
  const btnLoadMore = document.getElementById("btn-carregar-mais");

  const batch = filteredItems.slice(currentIndex, currentIndex + limitPerBatch);

  batch.forEach(([itemName, itemData]) => {
    const slug = itemData[0];
    const fullUrl = slug ? `http://aqwwiki.wikidot.com${slug}` : buildWikiUrlFromName(itemName);
    const priceData = extractProperty(itemData, "Price");
    const onlyDonate = document.getElementById("filtro-donate")?.checked;
    const ownershipMarkup = buildOwnershipMarkup(itemName, fullUrl);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${ownershipMarkup}</td>
      <td>${formatObtainedFrom(priceData && priceData[1] ? priceData[1] : priceData)}</td>
      <td>${buildTags(itemName, itemData, onlyDonate)}</td>
    `;
    tableBody.appendChild(tr);
  });

  bindPreviewHandlers(tableBody);

  currentIndex += limitPerBatch;

  if (currentIndex < filteredItems.length) {
    btnLoadMore.hidden = false;
    btnLoadMore.textContent = `Carregar mais (${filteredItems.length - currentIndex} restantes)`;
  } else {
    btnLoadMore.hidden = true;
  }
}

function updateFarmList() {
  const tableBody = document.getElementById("corpo-tabela");
  if (!tableBody) return;

  tableBody.innerHTML = "";
  currentIndex = 0;

  const onlyAC = document.getElementById("filtro-ac")?.checked;
  const onlyLegend = document.getElementById("filtro-legend")?.checked;
  const onlyDrop = document.getElementById("filtro-drop")?.checked;
  const onlyMerge = document.getElementById("filtro-merge")?.checked;
  const onlySeasonal = document.getElementById("filtro-seasonal")?.checked;
  const onlyHard = document.getElementById("filtro-hard")?.checked;
  const onlyClass = document.getElementById("classe-hard")?.checked;
  const onlyDonate = document.getElementById("filtro-donate")?.checked;
  const searchQuery = document.getElementById("search-input")?.value.toLowerCase().trim() || "";

  const processedBaseNames = new Set();

  filteredItems = Object.entries(wikiData).filter(([itemName, itemData]) => {
    if (searchQuery && !itemName.toLowerCase().includes(searchQuery)) {
      return false;
    }

    const baseName = getBaseName(itemName);
    if (!baseName) return false;

    if (processedBaseNames.has(baseName)) return false;

    const acEntry = extractProperty(itemData, "AC");
    const legendEntry = extractProperty(itemData, "Legend");
    const rareEntry = extractProperty(itemData, "Rare");
    const seasonalEntry = extractProperty(itemData, "Seasonal");
    const priceEntry = extractProperty(itemData, "Price");
    const category = Array.isArray(itemData[itemData.length - 1]) ? "" : String(itemData[itemData.length - 1] || "").toLowerCase();

    const isAC = !!(acEntry && acEntry[1]);
    const isLegend = !!(legendEntry && legendEntry[1]);
    const isRare = !!(rareEntry && rareEntry[1]);
    const isSeasonal = !!(seasonalEntry && seasonalEntry[1]);
    const priceData = priceEntry ? priceEntry[1] : null;
    const priceType = Array.isArray(priceData) ? String(priceData[0] || "") : "";
    const isDrop = priceType === "Drop";
    const isMerge = priceType === "Merge";
    const inHardFarm = Object.prototype.hasOwnProperty.call(hardFarmData, itemName) ||
      Object.prototype.hasOwnProperty.call(hardFarmData, baseName);
    const inClassDb = Object.prototype.hasOwnProperty.call(classesData, itemName) ||
      Object.prototype.hasOwnProperty.call(classesData, `${baseName} (Class)`) ||
      category === "classes";
    const isCosmetic = /\s\((Armor|Helm|Cape|Weapon|Pet|Misc|Necklace|Sword|Dagger|Axe|Mace|Polearm|Staff|Wand|Bow|Gun)\)/i.test(itemName);

    if (onlyDonate) {
      if (!isRare) return false;
    } else if (isRare) {
      return false;
    }

    if (onlyAC && !isAC) return false;
    if (onlyLegend && !isLegend) return false;
    if (onlyDrop && !isDrop) return false;
    if (onlyMerge && !isMerge) return false;
    if (onlySeasonal && !isSeasonal) return false;
    if (onlyHard && !inHardFarm) return false;
    if (onlyClass && (isCosmetic || !inClassDb)) return false;

    processedBaseNames.add(baseName);
    return true;
  });

  updateCounters();
  renderBatch();
  setStatus(`Lista pronta com ${filteredItems.length} itens para farmar.`);
}

async function loadAllDatabases() {
  try {
    setStatus("Carregando base da Wiki, classes e hard farm...");

    const [loadedWikiData, loadedHardFarm, loadedClasses, inventory] = await Promise.all([
      loadWikiItemsData(),
      loadJsonFromRuntime("data/HardFarm.json"),
      loadJsonFromRuntime("data/Classes.json"),
      getInventoryData()
    ]);

    hardFarmData = loadedHardFarm || {};
    classesData = loadedClasses || {};
    wikiData = { ...(loadedWikiData || {}), ...hardFarmData };
    fastInventorySet = new Set((inventory || []).map((item) => normalizeItemName(item.name)));
    inventoryIndex = buildInventoryIndex(inventory || []);

    const accItemsCounter = document.getElementById("count-account-items");
    if (accItemsCounter) {
      accItemsCounter.textContent = inventory.length;
    }

    updateFarmList();
  } catch (error) {
    console.error("Erro ao carregar o FARMADOR:", error);
    setStatus(`Erro ao carregar dados: ${error.message}`);
  }
}

document.getElementById("refreshList")?.addEventListener("click", updateFarmList);
document.getElementById("btn-carregar-mais")?.addEventListener("click", renderBatch);
document.getElementById("search-input")?.addEventListener("input", updateFarmList);

[
  "filtro-ac",
  "filtro-legend",
  "filtro-drop",
  "filtro-merge",
  "filtro-seasonal",
  "filtro-hard",
  "classe-hard",
  "filtro-donate"
].forEach((id) => {
  document.getElementById(id)?.addEventListener("change", updateFarmList);
});

loadAllDatabases();

previewBox.addEventListener("mouseleave", () => {
  activePreviewHref = "";
  hidePreview();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  if (changes[AQW_HELPER_STORAGE_KEY]) {
    const inventory = changes[AQW_HELPER_STORAGE_KEY].newValue || [];
    fastInventorySet = new Set(inventory.map((item) => normalizeItemName(item.name)));
    inventoryIndex = buildInventoryIndex(inventory);

    const accItemsCounter = document.getElementById("count-account-items");
    if (accItemsCounter) {
      accItemsCounter.textContent = inventory.length;
    }

    updateFarmList();
  }

  if (changes[AQW_HELPER_WIKI_DATA_KEY]) {
    wikiData = {
      ...(changes[AQW_HELPER_WIKI_DATA_KEY].newValue || {}),
      ...hardFarmData
    };
    updateFarmList();
  }
});
