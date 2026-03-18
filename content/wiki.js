(async function initWikiHelper() {
  const currentUrl = window.location.href;
  const lowerUrl = currentUrl.toLowerCase();
  const isWiki = lowerUrl.includes("aqwwiki.wikidot.com");
  const isCharPage = lowerUrl.includes("account.aq.com/charpage") && /[?&]id=/.test(lowerUrl);
  const isManageAccount =
    lowerUrl.includes("account.aq.com/aqw/inventory") ||
    lowerUrl.includes("account.aq.com/aqw/buyback") ||
    lowerUrl.includes("account.aq.com/manage");

  if (!isWiki && !isCharPage && !isManageAccount) return;

  const previewBox = document.createElement("div");
  previewBox.id = "aqw-helper-preview";
  previewBox.className = "content-view";
  document.body.appendChild(previewBox);

  const previewCache = new Map();
  let hoverTimer = null;
  let remarkTimer = null;
  let activePreviewKey = "";
  let inventoryItems = await getInventoryData();
  let inventoryIndex = buildInventoryIndex(inventoryItems);
  let wikiItemsPromise = null;
  let calculatorTimer = null;
  const calculatorState = {
    mergeAc: false,
    mergeLegend: false,
    questMultiplier: 1
  };

  function hasSyncedInventory() {
    return Array.isArray(inventoryItems) && inventoryItems.length > 0;
  }

  function isReputationText(text) {
    const value = String(text || "").toLowerCase().trim();
    return value.includes("reputation");
  }

  function isCategoryHeaderText(text) {
    const blocked = new Set([
      "classes",
      "weapons",
      "classes / armors",
      "classes/armors",
      "armors",
      "helms",
      "helmets",
      "helmets & hoods",
      "back items",
      "capes & back items",
      "pets",
      "misc. items",
      "misc items",
      "class",
      "armor",
      "helm",
      "cape",
      "sword",
      "axe",
      "dagger",
      "mace",
      "staff",
      "wand",
      "pet",
      "item",
      "quest item",
      "quest items",
      "house",
      "houses",
      "resource",
      "resources",
      "floor item",
      "floor items",
      "wall item",
      "wall items",
      "2023",
      "- 2023"
    ]);

    return blocked.has(String(text || "").toLowerCase().trim());
  }

  function isValidItemText(text) {
    if (!text) return false;

    const clean = text.trim();
    if (clean.length < 2 || clean.length > 120) return false;
    if (/^[0-9]+$/.test(clean)) return false;
    if (isReputationText(clean) || isCategoryHeaderText(clean)) return false;

    const blockedTexts = [
      "character page",
      "inventory",
      "bank",
      "house",
      "guild",
      "page 1",
      "page 2"
    ];

    const lower = clean.toLowerCase();
    return !blockedTexts.some((value) => lower === value || lower.includes(value));
  }

  function isNonItemWikiLink(link) {
    if (!link) return true;

    const text = (link.textContent || "").trim();
    if (!isValidItemText(text)) return true;

    if (
      link.closest("#breadcrumbs") ||
      link.closest("#side-bar") ||
      link.closest("#top-bar") ||
      link.closest(".page-tags") ||
      link.closest(".options") ||
      link.closest(".pager") ||
      link.closest(".yui-nav") ||
      link.closest("sub")
    ) {
      return true;
    }

    return false;
  }

  function readNodeText(node) {
    const text = (node?.textContent || "").replace(/\s+/g, " ").trim();
    return text.toLowerCase();
  }

  function getClosestSectionLabel(link) {
    let current = link;
    let depth = 0;

    while (current && depth < 12) {
      let sibling = current.previousSibling;
      while (sibling) {
        const text = readNodeText(sibling);
        if (
          text.includes("skills:") ||
          text.includes("notes:") ||
          text.includes("location:") ||
          text.includes("locations:") ||
          text.includes("monster:") ||
          text.includes("monsters:") ||
          text.includes("map:") ||
          text.includes("maps:") ||
          text.includes("also see:")
        ) {
          return text;
        }
        sibling = sibling.previousSibling;
      }

      current = current.parentNode;
      depth += 1;
    }

    return "";
  }

  function getSectionContextText(link) {
    let current = link;
    let depth = 0;

    while (current && depth < 10) {
      let sibling = current.previousSibling;
      while (sibling) {
        const text = readNodeText(sibling);
        if (text) {
          return text;
        }
        sibling = sibling.previousSibling;
      }

      const parent = current.parentElement;
      if (!parent) {
        break;
      }

      const parentText = readNodeText(parent);
      if (
        parentText.includes("skills:") ||
        parentText.includes("notes:") ||
        parentText.includes("location:") ||
        parentText.includes("locations:") ||
        parentText.includes("monster:") ||
        parentText.includes("monsters:") ||
        parentText.includes("map:") ||
        parentText.includes("maps:")
      ) {
        return parentText;
      }

      current = parent;
      depth += 1;
    }

    return "";
  }

  function looksLikeClassOrItemText(text) {
    const value = String(text || "").toLowerCase().trim();
    if (!value) return false;

    return /(class|armor|robe|helm|hood|cape|cloak|pet|sword|axe|dagger|mace|staff|wand|bow|gun|polearm|item|house item|wall item|floor item|\(ac\)|\(0 ac\)|merge|legend|rare)/i.test(value);
  }

  function isClassDetailPage() {
    if (!isWiki) return false;

    if (lowerUrl.includes("/classes") && !/\/classes(?:[?#]|$)/i.test(currentUrl)) {
      return true;
    }

    const breadcrumbs = readNodeText(document.querySelector("#breadcrumbs"));
    return breadcrumbs.includes("items") && breadcrumbs.includes("classes");
  }

  function isJunkWikiReference(text) {
    const value = String(text || "").toLowerCase().trim();
    if (!value) return false;

    return (
      value.includes("lorepedia") ||
      value.includes("patch notes") ||
      value.includes("design notes") ||
      value.includes("class breakdown") ||
      value.includes("revamp") ||
      value.includes("breakdown") ||
      value.includes("list of all") ||
      value.includes("npc") ||
      value.includes("(npc)") ||
      value.includes("(location)") ||
      value.includes(" location") ||
      value.includes(" map") ||
      value.includes("maps") ||
      value.includes("monsters") ||
      value.includes("monster")
    );
  }

  function isSameSkillsReference(lineText, closestLabel) {
    const value = `${lineText} ${closestLabel}`.toLowerCase();
    return value.includes("same skills as");
  }

  function isDropSectionContext(sectionText, lineText, closestLabel) {
    const value = `${sectionText} ${lineText} ${closestLabel}`.toLowerCase();
    return (
      value.includes("items dropped") ||
      value.includes("temporary items dropped") ||
      value.includes("item dropped")
    );
  }

  function shouldSkipWikiContext(link) {
    if (!isWiki || !link) return false;

    const onClassDetailPage = isClassDetailPage();
    const sectionText = getSectionContextText(link);
    const closestLabel = getClosestSectionLabel(link);
    const text = (link.textContent || "").replace(/\s+/g, " ").trim();
    const lowerText = text.toLowerCase();
    const lineText = readNodeText(link.closest("li, p, div, td, tr") || link.parentElement);

    if (link.closest("#page-title, #breadcrumbs")) {
      return false;
    }

    if (/requires rank\s+\d+/i.test(lineText) || /requires rank\s+\d+/i.test(lowerText)) {
      return false;
    }

    if (
      sectionText.includes("skills:") ||
      sectionText === "skills" ||
      lineText.includes("skills:") ||
      closestLabel.includes("skills:")
    ) {
      return true;
    }

    if (
      !isDropSectionContext(sectionText, lineText, closestLabel) &&
      (
        sectionText.includes("monster:") ||
        sectionText.includes("monsters:") ||
        sectionText === "monster" ||
        sectionText === "monsters" ||
        lineText.includes("monster:") ||
        lineText.includes("monsters:") ||
        closestLabel.includes("monster:") ||
        closestLabel.includes("monsters:")
      )
    ) {
      return true;
    }

    if (
      sectionText.includes("map:") ||
      sectionText.includes("maps:") ||
      sectionText === "map" ||
      sectionText === "maps" ||
      lineText.includes("map:") ||
      lineText.includes("maps:") ||
      closestLabel.includes("map:") ||
      closestLabel.includes("maps:")
    ) {
      return true;
    }

    if (onClassDetailPage) {
      if (
        sectionText.includes("location:") ||
        sectionText.includes("locations:") ||
        sectionText === "location" ||
        sectionText === "locations" ||
        lineText.includes("location:") ||
        lineText.includes("locations:") ||
        closestLabel.includes("location:") ||
        closestLabel.includes("locations:")
      ) {
        return true;
      }

      if (
        sectionText.includes("notes:") ||
        sectionText === "notes" ||
        lineText.includes("notes:") ||
        closestLabel.includes("notes:") ||
        closestLabel.includes("also see:")
      ) {
        if (isSameSkillsReference(lineText, closestLabel)) {
          return isJunkWikiReference(text) || lowerText.includes("armor set");
        }

        if (isJunkWikiReference(text) || isJunkWikiReference(lineText)) {
          return true;
        }

        return false;
      }
    }

    if (
      lowerText.includes("lorepedia") ||
      lowerText.includes("patch notes") ||
      lowerText.includes("design notes") ||
      lowerText.includes("class breakdown") ||
      lowerText.includes("list of all") ||
      lowerText.includes("(npc)")
    ) {
      return true;
    }

    if (closestLabel.includes("also see:")) {
      if (isJunkWikiReference(text) || isJunkWikiReference(lineText)) {
        return true;
      }

      return false;
    }

    if (looksLikeClassOrItemText(text)) {
      return false;
    }

    if (
      sectionText.includes("location:") ||
      sectionText.includes("locations:") ||
      sectionText === "location" ||
      sectionText === "locations" ||
      lineText.includes("location:") ||
      lineText.includes("locations:") ||
      closestLabel.includes("location:") ||
      closestLabel.includes("locations:")
    ) {
      const listItem = link.closest("li");
      if (listItem) {
        const links = Array.from(listItem.querySelectorAll("a"));
        if (links[0] !== link) {
          return true;
        }
      }

      return !looksLikeClassOrItemText(text);
    }

    return false;
  }

  function isOwnedPageTitle() {
    const pageTitle = document.querySelector("#page-title");
    const title = (pageTitle?.textContent || "").trim();
    if (!title) {
      return false;
    }

    return hasItem(inventoryIndex, title);
  }

  async function getWikiItemsData() {
    if (!wikiItemsPromise) {
      wikiItemsPromise = loadWikiItemsData();
    }

    return wikiItemsPromise;
  }

  function getWikiItemDetails(rawData, itemName) {
    if (!rawData) return null;

    const normalizedTarget = normalizeItemName(itemName);
    const directEntry = rawData[itemName];
    if (directEntry) {
      return { key: itemName, entry: directEntry };
    }

    for (const [key, value] of Object.entries(rawData)) {
      if (normalizeItemName(key) === normalizedTarget) {
        return { key, entry: value };
      }
    }

    return null;
  }

  function buildWikiUrlFromDetails(itemName, details) {
    const detailSlug = details?.entry?.[0];
    if (typeof detailSlug === "string" && detailSlug.startsWith("/")) {
      return `https://aqwwiki.wikidot.com${detailSlug}`;
    }

    return buildWikiUrlFromName(itemName).replace("http://", "https://");
  }

  function clearOldCustomMarks(target) {
    if (!target) return;
    target
      .querySelectorAll(".aqw-helper-mark, .aqw-helper-status-icon, .aqw-helper-icon")
      .forEach((el) => el.remove());
  }

  function addSimpleInventoryStatus(target, itemName) {
    if (!target || target.dataset.aqwMarked === "1") return;
    if (!isValidItemText(itemName)) return;

    clearOldCustomMarks(target);

    if (hasItem(inventoryIndex, itemName)) {
      appendOwnedMark(target, itemName);
    } else if (hasSyncedInventory()) {
      appendMissingMark(target);
    }

    target.dataset.aqwMarked = "1";
  }

  function getLinkItemText(link) {
    if (!link) return "";

    const clone = link.cloneNode(true);
    clone.querySelectorAll(".aqw-helper-mark, .aqw-helper-status-icon, .aqw-helper-icon, img").forEach((el) => el.remove());

    return (clone.textContent || "")
      .replace(/\s*\(Rank\s+\d+\)/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getPlainCellItemText(target) {
    if (!target?.closest) return "";

    const cell = target.closest("td, th, li, p, div");
    if (!cell) return "";

    const clone = cell.cloneNode(true);
    clone.querySelectorAll("a, img, .aqw-helper-mark, .aqw-helper-status-icon, .aqw-helper-icon").forEach((el) => el.remove());
    return (clone.textContent || "").replace(/\s+/g, " ").trim();
  }

  function buildSyntheticPreviewTarget(target, itemName) {
    if (!itemName) return null;

    const href = buildWikiUrlFromName(itemName);
    return {
      getAttribute(name) {
        if (name === "href") return href;
        return "";
      },
      href,
      textContent: itemName,
      closest() {
        return null;
      }
    };
  }

  function appendOwnedMark(target, itemName) {
    const location = getBestLocation(inventoryIndex, itemName);
    const mark = document.createElement("span");
    mark.className = "aqw-helper-mark owned";
    mark.textContent = "\u2714";
    mark.title = "Voce ja tem este item";
    target.appendChild(mark);

    const iconTitle =
      location === "bank"
        ? "Voce tem esse item no Bank"
        : "Voce tem esse item no Inventario";
    const iconSrc =
      location === "bank"
        ? chrome.runtime.getURL("images/bank.png")
        : chrome.runtime.getURL("images/inventory.png");

    target.appendChild(createIcon(iconSrc, iconTitle, "aqw-helper-status-icon"));
  }

  function appendMissingMark(target) {
    const mark = document.createElement("span");
    mark.className = "aqw-helper-mark missing";
    mark.textContent = " \u2716";
    mark.title = "Voce ainda nao tem este item";
    target.appendChild(mark);
  }

  function appendSimpleOwnedMark(target, title) {
    const mark = document.createElement("span");
    mark.className = "aqw-helper-mark owned";
    mark.textContent = "\u2714";
    mark.title = title || "Voce ja cumpriu este requisito";
    target.appendChild(mark);
  }

  function resolveRowItemLink(target) {
    const row = target?.closest?.("tr");
    if (!row) {
      return null;
    }

    const cells = Array.from(row.querySelectorAll("td, th"));
    if (!cells.length) {
      return null;
    }

    const candidateCells = [];
    if (cells[1]) {
      candidateCells.push(cells[1]);
    }
    candidateCells.push(...cells);

    for (const cell of candidateCells) {
      const anchor = Array.from(cell.querySelectorAll("a")).find((link) => {
        const text = getLinkItemText(link);
        return isValidItemText(text) && !isNonItemWikiLink(link) && !/^rank\s+\d+/i.test(text);
      });

      if (anchor) {
        return anchor;
      }
    }

    return null;
  }

  function resolvePreviewLink(target) {
    if (!target?.closest) {
      return null;
    }

    const directLink = target.closest("a");
    if (directLink) {
      return directLink;
    }

    const rowLink = resolveRowItemLink(target);
    if (rowLink) {
      return rowLink;
    }

    if (isWiki || isManageAccount) {
      const plainText = getPlainCellItemText(target);
      if (isValidItemText(plainText)) {
        return buildSyntheticPreviewTarget(target, plainText);
      }
    }

    return null;
  }

  function getPreviewKey(link) {
    if (!link) {
      return "";
    }

    const href = link.getAttribute("href") || "";
    const text = typeof link.querySelector === "function" ? getLinkItemText(link) : String(link.textContent || "").trim();
    return `${href}::${text}`.toLowerCase();
  }

  function getPreviewTargetText(link) {
    if (!link) return "";
    if (typeof link.querySelector === "function" && link.tagName === "A") {
      return getLinkItemText(link);
    }

    return String(link.textContent || "").replace(/\s+/g, " ").trim();
  }

  function shouldSkipPreviewLink(link) {
    if (!link) {
      return true;
    }

    if (typeof link.closest === "function") {
      if (
        link.closest("#breadcrumbs") ||
        link.closest("#side-bar") ||
        link.closest("#top-bar") ||
        link.closest(".page-tags") ||
        link.closest(".options") ||
        link.closest(".pager") ||
        link.closest(".yui-nav") ||
        link.closest("sub")
      ) {
        return true;
      }
    }

    const href = (link.getAttribute("href") || link.href || "").toLowerCase();
    const text = (typeof link.querySelector === "function" ? getLinkItemText(link) : String(link.textContent || "").trim()).toLowerCase();

    if (!href || href.startsWith("javascript:") || href.includes(":")) {
      return true;
    }

    return (
      text.includes("lorepedia") ||
      text.includes("patch notes") ||
      text.includes("design notes") ||
      text.includes("class breakdown") ||
      text.includes("npc") ||
      text.includes("(npc)") ||
      text.includes("(location)")
    );
  }

  function getRelatedRowLinks(target) {
    const row = target.closest("tr, li, p, div");
    if (!row) return [];

    return Array.from(row.querySelectorAll("a")).filter((link) => {
      if (link === target) return false;
      const text = getLinkItemText(link);
      if (!isValidItemText(text) || isNonItemWikiLink(link) || shouldSkipWikiContext(link)) {
        return false;
      }

      return true;
    });
  }

  function hasOwnedLinkInScope(scope) {
    if (!scope) return false;

    return Array.from(scope.querySelectorAll("a")).some((link) => {
      const text = getLinkItemText(link);
      return isValidItemText(text) && hasItem(inventoryIndex, text);
    });
  }

  function isRankRequirementTarget(target, itemName, lineText) {
    const lowerItemName = String(itemName || "").toLowerCase().trim();
    const targetCellText = readNodeText(target.closest("td, th, li, p, div") || target.parentElement);

    if (/^rank\s+\d+/i.test(lowerItemName)) {
      return true;
    }

    if (/^rank\s+\d+/i.test(targetCellText)) {
      return true;
    }

    if (/requires rank\s+\d+/i.test(lineText) && !looksLikeClassOrItemText(itemName)) {
      return true;
    }

    if (/rank\s+\d+\s+/i.test(lineText) && !looksLikeClassOrItemText(itemName)) {
      const escapedName = lowerItemName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`rank\\s+\\d+\\s+${escapedName}`).test(lineText);
    }

    if (lowerItemName && /rank\s+\d+\s+/i.test(lineText)) {
      const escapedName = lowerItemName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`rank\\s+\\d+\\s+${escapedName}`).test(lineText)) {
        return true;
      }
    }

    return false;
  }

  function addStatus(target, itemName) {
    if (!target || target.dataset.aqwMarked === "1") return;
    if (!isValidItemText(itemName)) return;

    clearOldCustomMarks(target);

    const lineText = readNodeText(target.closest("li, p, div, td, tr") || target.parentElement);
    const hasRankRequirement = isRankRequirementTarget(target, itemName, lineText);

    if (hasRankRequirement) {
      const relatedRowLinks = getRelatedRowLinks(target);
      const relatedOwned = relatedRowLinks.some((link) => hasItem(inventoryIndex, getLinkItemText(link)));
      const questOwned =
        isQuestPage() &&
        hasOwnedLinkInScope(
          target.closest(".yui-content > div, .content-panel, .wiki-content-table, #page-content") ||
          getActiveQuestContainer()
        );

      if (relatedOwned || questOwned || isOwnedPageTitle()) {
        appendSimpleOwnedMark(target, "Voce ja cumpriu este requisito de rank");
      } else if (hasSyncedInventory()) {
        appendMissingMark(target);
      }
      target.dataset.aqwMarked = "1";
      return;
    }

    if (hasItem(inventoryIndex, itemName)) {
      appendOwnedMark(target, itemName);
    } else if (hasSyncedInventory()) {
      appendMissingMark(target);
    }

    target.dataset.aqwMarked = "1";
  }

  function markTableRows() {
    if (!isWiki) return;

    document.querySelectorAll("#page-content tr").forEach((row) => {
      const cells = Array.from(row.querySelectorAll("td, th"));
      if (!cells.length) return;

      let itemLinks = [];
      let plainNameCell = null;
      let rankLink = null;

      if (cells.length >= 3) {
        const nameCell = cells[Math.min(1, cells.length - 1)];
        const rankCell = cells[Math.min(2, cells.length - 1)];
        plainNameCell = nameCell;

        itemLinks = Array.from(nameCell.querySelectorAll("a")).filter((link) => {
          const text = getLinkItemText(link);
          return isValidItemText(text) && !isNonItemWikiLink(link);
        });

        rankLink = Array.from(rankCell.querySelectorAll("a")).find((link) =>
          /^rank\s+\d+/i.test(getLinkItemText(link))
        ) || null;

        if (!rankLink && rankCell && /^rank\s+\d+/i.test(readNodeText(rankCell))) {
          rankLink = rankCell;
        }
      }

      if (!itemLinks.length) {
        const links = Array.from(row.querySelectorAll("a"));
        if (!links.length) return;

        itemLinks = links.filter((link) => {
          const text = getLinkItemText(link);
          if (!isValidItemText(text) || isNonItemWikiLink(link) || shouldSkipWikiContext(link)) {
            return false;
          }

          return !/^rank\s+\d+/i.test(text);
        });

        if (!rankLink) {
          rankLink = links.find((link) => /^rank\s+\d+/i.test(getLinkItemText(link))) || null;
          if (!rankLink) {
            const rankCell = cells[Math.min(2, cells.length - 1)];
            if (rankCell && /^rank\s+\d+/i.test(readNodeText(rankCell))) {
              rankLink = rankCell;
            }
          }
        }
      }

      itemLinks.forEach((link) => {
        if (link.dataset.aqwMarked === "1") return;
        addStatus(link, getLinkItemText(link));
      });

      if (!itemLinks.length && plainNameCell && plainNameCell.dataset.aqwMarked !== "1") {
        const plainText = getPlainCellItemText(plainNameCell);
        if (isValidItemText(plainText) && !shouldSkipWikiContext(plainNameCell.querySelector("a") || plainNameCell)) {
          addStatus(plainNameCell, plainText);
        }
      }

      if (rankLink && rankLink.dataset.aqwMarked !== "1") {
        const rankText =
          typeof rankLink.querySelector === "function" && rankLink.tagName === "A"
            ? getLinkItemText(rankLink)
            : (rankLink.textContent || "").replace(/\s+/g, " ").trim();
        addStatus(rankLink, rankText);
      }
    });
  }

  function markListPageItems() {
    if (!isWiki) return;

    document.querySelectorAll("#page-content .list-pages-item").forEach((item) => {
      const primaryLink =
        item.querySelector("p a") ||
        item.querySelector("a");

      if (!primaryLink) {
        return;
      }

      if (primaryLink.dataset.aqwProcessed === "1") {
        return;
      }

      const text = getLinkItemText(primaryLink);
      const href = (primaryLink.getAttribute("href") || "").toLowerCase();
      if (
        !isValidItemText(text) ||
        !href.startsWith("/") ||
        href.includes(":") ||
        lowerTextIncludesBlockedListItem(text)
      ) {
        primaryLink.dataset.aqwProcessed = "1";
        return;
      }

      addSimpleInventoryStatus(primaryLink, text);
      primaryLink.dataset.aqwProcessed = "1";
    });
  }

  function lowerTextIncludesBlockedListItem(text) {
    const value = String(text || "").toLowerCase().trim();
    return (
      value.includes("list of all tags") ||
      value.includes("list of all") ||
      value.includes("lorepedia") ||
      value.includes("design notes") ||
      value.includes("patch notes")
    );
  }

  function isSimpleListPage() {
    if (!isWiki) return false;
    return document.querySelectorAll("#page-content .list-pages-box .list-pages-item").length >= 8;
  }

  function shouldSkipSimpleListLink(link) {
    if (!link) return true;

    const href = String(link.getAttribute("href") || "").trim().toLowerCase();
    const text = getLinkItemText(link);
    const lowerText = text.toLowerCase();

    if (!text || !href) return true;
    if (link.closest("#breadcrumbs, #side-bar, #top-bar, .page-tags, .pager, .yui-nav")) return true;
    if (href.startsWith("javascript:") || href.startsWith("#")) return true;
    if (href.includes(":") && !href.startsWith("http")) return true;
    if (lowerTextIncludesBlockedListItem(text)) return true;
    if (lowerText === "new" || /^[a-z0-9]$/.test(lowerText)) return true;
    if (
      lowerText.includes("lorepedia") ||
      lowerText.includes("design notes") ||
      lowerText.includes("patch notes") ||
      lowerText.includes("(location)") ||
      lowerText.includes("(npc)")
    ) {
      return true;
    }

    return !isValidItemText(text);
  }

  function markSimpleListPageLinks() {
    if (!isSimpleListPage()) return;

    document.querySelectorAll("#page-content .list-pages-box a").forEach((link) => {
      if (link.dataset.aqwSimpleProcessed === "1") return;
      link.dataset.aqwSimpleProcessed = "1";

      if (shouldSkipSimpleListLink(link)) {
        return;
      }

      addSimpleInventoryStatus(link, getLinkItemText(link));
      link.dataset.aqwProcessed = "1";
    });
  }

  function markQuestPageLinks() {
    if (!isQuestPage()) return;

    const activeContainer = getActiveQuestContainer();
    if (!activeContainer) return;

    activeContainer.querySelectorAll("a").forEach((link) => {
      if (link.dataset.aqwQuestProcessed === "1") return;
      link.dataset.aqwQuestProcessed = "1";

      const text = getLinkItemText(link);
      if (!isValidItemText(text) || isNonItemWikiLink(link)) {
        return;
      }

      const lowerText = text.toLowerCase();
      if (
        lowerText.includes("lorepedia") ||
        lowerText.includes("design notes") ||
        lowerText.includes("patch notes") ||
        lowerText.includes("class breakdown") ||
        lowerText.includes("(npc)") ||
        lowerText.includes("(location)")
      ) {
        return;
      }

      addStatus(link, text);
      link.dataset.aqwProcessed = "1";
    });
  }

  function markWikiFallbackLinks() {
    if (!isWiki) return;

    document.querySelectorAll("#page-content a").forEach((link) => {
      if (link.dataset.aqwMarked === "1") return;

      const text = getLinkItemText(link);
      const lowerText = text.toLowerCase();
      const href = String(link.getAttribute("href") || "").trim().toLowerCase();
      const lineText = readNodeText(link.closest("li, p, div, td, tr") || link.parentElement);
      const closestLabel = getClosestSectionLabel(link);
      const sectionText = getSectionContextText(link);

      if (!isValidItemText(text)) return;
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
      if (link.closest("#breadcrumbs, #side-bar, #top-bar, .page-tags, .options, .pager, .yui-nav, sub")) return;
      if (
        lowerText.includes("lorepedia") ||
        lowerText.includes("patch notes") ||
        lowerText.includes("design notes") ||
        lowerText.includes("class breakdown") ||
        lowerText.includes("(npc)")
      ) {
        return;
      }

      addSimpleInventoryStatus(link, text);
    });
  }

  function markElements() {
    if (isWiki && lowerUrl.includes("-badges")) {
      return;
    }

    if (isWiki) {
      markQuestPageLinks();
      markSimpleListPageLinks();
      markListPageItems();

      document.querySelectorAll("#page-content a").forEach((link) => {
        if (link.dataset.aqwProcessed === "1") return;

        const text = getLinkItemText(link);
        if (!isValidItemText(text) || isNonItemWikiLink(link) || shouldSkipWikiContext(link)) {
          link.dataset.aqwProcessed = "1";
          return;
        }

        addStatus(link, text);
        link.dataset.aqwProcessed = "1";
      });

      markTableRows();
      markWikiFallbackLinks();
    }

    if (isCharPage) {
      document.querySelectorAll("a").forEach((link) => {
        if (link.dataset.aqwProcessed === "1") return;

        const text = (link.textContent || "").trim().replace(/\s*\(Rank\s+\d+\)/i, "").trim();
        if (!isValidItemText(text)) {
          link.dataset.aqwProcessed = "1";
          return;
        }

        addStatus(link, text);
        link.dataset.aqwProcessed = "1";
      });
    }

    const pageTitle = document.querySelector("#page-title");
    if (pageTitle && pageTitle.dataset.aqwProcessed !== "1") {
      const title = pageTitle.textContent.trim();
      if (isValidItemText(title)) {
        addStatus(pageTitle, title);
      }
      pageTitle.dataset.aqwProcessed = "1";
    }
  }

  function resetMarks() {
    document.querySelectorAll("[data-aqw-processed]").forEach((el) => {
      delete el.dataset.aqwProcessed;
    });

    document.querySelectorAll("[data-aqw-marked]").forEach((el) => {
      delete el.dataset.aqwMarked;
      clearOldCustomMarks(el);
    });
  }

  function refreshInventory(items) {
    inventoryItems = items || [];
    inventoryIndex = buildInventoryIndex(inventoryItems);
    resetMarks();
    markElements();
    scheduleCalculatorRender(150);
  }

  function buildInventoryQuantityMap() {
    const quantityMap = new Map();

    for (const item of inventoryItems || []) {
      const name = normalizeItemName(item?.name);
      if (!name) continue;

      const quantity = Math.max(1, parseInt(item.quantity || 1, 10) || 1);
      quantityMap.set(name, (quantityMap.get(name) || 0) + quantity);
    }

    return quantityMap;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function isMergePage() {
    if (!isWiki) return false;

    const title = readNodeText(document.querySelector("#page-title"));
    const breadcrumbs = readNodeText(document.querySelector("#breadcrumbs"));
    return title.includes("merge") || breadcrumbs.includes("merge");
  }

  function isQuestPage() {
    if (!isWiki) return false;

    const title = readNodeText(document.querySelector("#page-title"));
    const breadcrumbs = readNodeText(document.querySelector("#breadcrumbs"));
    return title.includes("quest") || breadcrumbs.includes("quest");
  }

  function isElementVisible(element) {
    if (!element) return false;

    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function getActiveQuestContainer() {
    const navset = document.querySelector(".yui-navset");
    if (!navset) {
      return document.querySelector("#page-content");
    }

    const visiblePanel = Array.from(navset.querySelectorAll(".yui-content > div")).find((panel) =>
      isElementVisible(panel)
    );

    return visiblePanel || navset.querySelector(".yui-content > div") || document.querySelector("#page-content");
  }

  function extractPropertyTextFromLine(lineText, label) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = lineText.match(new RegExp(`${escaped}\\s*:\\s*(.+)$`, "i"));
    return match ? match[1].trim() : "";
  }

  function parseMaterialQuantityFromCell(priceCell, materialLink) {
    const afterLinkText = [];
    let sibling = materialLink.nextSibling;

    while (sibling) {
      if (sibling.nodeType === Node.TEXT_NODE) {
        afterLinkText.push(sibling.textContent || "");
      } else if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName !== "A") {
        afterLinkText.push(sibling.textContent || "");
      } else if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName === "A") {
        break;
      }
      sibling = sibling.nextSibling;
    }

    const text = afterLinkText.join(" ").replace(/\s+/g, " ").trim() || priceCell.textContent || "";
    const match = text.match(/x\s*([\d,]+)/i);
    return match ? parseInt(match[1].replace(/,/g, ""), 10) || 1 : 1;
  }

  function collectMergeRequirements(filterAc = false, filterLegend = false) {
    const quantityMap = buildInventoryQuantityMap();
    const requiredTotals = new Map();
    let totalShopItems = 0;
    let ownedShopItems = 0;

    document.querySelectorAll(".wiki-content-table tr").forEach((row) => {
      const cells = Array.from(row.querySelectorAll("td"));
      if (cells.length < 3) return;

      const nameCell = cells[1];
      const priceCell = cells[2];
      const itemLink = Array.from(nameCell.querySelectorAll("a")).find((link) => isValidItemText(getLinkItemText(link)));
      if (!itemLink) return;

      const itemText = getLinkItemText(itemLink);
      if (!itemText) return;

      const itemHtml = nameCell.innerHTML.toLowerCase();
      const itemLineText = readNodeText(nameCell);
      const isAc = itemHtml.includes("acsmall") || itemHtml.includes("aclarge") || /\bac\b/i.test(itemLineText);
      const isLegend =
        itemHtml.includes("membersmall") ||
        itemHtml.includes("memberlarge") ||
        itemHtml.includes("legendsmall") ||
        itemHtml.includes("legendlarge") ||
        /\blegend\b/i.test(itemLineText);

      if (filterAc || filterLegend) {
        const matchesFilter = (filterAc && isAc) || (filterLegend && isLegend);
        if (!matchesFilter) {
          return;
        }
      }

      totalShopItems += 1;
      if (hasItem(inventoryIndex, itemText)) {
        ownedShopItems += 1;
        return;
      }

      Array.from(priceCell.querySelectorAll("a")).forEach((materialLink) => {
        const materialName = getLinkItemText(materialLink);
        if (!materialName) return;

        const materialKey = normalizeItemName(materialName);
        const quantity = parseMaterialQuantityFromCell(priceCell, materialLink);
        const current = requiredTotals.get(materialKey) || {
          label: materialName,
          needed: 0,
          have: quantityMap.get(materialKey) || 0
        };

        current.needed += quantity;
        requiredTotals.set(materialKey, current);
      });
    });

    return {
      quantityMap,
      requiredTotals: Array.from(requiredTotals.values()).sort((a, b) => a.label.localeCompare(b.label)),
      totalShopItems,
      ownedShopItems
    };
  }

  function collectQuestRequirements(multiplier = 1) {
    const quantityMap = buildInventoryQuantityMap();
    const requiredTotals = new Map();
    const activeContainer = getActiveQuestContainer();
    if (!activeContainer) {
      return { requiredTotals: [], questLabel: "", multiplier };
    }

    const titleElement = document.querySelector(".yui-nav .selected a em");
    const questLabel = titleElement ? titleElement.textContent.trim() : "";
    const requirementLabel = Array.from(activeContainer.querySelectorAll("strong, b")).find((node) => {
      const text = readNodeText(node);
      return text.includes("items required:") || text.includes("requires:");
    });

    if (!requirementLabel) {
      return { requiredTotals: [], questLabel, multiplier };
    }

    let list = requirementLabel.parentElement?.nextElementSibling || null;
    while (list && list.tagName !== "UL") {
      list = list.nextElementSibling;
    }

    if (!list) {
      return { requiredTotals: [], questLabel, multiplier };
    }

    Array.from(list.children).forEach((li) => {
      if (li.tagName !== "LI") return;

      const clone = li.cloneNode(true);
      clone.querySelectorAll("ul, img").forEach((el) => el.remove());
      const text = clone.textContent.replace(/\s+/g, " ").trim();
      if (!text) return;

      const match = text.match(/^(.*?)(?:\s*x\s*([\d,]+))?$/i);
      if (!match) return;

      const label = match[1].replace(/"/g, "").trim();
      if (!label) return;

      const key = normalizeItemName(label);
      const baseQty = match[2] ? parseInt(match[2].replace(/,/g, ""), 10) || 1 : 1;
      const current = requiredTotals.get(key) || {
        label,
        needed: 0,
        have: quantityMap.get(key) || 0
      };

      current.needed += baseQty * Math.max(1, multiplier);
      requiredTotals.set(key, current);
    });

    return {
      requiredTotals: Array.from(requiredTotals.values()).sort((a, b) => a.label.localeCompare(b.label)),
      questLabel,
      multiplier: Math.max(1, multiplier)
    };
  }

  function renderCalculatorPanel() {
    if (!isWiki || (!isMergePage() && !isQuestPage())) {
      document.getElementById("aqw-helper-calculator")?.remove();
      return;
    }

    const oldPanel = document.getElementById("aqw-helper-calculator");
    if (oldPanel) {
      oldPanel.remove();
    }

    const panel = document.createElement("section");
    panel.id = "aqw-helper-calculator";
    panel.className = "aqw-helper-calculator";

    if (isMergePage()) {
      const result = collectMergeRequirements(calculatorState.mergeAc, calculatorState.mergeLegend);
      const materialRows = result.requiredTotals
        .map((material) => {
          const missing = Math.max(0, material.needed - material.have);
          return `
            <tr>
              <td>${escapeHtml(material.label)}</td>
              <td>${material.needed}</td>
              <td>${material.have}</td>
              <td class="${missing === 0 ? "ok" : "bad"}">${missing === 0 ? "Pronto" : missing}</td>
            </tr>
          `;
        })
        .join("");

      let gathered = 0;
      let needed = 0;
      result.requiredTotals.forEach((material) => {
        needed += material.needed;
        gathered += Math.min(material.have, material.needed);
      });
      const progress = needed > 0 ? Math.round((gathered / needed) * 100) : 0;

      panel.innerHTML = `
        <div class="aqw-helper-calculator-head">
          <div>
            <h3>Calculadora Farmadora</h3>
            <p>Resumo dos materiais que faltam para os itens do merge que voce ainda nao tem.</p>
          </div>
          <div class="aqw-helper-calculator-meta">Itens da shop: <strong>${result.ownedShopItems} / ${result.totalShopItems}</strong></div>
        </div>
        <div class="aqw-helper-calculator-controls">
          <label><input type="checkbox" id="aqw-helper-calc-ac" ${calculatorState.mergeAc ? "checked" : ""}> Apenas AC</label>
          <label><input type="checkbox" id="aqw-helper-calc-legend" ${calculatorState.mergeLegend ? "checked" : ""}> Apenas Legend</label>
        </div>
        <div class="aqw-helper-calculator-progress">
          <span>Progresso de materiais</span>
          <div class="aqw-helper-calculator-bar"><div style="width:${progress}%">${progress}%</div></div>
        </div>
        ${
          result.requiredTotals.length
            ? `<table class="aqw-helper-calculator-table">
                <thead>
                  <tr><th>Material</th><th>Precisa</th><th>Voce tem</th><th>Falta</th></tr>
                </thead>
                <tbody>${materialRows}</tbody>
              </table>`
            : `<p class="aqw-helper-calculator-empty">Nada faltando por aqui. Essa shop ja esta completa com os filtros atuais.</p>`
        }
      `;
    } else {
      const result = collectQuestRequirements(calculatorState.questMultiplier);
      const materialRows = result.requiredTotals
        .map((material) => {
          const missing = Math.max(0, material.needed - material.have);
          return `
            <tr>
              <td>${escapeHtml(material.label)}</td>
              <td>${material.needed}</td>
              <td>${material.have}</td>
              <td class="${missing === 0 ? "ok" : "bad"}">${missing === 0 ? "Pronto" : missing}</td>
            </tr>
          `;
        })
        .join("");

      panel.innerHTML = `
        <div class="aqw-helper-calculator-head">
          <div>
            <h3>Calculadora Farmadora</h3>
            <p>Requisitos para repetir a quest${result.questLabel ? ` <strong>${escapeHtml(result.questLabel)}</strong>` : ""}.</p>
          </div>
          <div class="aqw-helper-calculator-meta">Quest turns: <strong>${result.multiplier}x</strong></div>
        </div>
        <div class="aqw-helper-calculator-controls">
          <label>Repeticoes:
            <input type="number" id="aqw-helper-calc-quest" min="1" value="${result.multiplier}">
          </label>
        </div>
        ${
          result.requiredTotals.length
            ? `<table class="aqw-helper-calculator-table">
                <thead>
                  <tr><th>Item</th><th>Precisa</th><th>Voce tem</th><th>Falta</th></tr>
                </thead>
                <tbody>${materialRows}</tbody>
              </table>`
            : `<p class="aqw-helper-calculator-empty">Nao encontrei lista de requisitos nessa aba.</p>`
        }
      `;
    }

    const insertBefore = document.querySelector(".yui-navset") || document.querySelector("#page-content");
    if (insertBefore?.parentNode) {
      insertBefore.parentNode.insertBefore(panel, insertBefore);
    }

    const acCheckbox = document.getElementById("aqw-helper-calc-ac");
    const legendCheckbox = document.getElementById("aqw-helper-calc-legend");
    const questInput = document.getElementById("aqw-helper-calc-quest");

    acCheckbox?.addEventListener("change", (event) => {
      calculatorState.mergeAc = event.target.checked;
      renderCalculatorPanel();
    });

    legendCheckbox?.addEventListener("change", (event) => {
      calculatorState.mergeLegend = event.target.checked;
      renderCalculatorPanel();
    });

    questInput?.addEventListener("change", (event) => {
      const value = Math.max(1, parseInt(event.target.value, 10) || 1);
      calculatorState.questMultiplier = value;
      renderCalculatorPanel();
    });
  }

  function scheduleCalculatorRender(delay = 120) {
    clearTimeout(calculatorTimer);
    calculatorTimer = setTimeout(() => {
      renderCalculatorPanel();
    }, delay);
  }

  function isValidImg(srcImg) {
    if (!srcImg) return false;

    const url = srcImg.toLowerCase();
    const blocked = [
      "/image-tags/",
      "acsmall",
      "aclarge",
      "raresmall",
      "rarelarge",
      "legendsmall",
      "legendlarge",
      "membersmall",
      "memberlarge",
      "map",
      "npc"
    ];

    return !blocked.some((word) => url.includes(word));
  }

  function fetchHtmlThroughBackground(url) {
    return new Promise((resolve) => {
      try {
        if (!chrome?.runtime?.id) {
          resolve(null);
          return;
        }

        chrome.runtime.sendMessage({ action: "fetchHtml", url }, (response) => {
          if (chrome.runtime.lastError || !response?.ok) {
            resolve(null);
            return;
          }

          resolve(response.html || null);
        });
      } catch (_error) {
        resolve(null);
      }
    });
  }

  async function fetchHtmlWithFallback(url) {
    const backgroundHtml = await fetchHtmlThroughBackground(url);
    if (backgroundHtml) {
      return backgroundHtml;
    }

    try {
      const response = await fetch(url, { credentials: "omit" });
      if (!response.ok) {
        return null;
      }

      return await response.text();
    } catch (_error) {
      return null;
    }
  }

  function getImageCandidateSrc(img) {
    if (!img) return "";

    const direct =
      img.getAttribute("src") ||
      img.getAttribute("data-src") ||
      img.getAttribute("data-lazy-src") ||
      img.getAttribute("data-original") ||
      "";

    if (direct) {
      return direct;
    }

    const srcSet = img.getAttribute("srcset") || img.getAttribute("data-srcset") || "";
    if (!srcSet) {
      return "";
    }

    const firstSrc = srcSet.split(",")[0]?.trim().split(/\s+/)[0] || "";
    return firstSrc;
  }

  function normalizePreviewImageUrl(src) {
    const value = String(src || "").trim();
    if (!value) {
      return "";
    }

    if (value.startsWith("//")) {
      return `https:${value}`;
    }

    if (value.startsWith("/")) {
      return `https://aqwwiki.wikidot.com${value}`;
    }

    return value.replace("http://", "https://");
  }

  function extractPreviewImagesFromHtml(html) {
    const images = [];
    const pushImage = (src) => {
      const normalized = normalizePreviewImageUrl(src);
      if (!normalized || !isValidImg(normalized) || images.includes(normalized)) {
        return;
      }

      images.push(normalized);
    };

    const imgRegex = /<img[^>]+src="([^"]+)"[^>]*>/gi;
    let match;
    while ((match = imgRegex.exec(html)) !== null) {
      pushImage(match[1]);
    }

    const hrefImgRegex = /https?:\/\/i\.imgur\.com\/[a-z0-9]+\.(?:png|jpg|jpeg|gif|webp)/gi;
    while ((match = hrefImgRegex.exec(html)) !== null) {
      pushImage(match[0]);
    }

    return images;
  }

  function normalizePreviewName(name) {
    return String(name || "")
      .replace(/\s+\(\d+\)$/i, "")
      .replace(/\s+x\d+$/i, "")
      .trim();
  }

  function slugifyRawPreviewName(name) {
    return String(name || "")
      .toLowerCase()
      .replace(/\s+x\d+$/i, "")
      .replace(/[']/g, "-")
      .replace(/[()]/g, "")
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9\-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function buildPreviewUrls(itemName, href, details) {
    const urls = [];
    const pushUrl = (value) => {
      if (!value) return;
      const normalized = value.replace("http://", "https://");
      if (!urls.includes(normalized)) {
        urls.push(normalized);
      }
    };

    if (href) {
      if (href.startsWith("http://") || href.startsWith("https://")) {
        pushUrl(href);
      } else if (href.startsWith("/")) {
        pushUrl(`https://aqwwiki.wikidot.com${href}`);
      }
    }

    const detailSlug = details?.entry?.[0];
    if (typeof detailSlug === "string" && detailSlug.startsWith("/")) {
      pushUrl(`https://aqwwiki.wikidot.com${detailSlug}`);
    }

    const rawNames = [itemName, normalizePreviewName(itemName), normalizeItemName(itemName)];
    rawNames.forEach((value) => {
      if (value) {
        pushUrl(buildWikiUrlFromName(value));
      }
    });

    const rawSlug = slugifyRawPreviewName(itemName);
    if (rawSlug) {
      pushUrl(`https://aqwwiki.wikidot.com/${rawSlug}`);
    }

    return urls;
  }

  async function getPreviewData(urlToSearch, attempt = 1) {
    if (attempt > 2 || !urlToSearch) return null;

    if (previewCache.has(urlToSearch)) {
      return previewCache.get(urlToSearch);
    }

    const html = await fetchHtmlWithFallback(urlToSearch);
    if (!html) return null;

    try {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const foundImages = [];
      const pushImage = (src) => {
        const normalizedSrc = normalizePreviewImageUrl(src);
        if (!normalizedSrc || !isValidImg(normalizedSrc)) return;
        if (!foundImages.includes(normalizedSrc)) {
          foundImages.push(normalizedSrc);
        }
      };

      const maleImage = doc.querySelector("#wiki-tab-0-0 img");
      const femaleImage = doc.querySelector("#wiki-tab-0-1 img");

      pushImage(getImageCandidateSrc(maleImage));
      pushImage(getImageCandidateSrc(femaleImage));

      const ogImage = doc.querySelector('meta[property="og:image"], meta[name="og:image"]');
      pushImage(ogImage?.getAttribute("content") || "");

      if (foundImages.length === 0) {
        [
          "#page-content .image-container img",
          "#page-content .scp-image-block img",
          "#page-content .image-box img",
          "#page-content a.image img",
          "#page-content .thumbnail img",
          "#page-content img"
        ].forEach((selector) => {
          Array.from(doc.querySelectorAll(selector)).forEach((img) => pushImage(getImageCandidateSrc(img)));
        });
      }

      if (foundImages.length === 0) {
        const links = Array.from(doc.querySelectorAll("#page-content a"));
        const disambiguationLink = links.find((anchor) => {
          const href = anchor.getAttribute("href");
          if (!href) return false;

          const hrefLower = href.toLowerCase();
          return href.startsWith("/") && !hrefLower.includes(":") && !hrefLower.includes("npc");
        });

        if (disambiguationLink) {
          const nextUrl = `https://aqwwiki.wikidot.com${disambiguationLink.getAttribute("href")}`;
          return getPreviewData(nextUrl, attempt + 1);
        }
      }

      if (foundImages.length === 0) {
        extractPreviewImagesFromHtml(html).forEach((src) => pushImage(src));
      }

      const paragraphs = Array.from(doc.querySelectorAll("#page-content p"));
      let descriptionIndex = 2;

      for (let index = 0; index < paragraphs.length; index += 1) {
        if (paragraphs[index].textContent.includes("Location:")) {
          descriptionIndex = index;
          break;
        }
      }

      const descriptionNode = paragraphs[descriptionIndex] || null;
      const payload = {
        images: foundImages,
        description: descriptionNode ? descriptionNode.cloneNode(true) : null
      };

      previewCache.set(urlToSearch, payload);
      return payload;
    } catch (_error) {
      return null;
    }
  }

  function hidePreview() {
    previewBox.classList.remove("visible");
    previewBox.innerHTML = "";
  }

  function scheduleRemark(delay = 200) {
    clearTimeout(remarkTimer);
    remarkTimer = setTimeout(() => {
      markElements();
    }, delay);
  }

  function showPreview(data, itemName) {
    if (!data || !Array.isArray(data.images) || data.images.length === 0) {
      hidePreview();
      return;
    }

    previewBox.innerHTML = "";
    previewBox.classList.add("visible");

    const imgContainer = document.createElement("div");
    imgContainer.className = "img-container";

    const imageType = data.images.length > 1 ? "img-multiple" : "img-single";
    data.images.forEach((src) => {
      const image = document.createElement("img");
      image.src = src;
      image.alt = itemName;
      image.className = `img-add ${imageType}`;
      imgContainer.appendChild(image);
    });

    previewBox.appendChild(imgContainer);

    const title = document.createElement("p");
    title.className = "aqw-helper-preview-title";
    title.textContent = itemName;
    previewBox.appendChild(title);

    if (data.description) {
      const wrapper = document.createElement("div");
      wrapper.className = "aqw-helper-preview-text";
      wrapper.appendChild(data.description);
      previewBox.appendChild(wrapper);
    }
  }

  async function resolvePreviewUrl(target) {
    if (isWiki) {
      const link = target.closest("a");
      if (!link || isNonItemWikiLink(link) || shouldSkipWikiContext(link)) return null;

      const href = link.getAttribute("href") || "";
      const itemName = getLinkItemText(link);
      const details = getWikiItemDetails(await getWikiItemsData(), itemName);
      return buildPreviewUrls(itemName, href, details)[0] || null;
    }

    if (isCharPage) {
      const link = target.closest("a");
      if (!link) return null;

      const itemName = getLinkItemText(link);
      if (!isValidItemText(itemName)) return null;

      const details = getWikiItemDetails(await getWikiItemsData(), itemName);
      return buildPreviewUrls(itemName, "", details)[0] || null;
    }

    return null;
  }

  async function handleHover(target) {
    const link = resolvePreviewLink(target);
    if (!link) {
      return;
    }

    const itemName = getPreviewTargetText(link);
    if (isWiki && lowerUrl.includes("-badges")) {
      return;
    }
    if (isWiki && shouldSkipPreviewLink(link)) {
      return;
    }
    if (!isValidItemText(itemName)) return;

    const linkHref = link?.href || link?.getAttribute("href") || "";
    const details = await getWikiItemsData().then((data) => getWikiItemDetails(data, itemName));
    const previewUrls = buildPreviewUrls(itemName, linkHref, details);
    if (!previewUrls.length) return;

    clearTimeout(hoverTimer);
    activePreviewKey = getPreviewKey(link);
    hoverTimer = setTimeout(async () => {
      const currentKey = getPreviewKey(link);
      if (!currentKey || currentKey !== activePreviewKey) {
        return;
      }

      let data = null;
      for (const previewUrl of previewUrls) {
        data = await getPreviewData(previewUrl);
        if (data?.images?.length) {
          break;
        }
      }
      showPreview(data, itemName);
    }, 60);
  }

  function displayBoostBanner(boostsText) {
    if (!isWiki || !boostsText || boostsText.length === 0 || document.getElementById("aqw-boost-banner")) {
      return;
    }

    let boostImg = null;
    const boostName = boostsText[0].toLowerCase();

    if (boostName.includes("double exp")) {
      boostImg = chrome.runtime.getURL("images/XPBoost.png");
    } else if (boostName.includes("double class")) {
      boostImg = chrome.runtime.getURL("images/ClassBoost.png");
    } else if (boostName.includes("double rep")) {
      boostImg = chrome.runtime.getURL("images/RepBoost.png");
    } else {
      boostImg = chrome.runtime.getURL("images/GoldBoost.png");
    }

    const pageTitle = document.querySelector("#page-title");
    if (!pageTitle) return;

    const banner = document.createElement("div");
    banner.id = "aqw-boost-banner";
    banner.innerHTML = `
      ${boostImg ? `<img src="${boostImg}" alt="Boost Icon">` : ""}
      Active Server Boosts: <span>${boostsText.join(" | ")}</span>
    `;

    pageTitle.appendChild(banner);
  }

  function fetchAndUpdateBoosts() {
    if (!chrome?.runtime?.id) {
      return;
    }

    chrome.runtime.sendMessage({ action: "fetchArtixCalendar" }, (response) => {
      if (chrome.runtime.lastError) {
        return;
      }

      if (!response?.success || !response.data) {
        return;
      }

      try {
        const html = response.data;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let activeBoost = null;
        let shortestTimeDifference = Infinity;
        const eventRegex = /title:\s*'([^']+)'[\s\S]*?start:\s*'([^']+)'/g;
        let match;

        while ((match = eventRegex.exec(html)) !== null) {
          const eventText = match[1]
            .replace(/\\u[\dA-F]{4}/gi, (value) => String.fromCharCode(parseInt(value.replace(/\\u/g, ""), 16)))
            .trim();

          const eventDateStr = match[2];
          const textLower = eventText.toLowerCase();
          const isCoreBoost =
            textLower.includes("double exp") ||
            textLower.includes("double class") ||
            textLower.includes("double rep") ||
            textLower.includes("double gold") ||
            textLower.includes("double all");

          if (!isCoreBoost) {
            continue;
          }

          const eventDate = new Date(`${eventDateStr}T00:00:00`);
          if (eventDate <= today) {
            const daysDifference = today - eventDate;
            if (daysDifference < shortestTimeDifference) {
              shortestTimeDifference = daysDifference;
              activeBoost = eventText;
            }
          }
        }

        const foundBoosts = [];
        if (activeBoost) {
          foundBoosts.push(activeBoost.replace(/\s+\d{1,2}\.\d{1,2}\.\d{2,4}$/, "").trim());
        }

        chrome.storage.local.set({
          boostCache: {
            data: foundBoosts,
            expiresAt: Date.now() + (12 * 60 * 60 * 1000)
          }
        });

        if (foundBoosts.length > 0) {
          displayBoostBanner(foundBoosts);
        }
      } catch (_error) {
        // Ignore parse failures for the calendar banner.
      }
    });
  }

  function initBoostBanner() {
    if (!isWiki) return;

    chrome.storage.local.get(["boostCache"], (result) => {
      const cache = result.boostCache;
      if (cache && cache.expiresAt > Date.now()) {
        if (cache.data?.length) {
          displayBoostBanner(cache.data);
        }
        return;
      }

      fetchAndUpdateBoosts();
    });
  }

  document.addEventListener("mouseover", (event) => {
    handleHover(event.target);
  });

  document.addEventListener("mouseout", (event) => {
    const currentLink = resolvePreviewLink(event.target);
    if (!currentLink) return;

    const related = event.relatedTarget;
    if (related) {
      if (currentLink.contains?.(related)) {
        return;
      }

      const relatedLink = resolvePreviewLink(related);
      if (relatedLink && getPreviewKey(relatedLink) === getPreviewKey(currentLink)) {
        return;
      }

      if (previewBox.contains(related)) {
        return;
      }
    }

    clearTimeout(hoverTimer);
    activePreviewKey = "";
    hidePreview();
  });

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("a, button, li, em");
    if (!trigger) {
      return;
    }

    const triggerText = readNodeText(trigger);
    const href = trigger.closest("a")?.getAttribute("href") || "";
    const className = String(trigger.className || "");

    const looksLikeWikiTab =
      className.includes("yui-") ||
      className.includes("collapsible-block-link") ||
      /weapons|classes|armors|helms|back items|misc\. items|pets|houses|floor items|wall items/i.test(triggerText) ||
      href === "javascript:;" ||
      href.startsWith("#");

    if (looksLikeWikiTab) {
      scheduleRemark(250);
      scheduleRemark(900);
      scheduleCalculatorRender(250);
      scheduleCalculatorRender(900);
    }
  }, true);

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }

    if (changes[AQW_HELPER_STORAGE_KEY]) {
      refreshInventory(changes[AQW_HELPER_STORAGE_KEY].newValue || []);
    }
  });

  markElements();
  scheduleCalculatorRender(200);
  setTimeout(markElements, 1200);
  setTimeout(scheduleCalculatorRender, 1200);
  setTimeout(markElements, 2500);
  setTimeout(scheduleCalculatorRender, 2500);
  setTimeout(markElements, 5000);
  setTimeout(scheduleCalculatorRender, 5000);
  setTimeout(markElements, 9000);
  setTimeout(markElements, 14000);

  if (isSimpleListPage()) {
    const listRoot =
      document.querySelector("#page-content .list-pages-box") ||
      document.querySelector("#page-content");

    if (listRoot) {
      const listObserver = new MutationObserver(() => {
        markSimpleListPageLinks();
        markListPageItems();
      });

      listObserver.observe(listRoot, { childList: true, subtree: true });
    }
  }

  if (isQuestPage()) {
    const questRoot = document.querySelector(".yui-navset") || document.querySelector("#page-content");
    if (questRoot) {
      const questObserver = new MutationObserver(() => {
        markQuestPageLinks();
      });

      questObserver.observe(questRoot, { childList: true, subtree: true });
    }
  }

  initBoostBanner();
})();
