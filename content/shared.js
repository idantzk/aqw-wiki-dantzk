const AQW_HELPER_STORAGE_KEY = "aqwHelperInventory";
const AQW_HELPER_META_KEY = "aqwHelperMeta";
const AQW_HELPER_BADGES_KEY = "aqwHelperBadges";
const AQW_HELPER_BADGES_META_KEY = "aqwHelperBadgesMeta";

function normalizeItemName(name) {
  if (!name) return "";

  return String(name)
    .replace(/\s+x\d+$/i, "")
    .replace(
      /\s*\((Class|Armor|Helm|Cape|Weapon|Pet|Misc|Necklace|Sword|Dagger|Axe|Mace|Polearm|Staff|Wand|Bow|Gun|0 AC|AC|Legend|Non-Legend|Merge|Rare|VIP|Monster|Quest Item)\)/gi,
      ""
    )
    .replace(/\s*\(Rank\s+\d+\)/gi, "")
    .replace(/[â€œâ€"]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function slugifyWikiName(name) {
  return normalizeItemName(name)
    .replace(/'/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "")
    .replace(/-+/g, "-");
}

function buildWikiUrlFromName(name) {
  return `http://aqwwiki.wikidot.com/${slugifyWikiName(name)}`;
}

function getInventoryData() {
  return new Promise((resolve) => {
    chrome.storage.local.get([AQW_HELPER_STORAGE_KEY], (result) => {
      resolve(result[AQW_HELPER_STORAGE_KEY] || []);
    });
  });
}

function setInventoryData(items) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [AQW_HELPER_STORAGE_KEY]: items }, resolve);
  });
}

function getInventoryMeta() {
  return new Promise((resolve) => {
    chrome.storage.local.get([AQW_HELPER_META_KEY], (result) => {
      resolve(result[AQW_HELPER_META_KEY] || null);
    });
  });
}

function setInventoryMeta(meta) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [AQW_HELPER_META_KEY]: meta }, resolve);
  });
}

function getBadgeData() {
  return new Promise((resolve) => {
    chrome.storage.local.get([AQW_HELPER_BADGES_KEY], (result) => {
      resolve(result[AQW_HELPER_BADGES_KEY] || []);
    });
  });
}

function setBadgeData(items) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [AQW_HELPER_BADGES_KEY]: items }, resolve);
  });
}

function getBadgeMeta() {
  return new Promise((resolve) => {
    chrome.storage.local.get([AQW_HELPER_BADGES_META_KEY], (result) => {
      resolve(result[AQW_HELPER_BADGES_META_KEY] || null);
    });
  });
}

function setBadgeMeta(meta) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [AQW_HELPER_BADGES_META_KEY]: meta }, resolve);
  });
}

function buildInventoryIndex(items) {
  const byName = new Map();

  for (const item of items) {
    const base = normalizeItemName(item.name);
    if (!base) continue;

    if (!byName.has(base)) {
      byName.set(base, []);
    }

    byName.get(base).push(item);
  }

  return byName;
}

function hasItem(index, name) {
  return index.has(normalizeItemName(name));
}

function getBestLocation(index, name) {
  const items = index.get(normalizeItemName(name)) || [];
  if (!items.length) return null;

  const hasBank = items.some((item) =>
    String(item.location || "").toLowerCase().includes("bank")
  );
  if (hasBank) return "bank";

  const hasQuest = items.some((item) =>
    String(item.location || "").toLowerCase().includes("quest")
  );
  if (hasQuest) return "quest";

  return "inventory";
}

function detectItemCategoryFromText(text) {
  const value = String(text || "").toLowerCase();

  if (
    value.includes("armor") ||
    value.includes("robe") ||
    value.includes("uniform") ||
    value.includes("helm") ||
    value.includes("cape")
  ) {
    return "armor";
  }

  if (value.includes("quest")) {
    return "quest";
  }

  return null;
}

function createIcon(src, title, className = "aqw-helper-icon") {
  const img = document.createElement("img");
  img.src = src;
  img.alt = title;
  img.title = title;
  img.className = className;
  return img;
}
