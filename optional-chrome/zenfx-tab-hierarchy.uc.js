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
  // Firefox does not expose slot pseudo-elements through ::part(). Style only
  // the headings inside its shadow tree; real tabs remain native light children.
  const headings = document.createElementNS("http://www.w3.org/1999/xhtml", "style");
  headings.textContent = `
    :host([zenfx-hierarchy-expanded]) [part="items-wrapper"]::before,
    :host([zenfx-hierarchy-expanded]) [part="items-wrapper"]::after {
      display: block; grid-column: 1 / -1; padding: 10px 10px 6px;
      font: 600 11px/1.4 system-ui;
      color: color-mix(in srgb, currentColor 76%, transparent);
      text-align: start; pointer-events: none; -moz-window-dragging: drag;
    }
    :host([zenfx-hierarchy-expanded][zenfx-has-favorites]) [part="items-wrapper"]::before {
      content: "Favorites"; order: -2;
    }
    :host([zenfx-hierarchy-expanded][zenfx-has-pins]) [part="items-wrapper"]::after {
      content: "Pinned tabs"; order: 0;
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
