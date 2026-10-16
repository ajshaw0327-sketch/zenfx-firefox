// ZenFX tab hierarchy — Firefox 158 browser chrome only.
// Favorites are native pinned tabs with saved per-tab session metadata.
// @name ZenFX Favorites, Pinned tabs, Today tabs
// @include chrome://browser/content/browser.xhtml
(() => {
  "use strict";
  if (document.documentElement.getAttribute("windowtype") !== "navigator:browser" || !window.gBrowser) return;
  window.ZenfxTabHierarchy?.uninstall();
  const store = window.SessionStore || ChromeUtils.importESModule("resource:///modules/sessionstore/SessionStore.sys.mjs").SessionStore;
  const favoriteKey = "zenfxFavorite";
  const root = document.documentElement;
  const tabStrip = gBrowser.tabContainer;
  const pinsContainer = document.getElementById("pinned-tabs-container");
  const context = document.getElementById("tabContextMenu");
  const removers = [];
  let queued = false, updating = false, stopped = false;
  const columnsProperty = "--zenfx-favorite-columns";
  const priorColumns = [pinsContainer.style.getPropertyValue(columnsProperty), pinsContainer.style.getPropertyPriority(columnsProperty)];
  function sizeFavorites() {
    const count = Array.from(gBrowser.tabs).filter(tab => tab.pinned && tab.hasAttribute("zenfx-favorite") && !tab.closing).length;
    const available = Math.max(1, Math.floor((pinsContainer.getBoundingClientRect().width - 16) / 44));
    pinsContainer.style.setProperty(columnsProperty, Math.min(Math.max(count, 1), 4, available));
  }
  const sizeObserver = new ResizeObserver(sizeFavorites);
  sizeObserver.observe(pinsContainer);
  // Firefox does not expose slot pseudo-elements through ::part(). Style only
  // the headings inside its shadow tree; real tabs remain native light children.
  const headings = document.createElementNS("http://www.w3.org/1999/xhtml", "style");
  headings.textContent = `
    :host([zenfx-hierarchy-expanded]) [part="items-wrapper"] {
      display: grid !important;
      grid-template-columns: repeat(var(--zenfx-favorite-columns, 1), minmax(0, 1fr)) !important;
      grid-auto-rows: auto !important; align-content: start !important;
      column-gap: 4px; padding: 4px 4px 0 !important;
    }
    :host([zenfx-hierarchy-expanded]) [part="items-wrapper"]::before { content: none; }
    :host([zenfx-hierarchy-expanded][zenfx-has-favorites][zenfx-has-pins]) [part="items-wrapper"]::after {
      content: "Pinned tabs"; order: 0; grid-column: 1 / -1; display: block;
      box-sizing: border-box; height: 18px; margin: 3px 6px 1px;
      font: 500 10px/18px system-ui; color: transparent; pointer-events: none;
      background: linear-gradient(var(--zenfx-hierarchy-line), var(--zenfx-hierarchy-line)) center / 100% 1px no-repeat;
      -moz-window-dragging: drag;
    }
    :host([zenfx-hierarchy-expanded]:hover) [part="items-wrapper"]::after {
      color: var(--zenfx-hierarchy-label);
      background-position: right center;
      background-size: calc(100% - 64px) 1px;
    }
  `;
  pinsContainer.shadowRoot.append(headings);
  function syncExpansion() {
    pinsContainer.toggleAttribute("zenfx-hierarchy-expanded", tabStrip.getAttribute("orient") === "vertical" && tabStrip.hasAttribute("expanded"));
  }
  const expansionObserver = new MutationObserver(syncExpansion);
  expansionObserver.observe(tabStrip, { attributes: true, attributeFilter: ["expanded", "orient"] });
  syncExpansion();
  const listen = (target, type, fn) => {
    target.addEventListener(type, fn);
    removers.push(() => target.removeEventListener(type, fn));
  };
  const favorite = tab => tab.pinned && !tab.closing && store.getCustomTabValue(tab, favoriteKey) === "true";
  function refresh() {
    if (stopped || updating) return;
    updating = true;
    try {
      const pins = Array.from(gBrowser.tabs).filter(tab => tab.pinned && !tab.closing);
      const ordered = [...pins.filter(favorite), ...pins.filter(tab => !favorite(tab))];
      // Keep native tab order and visual/keyboard order identical. Do not wrap,
      // clone, or insert decorative children into Firefox's tab containers.
      ordered.forEach((tab, tabIndex) => {
        if (tab.index !== tabIndex) gBrowser.moveTabTo(tab, { tabIndex });
      });
      for (const tab of gBrowser.tabs) tab.toggleAttribute("zenfx-favorite", favorite(tab));
      root.toggleAttribute("zenfx-has-favorites", pins.some(favorite));
      root.toggleAttribute("zenfx-has-pins", pins.some(tab => !favorite(tab)));
      pinsContainer.toggleAttribute("zenfx-has-favorites", pins.some(favorite));
      pinsContainer.toggleAttribute("zenfx-has-pins", pins.some(tab => !favorite(tab)));
      sizeFavorites();
    } finally {
      updating = false;
    }
  }
  function schedule() {
    if (queued || updating || stopped) return;
    queued = true;
    queueMicrotask(() => { queued = false; refresh(); });
  }
  function setTier(tab, tier) {
    if (!tab?.isConnected || tab.ownerDocument !== document || tab.closing || tab.splitview || !["favorite", "pinned", "today"].includes(tier)) return false;
    if (tier === "favorite") {
      store.setCustomTabValue(tab, favoriteKey, "true");
      gBrowser.pinTab(tab);
    } else {
      store.deleteCustomTabValue(tab, favoriteKey);
      if (tier === "pinned") gBrowser.pinTab(tab);
      else gBrowser.unpinTab(tab);
    }
    refresh();
    return true;
  }
  const menu = document.createXULElement("menu");
  menu.id = "zenfx-tab-priority-menu";
  menu.setAttribute("label", "Tab priority");
  const popup = document.createXULElement("menupopup");
  menu.append(popup);
  const items = new Map();
  for (const [tier, label] of [["favorite", "Favorites"], ["pinned", "Pinned tabs"], ["today", "Today tabs"]]) {
    const item = document.createXULElement("menuitem");
    item.id = "zenfx-tab-priority-" + tier;
    item.setAttribute("type", "radio");
    item.setAttribute("name", "zenfx-tab-priority");
    item.setAttribute("label", label);
    listen(item, "command", () => setTier(window.TabContextMenu?.contextTab, tier));
    popup.append(item);
    items.set(tier, item);
  }
  if (context) {
    context.insertBefore(menu, document.getElementById("context_pinTab"));
    listen(context, "popupshowing", event => {
      if (event.target !== context) return;
      const tab = window.TabContextMenu?.contextTab;
      const valid = !!tab && !tab.closing && !tab.splitview;
      menu.disabled = !valid;
      if (!valid) menu.setAttribute("tooltiptext", "Separate Split View before changing a tab's priority.");
      else menu.removeAttribute("tooltiptext");
      const tier = valid ? favorite(tab) ? "favorite" : tab.pinned ? "pinned" : "today" : null;
      for (const [name, item] of items) item.setAttribute("checked", String(name === tier));
    });
  }
  for (const type of ["TabOpen", "TabClose", "TabPinned", "TabMove", "SSTabRestoring", "SSTabRestored"]) listen(gBrowser.tabContainer, type, schedule);
  listen(gBrowser.tabContainer, "TabUnpinned", event => {
    // Native Unpin Tab must not leave a hidden favorite flag for a later pin.
    store.deleteCustomTabValue(event.target, favoriteKey);
    event.target.removeAttribute("zenfx-favorite");
    schedule();
  });
  root.setAttribute("zenfx-tab-hierarchy", "true");
  refresh();
  const api = window.ZenfxTabHierarchy = {
    setTier,
    refresh,
    tierOf(tab) { return favorite(tab) ? "favorite" : tab.pinned ? "pinned" : "today"; },
    uninstall() {
      stopped = true;
      for (const remove of removers.splice(0)) remove();
      menu.remove();
      expansionObserver.disconnect();
      sizeObserver.disconnect();
      if (priorColumns[0]) pinsContainer.style.setProperty(columnsProperty, ...priorColumns);
      else pinsContainer.style.removeProperty(columnsProperty);
      headings.remove();
      for (const name of ["zenfx-hierarchy-expanded", "zenfx-has-favorites", "zenfx-has-pins"]) pinsContainer.removeAttribute(name);
      for (const name of ["zenfx-tab-hierarchy", "zenfx-has-favorites", "zenfx-has-pins"]) root.removeAttribute(name);
      for (const tab of gBrowser.tabs) tab.removeAttribute("zenfx-favorite");
      // Saved priority and native pinning survive unloading the presentation.
      if (window.ZenfxTabHierarchy === api) delete window.ZenfxTabHierarchy;
    },
  };
  listen(window, "unload", () => api.uninstall());
})();
