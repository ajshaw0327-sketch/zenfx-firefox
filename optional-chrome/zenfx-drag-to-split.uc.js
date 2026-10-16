// ZenFX drag to Split View — Firefox 158 browser chrome only.
// OPTIONAL PRIVILEGED SCRIPT. No loader is installed. See README.md.
// @name ZenFX drag to Split View
// @include chrome://browser/content/browser.xhtml
(() => {
  "use strict";
  if (document.documentElement.getAttribute("windowtype") !== "navigator:browser" || !window.gBrowser?.addTabSplitView) return;
  window.ZenfxDragToSplit?.uninstall();
  const TAB_TYPE = "application/x-moz-tabbrowser-tab";
  let pressed = null, state = null, pending = null;
  const removers = [];
  const listen = (target, type, callback) => {
    target.addEventListener(type, callback, true);
    removers.push(() => target.removeEventListener(type, callback, true));
  };
  const closest = (node, selector) => (node?.nodeType === 1 ? node : node?.parentElement)?.closest(selector);
  const ordinary = tab => tab?.isConnected && tab.ownerDocument === document &&
    tab.matches(".tabbrowser-tab") && !tab.pinned && !tab.splitview && !tab.closing;
  function clear() {
    if (pending !== null) { clearTimeout(pending); pending = null; }
    state?.overlay.remove(); state = null; pressed = null;
  }
  function show(source, target) {
    if (!ordinary(source) || !ordinary(target) || source === target) return;
    clear();
    const box = document.getElementById("tabbrowser-tabpanels").getBoundingClientRect();
    const overlay = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
    overlay.id = "zenfx-split-drop-overlay";
    overlay.style.cssText = `position:fixed;left:${box.x}px;top:${box.y}px;width:${box.width}px;height:${box.height}px;z-index:7;display:flex;pointer-events:none;`;
    for (const side of ["left", "right"]) {
      const zone = document.createElementNS(overlay.namespaceURI, "div");
      zone.dataset.zenfxSplitSide = side;
      zone.style.cssText = "width:50%;height:100%;box-sizing:border-box;pointer-events:auto;padding:10px;display:flex;align-items:center;justify-content:center;border-radius:var(--zenfx-content-radius,10px);color:transparent;";
      const label = document.createElementNS(overlay.namespaceURI, "span");
      label.textContent = `Release to split ${side}`;
      label.style.cssText = "font:500 14px system-ui;padding:12px 18px;border-radius:10px;pointer-events:none;";
      zone.append(label); overlay.append(zone);
    }
    document.documentElement.append(overlay);
    state = { source, target, overlay, side: null, dropping: false };
    gBrowser.selectedTab = target;
  }
  function zoneFor(event) {
    if (!state || !ordinary(state.source) || !ordinary(state.target)) return null;
    const zone = closest(event.target, "[data-zenfx-split-side]");
    if (!zone || !state.overlay.contains(zone)) return null;
    try {
      const dt = event.dataTransfer;
      if (dt.mozItemCount !== 1 || dt.mozGetDataAt(TAB_TYPE, 0) !== state.source) return null;
      // Leave native copy/multi-tab/cross-window gestures alone.
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
    } catch { return null; }
    return zone;
  }
  listen(document, "pointerdown", event => {
    if (!event.isTrusted || event.button !== 0) return;
    const source = closest(event.target, ".tabbrowser-tab");
    pressed = source ? { source, target: gBrowser.selectedTab } : null;
  });
  listen(document, "dragstart", event => {
    if (!event.isTrusted) return;
    const source = closest(event.target, ".tabbrowser-tab");
    const target = pressed?.source === source ? pressed.target : null;
    // Native tab code populates DataTransfer and stops bubbling after capture.
    pending = setTimeout(() => {
      pending = null;
      if (event.defaultPrevented || !source?._dragData || source._dragData.movingTabs.length !== 1) return;
      show(source, target);
    }, 0);
  });
  listen(document, "dragover", event => {
    const zone = zoneFor(event);
    if (!zone) return;
    event.preventDefault(); event.stopImmediatePropagation();
    event.dataTransfer.dropEffect = "move";
    // Dragover fires repeatedly while the pointer stays on the same half.
    if (state.side === zone.dataset.zenfxSplitSide) return;
    state.side = zone.dataset.zenfxSplitSide;
    for (const child of state.overlay.children) {
      const active = child === zone;
      child.style.background = active ? "color-mix(in srgb,var(--zenfx-accent,AccentColor) 18%,transparent)" : "transparent";
      child.style.boxShadow = active ? "inset 0 0 0 2px var(--zenfx-accent,AccentColor)" : "none";
      child.style.color = active ? "var(--zenfx-foreground,CanvasText)" : "transparent";
      child.firstElementChild.style.background = active ? "var(--zenfx-panel,Canvas)" : "transparent";
    }
  });
  listen(document, "drop", event => {
    const zone = zoneFor(event);
    if (!zone) return;
    event.preventDefault(); event.stopImmediatePropagation();
    event.dataTransfer.dropEffect = "move";
    const { source, target } = state;
    state.dropping = true;
    const side = zone.dataset.zenfxSplitSide;
    // Finish the native strip animation BEFORE reparenting either tab. Once
    // inside a split wrapper, Firefox's cleanup walks the wrapper instead of
    // its children, leaving the dragged tab's inline translation behind.
    try {
      const nativeDrag = gBrowser.tabContainer.tabDragAndDrop;
      nativeDrag.finishMoveTogetherSelectedTabs(source);
      nativeDrag.finishAnimateTabMove();
      nativeDrag._resetTabsAfterDrop(source);
      nativeDrag._tabDropIndicator.hidden = true;
      source.style.removeProperty("transform");
      target.style.removeProperty("transform");
      const wrapper = gBrowser.addTabSplitView([target, source], { insertBefore: target });
      if (wrapper) {
        if (wrapper.tabs.indexOf(source) !== (side === "left" ? 0 : 1)) wrapper.reverseTabs();
        gBrowser.selectedTab = target;
      }
    } catch (error) {
      console.error("ZenFX could not create Split View:", error);
    } finally { clear(); }
  });
  listen(gBrowser.tabContainer, "TabClose", event => {
    if (state && (event.target === state.source || event.target === state.target)) clear();
  });
  listen(gBrowser.tabContainer, "TabSelect", () => {
    if (state && !state.dropping && gBrowser.selectedTab !== state.target) clear();
  });
  listen(window, "resize", clear);
  listen(document, "fullscreenchange", clear);
  listen(document, "dragend", () => clear());
  listen(document, "keydown", event => { if (event.key === "Escape") clear(); });
  const api = window.ZenfxDragToSplit = {
    get active() { return !!state; },
    uninstall() { clear(); for (const remove of removers.splice(0)) remove(); if (window.ZenfxDragToSplit === api) delete window.ZenfxDragToSplit; },
  };
  listen(window, "unload", () => api.uninstall());
})();
