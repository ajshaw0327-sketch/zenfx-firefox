// ZenFX priorities and Clear — Firefox 158 browser chrome only.
// @include chrome://browser/content/browser.xhtml
(() => {
  "use strict";
  if (document.documentElement.getAttribute("windowtype") !== "navigator:browser" || !window.gBrowser) return;
  window.ZenfxTabHierarchy?.uninstall();
  const store = window.SessionStore || ChromeUtils.importESModule("resource:///modules/sessionstore/SessionStore.sys.mjs").SessionStore;
  const root = document.documentElement, strip = gBrowser.tabContainer;
  const pins = document.getElementById("pinned-tabs-container");
  const normal = document.getElementById("tabbrowser-arrowscrollbox");
  const context = document.getElementById("tabContextMenu");
  const newTabButton = document.getElementById("tabs-newtab-button");
  const favoriteKey = "zenfxFavorite", columnsProperty = "--zenfx-favorite-columns";
  const priorColumns = [pins.style.getPropertyValue(columnsProperty), pins.style.getPropertyPriority(columnsProperty)];
  const slots = new Map(), removers = [], dragRemovers = [];
  let priorityDrag = null;
  let queuedFrame = 0, updating = false, stopped = false, visibilityFrame = 0, sizeFrame = 0;
  let favoriteCount = 0, pinWidth = pins.getBoundingClientRect().width, clearCount = -1;
  const flag = (element, name, value) => {
    if (element.hasAttribute(name) !== value) element.toggleAttribute(name, value);
  };
  const html = tag => document.createElementNS("http://www.w3.org/1999/xhtml", tag);
  const listen = (target, type, fn, capture = false) => {
    target.addEventListener(type, fn, capture);
    removers.push(() => target.removeEventListener(type, fn, capture));
  };
  const favorite = tab => tab.pinned && !tab.closing && store.getCustomTabValue(tab, favoriteKey) === "true";
  const groups = () => Array.from(strip.querySelectorAll("tab-group")).filter(group => group.tabs.some(tab => !tab.closing));
  const clearable = tab => tab.isConnected && !tab.closing && !tab.pinned && !tab.group && !tab.hidden;
  function assignSlot(element, name) {
    if (!slots.has(element)) slots.set(element, element.getAttribute("slot"));
    if (element.getAttribute("slot") !== name) element.setAttribute("slot", name);
  }
  function restoreSlots() {
    for (const [element, value] of slots) {
      if (value === null) element.removeAttribute("slot");
      else element.setAttribute("slot", value);
    }
    slots.clear();
  }

  // Native light-DOM tab/group children stay where Firefox expects them. Named
  // slots place protected folders above Clear. The New Tab row lives in the
  // shadow tree so native tab enumeration and drag boundaries stay unchanged.
  const nativeSlot = normal.shadowRoot.querySelector('[part="items-wrapper"]');
  const protectedSlot = html("slot"); protectedSlot.name = "zenfx-protected-folders";
  const newTabRow = html("button"); newTabRow.id = "zenfx-newtab-row"; newTabRow.type = "button";
  const newTabLabel = html("span"); newTabLabel.className = "zenfx-newtab-label";
  newTabLabel.textContent = newTabButton.getAttribute("label") || "New Tab"; newTabRow.append(newTabLabel);
  newTabRow.setAttribute("aria-label", newTabLabel.textContent);
  newTabRow.title = newTabLabel.textContent;
  listen(newTabRow, "click", event => {
    if (event.button === 0) window.BrowserCommands.openTab({ event });
  });
  listen(newTabRow, "pointerdown", event => {
    if (event.button === 1) event.preventDefault();
  });
  listen(newTabRow, "pointerup", event => {
    if (event.button === 1) { event.preventDefault(); window.BrowserCommands.openTab({ event }); }
  });
  const clearRow = html("div"); clearRow.className = "zenfx-clear-row";
  const line = html("span"); line.className = "zenfx-clear-line"; line.setAttribute("aria-hidden", "true");
  const clearButton = html("button"); clearButton.id = "zenfx-clear-tabs"; clearButton.type = "button";
  clearButton.setAttribute("aria-label", "Clear ordinary tabs");
  clearButton.textContent = "↓ Clear";
  clearRow.append(line, clearButton);
  for (const element of [protectedSlot, clearRow, newTabRow]) nativeSlot.before(element);
  const regularStyle = html("style");
  regularStyle.textContent = `
    .zenfx-clear-row { display: none; }
    :host([zenfx-hierarchy-vertical]) [part="scrollbox"] {
      display: flex; flex-direction: column; align-items: stretch;
      /* Late native New Tab reveals must not animate toward stale geometry. */
      scroll-behavior: auto !important;
    }
    :host([zenfx-hierarchy-vertical]) slot[name="zenfx-protected-folders"] { display: contents; }
    #zenfx-newtab-row { display: none; }
    :host([zenfx-hierarchy-vertical]) #zenfx-newtab-row {
      display: flex; align-items: center; appearance: none; flex: 0 0 auto; min-height: 36px;
      border: 0; background: transparent; color: inherit; font: inherit; cursor: pointer;
      line-height: var(--tab-label-line-height); border-radius: var(--tab-border-radius);
      padding: 0 calc(var(--tab-padding-inline) - var(--tab-margin-inline-inner));
      width: var(--tab-collapsed-background-width); margin-inline: var(--tab-margin-inline-inner);
      margin-block: var(--tab-margin-block);
      -moz-window-dragging: no-drag;
    }
    :host([zenfx-hierarchy-expanded]) #zenfx-newtab-row {
      margin: 0 7px 2px; width: calc(100% - 14px); justify-content: start;
    }
    #zenfx-newtab-row:hover {
      background-color: var(--tab-background-color-hover); outline-color: var(--tab-border-color-hover);
    }
    #zenfx-newtab-row:hover:active {
      color: var(--button-text-color-ghost-active); background-color: var(--button-background-color-ghost-active);
    }
    #zenfx-newtab-row:focus-visible { outline: var(--focus-outline); outline-offset: var(--focus-outline-inset); }
    #zenfx-newtab-row::before {
      content: ""; width: 16px; height: 16px; flex: 0 0 16px; background: currentColor;
      mask: url(chrome://global/skin/icons/plus.svg) center / contain no-repeat;
    }
    #zenfx-newtab-row > .zenfx-newtab-label {
      text-align: start; padding-inline-start: var(--tab-icon-margin-inline-end); color: var(--toolbarbutton-icon-fill);
    }
    :host([zenfx-hierarchy-expanded]) #zenfx-newtab-row > .zenfx-newtab-label { display: flex; }
    :host(:not([zenfx-hierarchy-expanded])) #zenfx-newtab-row > .zenfx-newtab-label { display: none; }
    :host([zenfx-hierarchy-expanded]) .zenfx-clear-row {
      display: flex; align-items: center; gap: 6px; flex: 0 0 24px;
      min-height: 24px; margin: 3px 10px 1px; -moz-window-dragging: drag;
    }
    .zenfx-clear-line { flex: 1; height: 1px; background: var(--zenfx-hierarchy-line); }
    #zenfx-clear-tabs {
      appearance: none; border: 0; border-radius: 5px; padding: 3px 4px;
      background: transparent; color: var(--zenfx-foreground); opacity: .65;
      font: 500 11px/16px system-ui; cursor: pointer; -moz-window-dragging: no-drag;
    }
    #zenfx-clear-tabs:hover:not(:disabled) { background: var(--zenfx-hover); opacity: 1; }
    #zenfx-clear-tabs:focus-visible { outline: 2px solid var(--zenfx-accent); outline-offset: 1px; opacity: 1; }
    #zenfx-clear-tabs:disabled { opacity: .3; cursor: default; }
  `;
  normal.shadowRoot.append(regularStyle);
  const pinStyle = html("style");
  pinStyle.textContent = `
    :host([zenfx-hierarchy-expanded]) [part="items-wrapper"] {
      display: grid !important;
      grid-template-columns: repeat(var(--zenfx-favorite-columns, 1), minmax(0, 1fr)) !important;
      grid-auto-rows: auto !important; align-content: start !important;
      column-gap: 4px; row-gap: 0; padding: 4px 4px 0 !important;
    }
    :host([zenfx-hierarchy-expanded]) [part="items-wrapper"]::before,
    :host([zenfx-hierarchy-expanded]) [part="items-wrapper"]::after { content: none !important; }
  `;
  pins.shadowRoot.append(pinStyle);
  function sizeFavorites() {
    if (stopped) return;
    const available = Math.max(1, Math.floor((pinWidth - 16) / 44));
    const columns = String(Math.min(Math.max(favoriteCount, 1), 4, available));
    if (pins.style.getPropertyValue(columnsProperty) !== columns) pins.style.setProperty(columnsProperty, columns);
  }
  function syncExpansion(folders = groups()) {
    const vertical = strip.getAttribute("orient") === "vertical", expanded = vertical && strip.hasAttribute("expanded");
    for (const container of [pins, normal]) {
      flag(container, "zenfx-hierarchy-vertical", vertical);
      flag(container, "zenfx-hierarchy-expanded", expanded);
    }
    if (vertical) {
      for (const group of folders) assignSlot(group, "zenfx-protected-folders");
    } else restoreSlots();
    sizeFavorites();
  }
  const normalScrollbox = normal.shadowRoot.querySelector('[part="scrollbox"]');
  const pinnedScrollbox = pins.shadowRoot.querySelector('[part="scrollbox"]');
  const scrollboxFor = tab => tab.pinned ? pinnedScrollbox : normalScrollbox;
  function tabIsVisible(tab) {
    if (!tab?.isConnected || tab.closing || tab.hidden) return false;
    const rect = tab.getBoundingClientRect(), box = scrollboxFor(tab).getBoundingClientRect();
    return rect.height > 0 && box.height > 0 && rect.top >= box.top - 1 && rect.bottom <= box.bottom + 1 &&
      rect.left >= box.left - 1 && rect.right <= box.right + 1;
  }
  function revealSelected(tab = gBrowser.selectedTab, selectionChanged = false) {
    cancelAnimationFrame(visibilityFrame);
    visibilityFrame = 0;
    // Horizontal tabs use Firefox's own containers and selection scrolling.
    if (strip.getAttribute("orient") !== "vertical") return;
    const box = tab && scrollboxFor(tab), top = box?.scrollTop, left = box?.scrollLeft;
    visibilityFrame = requestAnimationFrame(() => {
      visibilityFrame = 0;
      if (stopped || priorityDrag || strip.hasAttribute("movingtab") || strip.hasAttribute("movingtabgroup") ||
          tab !== gBrowser.selectedTab || !tab?.isConnected || tab.closing || tab.hidden ||
          (!selectionChanged && (box.scrollTop !== top || box.scrollLeft !== left)) || tabIsVisible(tab)) return;
      // Background refresh yields to intervening scrolling. An explicit tab
      // selection also corrects native reveal geometry after folder layout.
      if (tab.getBoundingClientRect().height) (tab.pinned ? pins : normal).ensureElementIsVisible(tab, true);
    });
  }
  function refresh() {
    if (stopped || updating || priorityDrag || strip.hasAttribute("movingtab") || strip.hasAttribute("movingtabgroup")) return;
    cancelAnimationFrame(queuedFrame); queuedFrame = 0;
    updating = true;
    try {
      const selected = gBrowser.selectedTab, keepSelectionVisible = tabIsVisible(selected);
      const tabs = Array.from(gBrowser.tabs);
      const pinned = tabs.filter(tab => tab.pinned && !tab.closing);
      const favorites = new Set(pinned.filter(favorite));
      favoriteCount = favorites.size;
      const ordered = [...favorites, ...pinned.filter(tab => !favorites.has(tab))];
      const vertical = strip.getAttribute("orient") === "vertical";
      if (vertical) ordered.forEach((tab, tabIndex) => { if (tab.index !== tabIndex) gBrowser.moveTabTo(tab, { tabIndex }); });
      // Match native tab/keyboard order to the protected folders above Clear.
      let index = pinned.length;
      const folders = groups();
      for (const group of vertical ? folders : []) {
        const tabs = group.tabs.filter(tab => !tab.closing);
        if (tabs[0]?.index !== index) gBrowser.moveTabTo(group, { tabIndex: index, forceUngrouped: true });
        index += tabs.length;
      }
      for (const tab of tabs) flag(tab, "zenfx-favorite", favorites.has(tab));
      flag(root, "zenfx-has-favorites", favoriteCount > 0);
      flag(root, "zenfx-has-pins", pinned.length > favoriteCount);
      flag(root, "zenfx-has-folders", folders.length > 0);
      // Closed groups must not keep their DOM trees alive for this window.
      for (const [element, value] of slots) if (!element.isConnected || !normal.contains(element)) {
        if (element.ownerDocument === document && !element.isConnected) {
          if (value === null) element.removeAttribute("slot"); else element.setAttribute("slot", value);
        }
        slots.delete(element);
      }
      syncExpansion(folders);
      // Preserve an already-visible selection after layout changes. Background
      // tab activity must not pull a manually scrolled list back to selection.
      if (keepSelectionVisible) revealSelected(selected);
      const count = tabs.filter(clearable).length;
      if (count !== clearCount) {
        clearCount = count;
        clearButton.disabled = count === 0;
        clearButton.title = `Close ${count} ordinary tab${count === 1 ? "" : "s"}. Favorites, pinned tabs, folders, and hidden tabs stay. Use Firefox's Reopen Closed Tab to undo.`;
      }
    } finally { groupObserver.takeRecords(); updating = false; }
  }
  function schedule() {
    if (queuedFrame || updating || stopped) return;
    queuedFrame = requestAnimationFrame(() => { queuedFrame = 0; refresh(); });
  }
  function setTier(tab, tier) {
    if (!tab?.isConnected || tab.ownerDocument !== document || tab.closing || tab.splitview || !["favorite", "pinned", "today"].includes(tier)) return false;
    if (tier === "favorite") { store.setCustomTabValue(tab, favoriteKey, "true"); gBrowser.pinTab(tab); }
    else {
      store.deleteCustomTabValue(tab, favoriteKey);
      if (tier === "today" && tab.group) gBrowser.ungroupTab(tab);
      if (tier === "pinned") gBrowser.pinTab(tab); else gBrowser.unpinTab(tab);
    }
    refresh(); if (gBrowser.selectedTab === tab) revealSelected(tab); return true;
  }
  function markDrop(target = null, edge = null) {
    if (priorityDrag?.target === target && priorityDrag?.edge === edge) return;
    priorityDrag?.target?.removeAttribute("zenfx-priority-drop");
    if (priorityDrag) Object.assign(priorityDrag, { target, edge });
    if (target) target.setAttribute("zenfx-priority-drop", edge);
  }
  function endPriorityDrag() {
    markDrop();
    priorityDrag = null;
    for (const remove of dragRemovers.splice(0)) remove();
    if (!stopped) schedule();
  }
  function cleanNativeDrag(source) {
    const drag = strip.tabDragAndDrop;
    drag.finishMoveTogetherSelectedTabs(source);
    drag.finishAnimateTabMove();
    drag._resetTabsAfterDrop(source);
    drag._tabDropIndicator.hidden = true;
    source.style.removeProperty("transform");
  }
  function leavePinArea() {
    if (priorityDrag) { priorityDrag.inside = false; priorityDrag.geometry = null; }
    return null;
  }
  function pinDrop(event) {
    const state = priorityDrag, source = state?.source, dt = event.dataTransfer;
    if (!source?.isConnected || source.closing || source.splitview ||
        strip.getAttribute("orient") !== "vertical" || !strip.hasAttribute("expanded") ||
        event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return leavePinArea();
    try {
      if (!dt || dt.dropEffect === "copy" || dt.mozItemCount !== 1 ||
          dt.mozGetDataAt("application/x-moz-tabbrowser-tab", 0) !== source ||
          source._dragData?.movingTabs.length !== 1) return leavePinArea();
    } catch { return leavePinArea(); }
    // Let the native scroll buttons handle dragging through an overflowing area.
    const path = event.composedPath();
    if (path.includes(pins._scrollButtonUp) || path.includes(pins._scrollButtonDown)) {
      return leavePinArea();
    }
    const box = pins.getBoundingClientRect(), x = event.clientX, y = event.clientY;
    if (x < box.left || x > box.right || y < box.top || y > box.bottom || !box.height) {
      return leavePinArea();
    }
    if (!state.inside) {
      // Native grid animation assumes every pin has the same size. Restore the
      // real tile/row layout before using it as the drop target.
      cleanNativeDrag(source); state.inside = true; state.geometry = null;
    }
    const scroll = pins.scrollPosition;
    if (!state.geometry || state.scroll !== scroll) {
      state.scroll = scroll;
      state.geometry = Array.from(pins.children).filter(tab => tab.matches(".tabbrowser-tab") && !tab.closing)
        .map(tab => ({ tab, rect: tab.getBoundingClientRect(), favorite: favorite(tab) }));
    }
    let hit = null, distance = Infinity;
    for (const item of state.geometry) {
      const r = item.rect;
      const next = Math.max(r.left - x, 0, x - r.right) ** 2 + Math.max(r.top - y, 0, y - r.bottom) ** 2;
      if (next < distance) { hit = item; distance = next; }
    }
    if (!hit) return null;
    const after = hit.favorite ? (window.RTL_UI ? x < hit.rect.x + hit.rect.width / 2 : x > hit.rect.x + hit.rect.width / 2) : y > hit.rect.y + hit.rect.height / 2;
    return { tab: hit.tab, tier: hit.favorite ? "favorite" : "pinned", after,
      edge: hit.favorite ? (after !== !!window.RTL_UI ? "right" : "left") : after ? "bottom" : "top" };
  }
  listen(strip, "dragstart", event => {
    const source = event.composedPath().find(node => node.matches?.(".tabbrowser-tab"));
    if (!source || source.ownerDocument !== document || source.splitview ||
        strip.getAttribute("orient") !== "vertical" || !strip.hasAttribute("expanded")) return;
    endPriorityDrag(); priorityDrag = { source, target: null, inside: false, geometry: null };
    const started = priorityDrag;
    queueMicrotask(() => {
      if (priorityDrag === started && (!source._dragData || event.defaultPrevented)) endPriorityDrag();
    });
    const during = (target, type, callback) => {
      target.addEventListener(type, callback, true);
      dragRemovers.push(() => target.removeEventListener(type, callback, true));
    };
    during(document, "dragover", event => {
      const hit = pinDrop(event);
      markDrop(hit?.tab, hit?.edge);
      if (!hit) return;
      event.preventDefault(); event.stopImmediatePropagation();
      event.dataTransfer.dropEffect = "move";
    });
    during(document, "drop", event => {
      const hit = pinDrop(event);
      if (!hit) { endPriorityDrag(); return; }
      event.preventDefault(); event.stopImmediatePropagation();
      event.dataTransfer.dropEffect = "move";
      try {
        cleanNativeDrag(source);
        if (source !== hit.tab && setTier(source, hit.tier)) {
          if (hit.after) gBrowser.moveTabAfter(source, hit.tab);
          else gBrowser.moveTabBefore(source, hit.tab);
        }
      } finally {
        for (const item of strip.dragAndDropElements) delete item.currentIndex;
        delete source._dragData;
        endPriorityDrag();
      }
    });
    during(document, "dragend", endPriorityDrag);
    // A drag ending outside this document can lose its final dragend. The next
    // gesture or a window deactivation must not leave refresh permanently paused.
    during(document, "pointerdown", endPriorityDrag);
    during(window, "blur", event => { if (event.target === window && Services.focus.activeWindow !== window) endPriorityDrag(); });
    during(document, "keydown", event => { if (event.key === "Escape") endPriorityDrag(); });
    during(strip, "TabClose", event => { if (event.target === source) endPriorityDrag(); });
  }, true);
  function clearToday() {
    const tabs = Array.from(gBrowser.tabs).filter(clearable);
    if (!tabs.length) return;
    // Native removal retains beforeunload prompts and recently-closed recovery.
    // Keep this window open even if all remaining tabs are ordinary.
    gBrowser.removeTabs(tabs, { animate: false, closeWindowWithLastTab: false });
    schedule();
  }
  listen(clearButton, "click", clearToday);
  const menu = document.createXULElement("menu"); menu.id = "zenfx-tab-priority-menu"; menu.setAttribute("label", "Tab priority");
  const popup = document.createXULElement("menupopup"); menu.append(popup);
  const folderItem = document.createXULElement("menuitem");
  folderItem.id = "zenfx-tab-priority-folder";
  folderItem.setAttribute("label", "Folder (protected)");
  folderItem.setAttribute("type", "radio"); folderItem.setAttribute("name", "zenfx-tab-priority");
  folderItem.disabled = true; popup.append(folderItem);
  const items = new Map();
  for (const [tier, label] of [["favorite", "Favorites"], ["pinned", "Pinned tabs"], ["today", "Today tabs"]]) {
    const item = document.createXULElement("menuitem"); item.id = "zenfx-tab-priority-" + tier;
    item.setAttribute("type", "radio"); item.setAttribute("name", "zenfx-tab-priority"); item.setAttribute("label", label);
    listen(item, "command", () => setTier(window.TabContextMenu?.contextTab, tier)); popup.append(item); items.set(tier, item);
  }
  if (context) {
    context.insertBefore(menu, document.getElementById("context_pinTab"));
    listen(context, "popupshowing", event => {
      if (event.target !== context) return;
      const tab = window.TabContextMenu?.contextTab, valid = !!tab && !tab.closing && !tab.splitview;
      menu.disabled = !valid;
      if (!valid) menu.setAttribute("tooltiptext", "Separate Split View before changing a tab's priority."); else menu.removeAttribute("tooltiptext");
      const tier = valid ? favorite(tab) ? "favorite" : tab.pinned ? "pinned" : tab.group ? "folder" : "today" : null;
      folderItem.hidden = tier !== "folder";
      for (const item of [folderItem, ...items.values()]) item.removeAttribute("checked");
      const checked = tier === "folder" ? folderItem : items.get(tier);
      checked?.setAttribute("checked", "true");
    });
  }
  for (const type of ["TabOpen", "TabClose", "TabShow", "TabHide", "TabPinned", "TabMove", "TabGroupCreate", "TabGroupRemoved", "TabGrouped", "TabUngrouped", "SSTabRestoring", "SSTabRestored"]) listen(strip, type, schedule);
  listen(strip, "TabSelect", () => {
    // A collapsed folder reveals its selected child after native selection
    // layout. Its protected slot can then lie above the old scroll position.
    // Recheck on the next frame; ordinary refreshes still preserve manual scroll.
    cancelAnimationFrame(visibilityFrame);
    visibilityFrame = 0;
    if (strip.getAttribute("orient") !== "vertical") return;
    visibilityFrame = requestAnimationFrame(() => revealSelected(gBrowser.selectedTab, true));
  });
  // Loaded pages can finish their native visual switch after those frames.
  listen(window, "TabSwitchDone", () => revealSelected(gBrowser.selectedTab, true));
  listen(strip, "TabUnpinned", event => { store.deleteCustomTabValue(event.target, favoriteKey); event.target.removeAttribute("zenfx-favorite"); schedule(); });
  const expansionObserver = new MutationObserver(() => { syncExpansion(); schedule(); revealSelected(); });
  expansionObserver.observe(strip, { attributes: true, attributeFilter: ["expanded", "orient"] });
  const dragObserver = new MutationObserver(schedule);
  dragObserver.observe(strip, { attributes: true, attributeFilter: ["movingtab", "movingtabgroup"] });
  const groupObserver = new MutationObserver(records => {
    if (records.some(record => record.target === normal || ["tab-group", "tab-split-view-wrapper"].includes(record.target.localName))) schedule();
  });
  groupObserver.observe(normal, { childList: true, subtree: true });
  const sizeObserver = new ResizeObserver(entries => {
    if (priorityDrag) priorityDrag.geometry = null;
    const width = entries[0].borderBoxSize?.[0]?.inlineSize ?? pins.getBoundingClientRect().width;
    if (pinWidth === width) return;
    pinWidth = width;
    // Do not resize the observed grid synchronously inside ResizeObserver.
    if (!sizeFrame) sizeFrame = requestAnimationFrame(() => { sizeFrame = 0; sizeFavorites(); });
  }); sizeObserver.observe(pins);
  root.setAttribute("zenfx-tab-hierarchy", "true"); refresh(); revealSelected();
  const api = window.ZenfxTabHierarchy = {
    setTier, refresh, clearToday,
    tierOf(tab) { return favorite(tab) ? "favorite" : tab.pinned ? "pinned" : tab.group ? "folder" : "today"; },
    uninstall() {
      stopped = true;
      endPriorityDrag();
      cancelAnimationFrame(visibilityFrame); cancelAnimationFrame(queuedFrame);
      cancelAnimationFrame(sizeFrame);
      for (const remove of removers.splice(0)) remove();
      expansionObserver.disconnect(); dragObserver.disconnect(); groupObserver.disconnect(); sizeObserver.disconnect(); restoreSlots();
      for (const element of [menu, pinStyle, regularStyle, protectedSlot, clearRow, newTabRow]) element.remove();
      if (priorColumns[0]) pins.style.setProperty(columnsProperty, ...priorColumns); else pins.style.removeProperty(columnsProperty);
      for (const container of [pins, normal]) for (const name of ["zenfx-hierarchy-expanded", "zenfx-hierarchy-vertical"]) container.removeAttribute(name);
      for (const name of ["zenfx-tab-hierarchy", "zenfx-has-favorites", "zenfx-has-pins", "zenfx-has-folders"]) root.removeAttribute(name);
      for (const tab of gBrowser.tabs) tab.removeAttribute("zenfx-favorite");
      if (window.ZenfxTabHierarchy === api) delete window.ZenfxTabHierarchy;
    },
  };
  listen(window, "unload", () => api.uninstall());
})();
