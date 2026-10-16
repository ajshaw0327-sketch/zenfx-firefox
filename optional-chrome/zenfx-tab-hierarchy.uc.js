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
  const periphery = document.getElementById("tabbrowser-arrowscrollbox-periphery");
  const favoriteKey = "zenfxFavorite", columnsProperty = "--zenfx-favorite-columns";
  const priorColumns = [pins.style.getPropertyValue(columnsProperty), pins.style.getPropertyPriority(columnsProperty)];
  const slots = new Map(), removers = [];
  let queued = false, updating = false, stopped = false, visibilityFrame = 0;
  const html = tag => document.createElementNS("http://www.w3.org/1999/xhtml", tag);
  const listen = (target, type, fn) => {
    target.addEventListener(type, fn);
    removers.push(() => target.removeEventListener(type, fn));
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
  // slots place protected folders, the Clear row, New Tab, then ordinary tabs.
  const nativeSlot = normal.shadowRoot.querySelector('[part="items-wrapper"]');
  const protectedSlot = html("slot"); protectedSlot.name = "zenfx-protected-folders";
  const newTabSlot = html("slot"); newTabSlot.name = "zenfx-newtab-row";
  const clearRow = html("div"); clearRow.className = "zenfx-clear-row";
  const line = html("span"); line.className = "zenfx-clear-line"; line.setAttribute("aria-hidden", "true");
  const clearButton = html("button"); clearButton.id = "zenfx-clear-tabs"; clearButton.type = "button";
  clearButton.setAttribute("aria-label", "Clear ordinary tabs");
  clearButton.textContent = "↓ Clear";
  clearRow.append(line, clearButton);
  for (const element of [protectedSlot, clearRow, newTabSlot]) nativeSlot.before(element);
  const regularStyle = html("style");
  regularStyle.textContent = `
    .zenfx-clear-row { display: none; }
    :host([zenfx-hierarchy-vertical]) [part="scrollbox"] {
      display: flex; flex-direction: column; align-items: stretch;
    }
    :host([zenfx-hierarchy-vertical]) slot[name="zenfx-protected-folders"],
    :host([zenfx-hierarchy-vertical]) slot[name="zenfx-newtab-row"] { display: contents; }
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
    const count = Array.from(gBrowser.tabs).filter(tab => tab.pinned && tab.hasAttribute("zenfx-favorite") && !tab.closing).length;
    const available = Math.max(1, Math.floor((pins.getBoundingClientRect().width - 16) / 44));
    pins.style.setProperty(columnsProperty, Math.min(Math.max(count, 1), 4, available));
  }
  function syncExpansion() {
    const vertical = strip.getAttribute("orient") === "vertical", expanded = vertical && strip.hasAttribute("expanded");
    for (const container of [pins, normal]) {
      container.toggleAttribute("zenfx-hierarchy-vertical", vertical);
      container.toggleAttribute("zenfx-hierarchy-expanded", expanded);
    }
    if (vertical) {
      assignSlot(periphery, "zenfx-newtab-row");
      for (const group of groups()) assignSlot(group, "zenfx-protected-folders");
    } else restoreSlots();
    sizeFavorites();
  }
  function refresh() {
    if (stopped || updating || strip.hasAttribute("movingtab") || strip.hasAttribute("movingtabgroup")) return;
    updating = true;
    try {
      const pinned = Array.from(gBrowser.tabs).filter(tab => tab.pinned && !tab.closing);
      const ordered = [...pinned.filter(favorite), ...pinned.filter(tab => !favorite(tab))];
      ordered.forEach((tab, tabIndex) => { if (tab.index !== tabIndex) gBrowser.moveTabTo(tab, { tabIndex }); });
      // Match native tab/keyboard order to the protected folders above Clear.
      let index = pinned.length;
      const folders = groups();
      for (const group of strip.getAttribute("orient") === "vertical" ? folders : []) {
        const tabs = group.tabs.filter(tab => !tab.closing);
        if (tabs[0]?.index !== index) gBrowser.moveTabTo(group, { tabIndex: index, forceUngrouped: true });
        index += tabs.length;
      }
      for (const tab of gBrowser.tabs) tab.toggleAttribute("zenfx-favorite", favorite(tab));
      root.toggleAttribute("zenfx-has-favorites", pinned.some(favorite));
      root.toggleAttribute("zenfx-has-pins", pinned.some(tab => !favorite(tab)));
      root.toggleAttribute("zenfx-has-folders", folders.length > 0);
      // Closed groups must not keep their DOM trees alive for this window.
      for (const [element, value] of slots) if (!element.isConnected || !normal.contains(element)) {
        if (element.ownerDocument === document && !element.isConnected) {
          if (value === null) element.removeAttribute("slot"); else element.setAttribute("slot", value);
        }
        slots.delete(element);
      }
      syncExpansion();
      // Reordering protected folders and assigning slots changes scroll geometry
      // after Firefox has already revealed the selected tab.
      cancelAnimationFrame(visibilityFrame);
      visibilityFrame = requestAnimationFrame(() => {
        visibilityFrame = 0;
        const selected = gBrowser.selectedTab;
        if (!stopped && !strip.hasAttribute("movingtab") && !strip.hasAttribute("movingtabgroup") && selected?.isConnected) {
          (selected.pinned ? pins : normal).ensureElementIsVisible(selected, false);
        }
      });
      const count = Array.from(gBrowser.tabs).filter(clearable).length;
      clearButton.disabled = count === 0;
      clearButton.title = `Close ${count} ordinary tab${count === 1 ? "" : "s"}. Favorites, pinned tabs, folders, and hidden tabs stay. Use Firefox's Reopen Closed Tab to undo.`;
    } finally { updating = false; }
  }
  function schedule() {
    if (queued || updating || stopped) return;
    queued = true;
    queueMicrotask(() => { queued = false; refresh(); });
  }
  function setTier(tab, tier) {
    if (!tab?.isConnected || tab.ownerDocument !== document || tab.closing || tab.splitview || !["favorite", "pinned", "today"].includes(tier)) return false;
    if (tier === "favorite") { store.setCustomTabValue(tab, favoriteKey, "true"); gBrowser.pinTab(tab); }
    else {
      store.deleteCustomTabValue(tab, favoriteKey);
      if (tier === "today" && tab.group) gBrowser.ungroupTab(tab);
      if (tier === "pinned") gBrowser.pinTab(tab); else gBrowser.unpinTab(tab);
    }
    refresh(); return true;
  }
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
  listen(strip, "TabUnpinned", event => { store.deleteCustomTabValue(event.target, favoriteKey); event.target.removeAttribute("zenfx-favorite"); schedule(); });
  const expansionObserver = new MutationObserver(syncExpansion);
  expansionObserver.observe(strip, { attributes: true, attributeFilter: ["expanded", "orient"] });
  const dragObserver = new MutationObserver(schedule);
  dragObserver.observe(strip, { attributes: true, attributeFilter: ["movingtab", "movingtabgroup"] });
  const groupObserver = new MutationObserver(records => {
    if (records.some(record => record.target === normal || ["tab-group", "tab-split-view-wrapper"].includes(record.target.localName))) schedule();
  });
  groupObserver.observe(normal, { childList: true, subtree: true });
  const sizeObserver = new ResizeObserver(sizeFavorites); sizeObserver.observe(pins);
  root.setAttribute("zenfx-tab-hierarchy", "true"); refresh();
  const api = window.ZenfxTabHierarchy = {
    setTier, refresh, clearToday,
    tierOf(tab) { return favorite(tab) ? "favorite" : tab.pinned ? "pinned" : tab.group ? "folder" : "today"; },
    uninstall() {
      stopped = true;
      cancelAnimationFrame(visibilityFrame);
      for (const remove of removers.splice(0)) remove();
      expansionObserver.disconnect(); dragObserver.disconnect(); groupObserver.disconnect(); sizeObserver.disconnect(); restoreSlots();
      for (const element of [menu, pinStyle, regularStyle, protectedSlot, clearRow, newTabSlot]) element.remove();
      if (priorColumns[0]) pins.style.setProperty(columnsProperty, ...priorColumns); else pins.style.removeProperty(columnsProperty);
      for (const container of [pins, normal]) for (const name of ["zenfx-hierarchy-expanded", "zenfx-hierarchy-vertical"]) container.removeAttribute(name);
      for (const name of ["zenfx-tab-hierarchy", "zenfx-has-favorites", "zenfx-has-pins", "zenfx-has-folders"]) root.removeAttribute(name);
      for (const tab of gBrowser.tabs) tab.removeAttribute("zenfx-favorite");
      if (window.ZenfxTabHierarchy === api) delete window.ZenfxTabHierarchy;
    },
  };
  listen(window, "unload", () => api.uninstall());
})();
