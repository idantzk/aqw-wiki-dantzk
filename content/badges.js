(async function initBadgeHelper() {
  const lowerUrl = window.location.href.toLowerCase();
  const isWiki = lowerUrl.includes("aqwwiki.wikidot.com");
  const isCharPage = lowerUrl.includes("account.aq.com/charpage") && /[?&]id=/.test(lowerUrl);

  if (!isWiki && !isCharPage) {
    return;
  }

  let badgeItems = await getBadgeData();
  let badgeMeta = await getBadgeMeta();
  let badgeIndex = new Set();
  let badgeImageIndex = new Set();
  let badgeMarkTimer = null;

  function normalizeBadgeName(name) {
    if (!name) return "";

    return String(name)
      .replace(/\s*\(badge\)$/i, "")
      .replace(/\s*\(achievement\)$/i, "")
      .replace(/\s+/g, " ")
      .replace(/[^\w\s'-]/g, "")
      .trim()
      .toLowerCase();
  }

  function normalizeBadgeImageKey(src) {
    if (!src) return "";

    const clean = String(src).split("?")[0].trim().toLowerCase();
    const parts = clean.split("/");
    return parts[parts.length - 1] || "";
  }

  function buildBadgeIndexes(items) {
    badgeIndex = new Set((items || []).map((item) => normalizeBadgeName(item.name || item)));
    badgeImageIndex = new Set(
      (items || [])
        .map((item) => normalizeBadgeImageKey(item.imageSrc || ""))
        .filter(Boolean)
    );
  }

  function hasBadge(name) {
    return badgeIndex.has(normalizeBadgeName(name));
  }

  function hasBadgeByImage(src) {
    const key = normalizeBadgeImageKey(src);
    return key ? badgeImageIndex.has(key) : false;
  }

  function hasBadgeMatch(name, src) {
    return hasBadge(name) || hasBadgeByImage(src);
  }

  function isBadgeWikiPage() {
    return lowerUrl.includes("character-page-badges") || lowerUrl.includes("-badges");
  }

  function collectBadgeAnchors() {
    const selectors = [
      "#badgesRendered a[role='button']",
      "#badgesRendered a",
      "a[role='button'][aria-label]",
      "a[role='button'][data-bs-original-title]"
    ];

    const found = new Map();
    for (const selector of selectors) {
      const anchors = Array.from(document.querySelectorAll(selector));
      for (const anchor of anchors) {
        const key =
          anchor.getAttribute("aria-label") ||
          anchor.getAttribute("data-bs-original-title") ||
          anchor.getAttribute("title") ||
          anchor.getAttribute("href") ||
          "";

        if (key) {
          found.set(key, anchor);
        }
      }
    }

    return Array.from(found.values());
  }

  async function syncBadgesFromCharPage() {
    if (!isCharPage) {
      return;
    }

    const badgeAnchors = collectBadgeAnchors();
    if (!badgeAnchors.length) {
      return;
    }

    const badges = badgeAnchors
      .map((anchor) => ({
        name: String(
          anchor.getAttribute("aria-label") ||
            anchor.getAttribute("data-bs-original-title") ||
            anchor.getAttribute("title") ||
            ""
        ).replace(/\s+/g, " ").trim(),
        imageSrc: anchor.querySelector("img")?.getAttribute("src") || ""
      }))
      .filter((badge) => badge.name);

    if (!badges.length) {
      return;
    }

    const currentJson = JSON.stringify(badgeItems || []);
    const nextJson = JSON.stringify(badges);
    if (currentJson === nextJson) {
      return;
    }

    badgeItems = badges;
    buildBadgeIndexes(badgeItems);

    await setBadgeData(badges);
    await setBadgeMeta({
      count: badges.length,
      syncedAt: new Date().toISOString()
    });
    badgeMeta = {
      count: badges.length,
      syncedAt: new Date().toISOString()
    };
  }

  function isBadgeImage(image) {
    if (!image) return false;

    const src = (image.getAttribute("src") || "").toLowerCase();
    if (!src) return false;
    if (src.includes("/image-tags/")) return false;
    if (src.includes("wiki-image-banner")) return false;
    if (src.includes("boost")) return false;
    return true;
  }

  function getBadgePageImages() {
    return Array.from(document.querySelectorAll("#page-content img")).filter((image) => {
      if (image.closest("#breadcrumbs,#side-bar,#top-bar,.page-tags,.options,.pager,.yui-nav")) {
        return false;
      }

      return isBadgeImage(image);
    });
  }

  function getNearestBadgeText(image) {
    if (!image) return "";

    const candidates = [
      image.closest("a"),
      image.parentElement,
      image.closest("td"),
      image.closest("div"),
      image.closest("span")
    ].filter(Boolean);

    for (const candidate of candidates) {
      const text = (candidate.textContent || "").replace(/\s+/g, " ").trim();
      if (text && text.length >= 3) {
        return text;
      }
    }

    return image.getAttribute("alt") || image.getAttribute("title") || "";
  }

  function applyBadgeEffect(target, owned, title) {
    const image = target?.tagName === "IMG" ? target : target?.querySelector("img");
    if (!image) return;

    image.classList.remove("aqw-helper-badge-owned", "aqw-helper-badge-missing");
    image.classList.add(owned ? "aqw-helper-badge-owned" : "aqw-helper-badge-missing");
    image.title = title;
    image.dataset.aqwBadgeProcessed = "1";
  }

  function renderBadgeCount() {
    if (!isCharPage) {
      return;
    }

    const count = badgeMeta?.count || badgeItems.length || 0;
    let counter = document.getElementById("aqw-helper-badge-count");

    if (!counter) {
      counter = document.createElement("div");
      counter.id = "aqw-helper-badge-count";
      counter.className = "aqw-helper-badge-count";
      document.body.appendChild(counter);
    }

    counter.textContent = `Badges sincronizados: ${count}`;
  }

  function scheduleBadgeMarking() {
    if (!isWiki || !isBadgeWikiPage() || lowerUrl.includes("character-page-badges")) {
      return;
    }

    clearTimeout(badgeMarkTimer);
    badgeMarkTimer = setTimeout(() => {
      markBadgeWikiPage();
    }, 120);
  }

  function normalizeBadgePageImage(image) {
    if (!image) {
      return "";
    }

    const source = image.getAttribute("src") || "";
    return normalizeBadgeImageKey(source);
  }

  function clearBadgeMarks() {
    document
      .querySelectorAll(".aqw-helper-badge-owned, .aqw-helper-badge-missing")
      .forEach((image) => {
        image.classList.remove("aqw-helper-badge-owned", "aqw-helper-badge-missing");
      });

    document.querySelectorAll("[data-aqw-badge-processed]").forEach((element) => {
      delete element.dataset.aqwBadgeProcessed;
    });
  }

  function markIndividualBadges() {
    const contentImages = getBadgePageImages();
    const ownedKeys = new Set();
    const missingImages = [];

    for (const image of contentImages) {
      if (image.dataset.aqwBadgeProcessed === "1") {
        continue;
      }

      const anchor = image.closest("a");
      const badgeName =
        image.getAttribute("alt") ||
        image.getAttribute("title") ||
        anchor?.getAttribute("aria-label") ||
        anchor?.getAttribute("data-bs-original-title") ||
        anchor?.getAttribute("title") ||
        getNearestBadgeText(image);
      const badgeImage = image.getAttribute("src") || "";
      const owned = hasBadgeMatch(badgeName, badgeImage);
      const imageKey = normalizeBadgePageImage(image);

      applyBadgeEffect(
        image,
        owned,
        owned ? "Voce ja tem esse badge" : "Voce ainda nao tem esse badge"
      );

      if (owned && imageKey) {
        ownedKeys.add(imageKey);
      } else if (!owned) {
        missingImages.push(image);
      }
    }

    for (const image of missingImages) {
      const imageKey = normalizeBadgePageImage(image);
      if (imageKey && ownedKeys.has(imageKey)) {
        applyBadgeEffect(image, true, "Voce ja tem esse badge");
      }
    }
  }

  function markBadgeWikiPage() {
    if (!isWiki || !isBadgeWikiPage()) {
      return;
    }

    if (lowerUrl.includes("character-page-badges")) {
      return;
    }

    if (lowerUrl.includes("-badges")) {
      markIndividualBadges();
    }
  }

  buildBadgeIndexes(badgeItems);

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }

    if (changes[AQW_HELPER_BADGES_KEY]) {
      badgeItems = changes[AQW_HELPER_BADGES_KEY].newValue || [];
      buildBadgeIndexes(badgeItems);
      clearBadgeMarks();
      scheduleBadgeMarking();
    }

    if (changes[AQW_HELPER_BADGES_META_KEY]) {
      badgeMeta = changes[AQW_HELPER_BADGES_META_KEY].newValue || null;
      renderBadgeCount();
    }
  });

  if (isCharPage) {
    syncBadgesFromCharPage();
    renderBadgeCount();
    setTimeout(() => {
      syncBadgesFromCharPage();
      renderBadgeCount();
    }, 1500);
    setTimeout(() => {
      syncBadgesFromCharPage();
      renderBadgeCount();
    }, 3500);
    setTimeout(() => {
      syncBadgesFromCharPage();
      renderBadgeCount();
    }, 6000);
  }

  if (isWiki) {
    scheduleBadgeMarking();
    setTimeout(scheduleBadgeMarking, 1200);
    setTimeout(scheduleBadgeMarking, 2500);
  }
})();
