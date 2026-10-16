// ZenFX New Tab overlay — Firefox 158, browser chrome only.
// OPTIONAL PRIVILEGED SCRIPT. Does not install a loader. See README.md.
// @name ZenFX New Tab overlay
// @include chrome://browser/content/browser.xhtml
(() => {
  "use strict";
  if (document.documentElement.getAttribute("windowtype") !== "navigator:browser") return;
  window.ZenfxNewTabOverlay?.uninstall();
  if (!window.gBrowser || !window.gURLBar?.parentController?.loadURL) return;
  const input = gURLBar, controller = input.parentController;
  const originalLoad = controller.loadURL;
  const hadOwnLoad = Object.hasOwn(controller, "loadURL");
  const commands = new Set(["cmd_newNavigatorTab", "cmd_newNavigatorTabNoEvent"]);
  let state = null;
  const listeners = [];
  const listen = (target, name, callback, capture = true) => {
    target.addEventListener(name, callback, capture);
    listeners.push(() => target.removeEventListener(name, callback, capture));
  };
  function finish({ focus = false, refresh = true } = {}) {
    if (!state) return;
    const previous = state;
    state = null;
    document.documentElement.removeAttribute("zenfx-newtab-overlay");
    if (refresh && gBrowser.selectedTab === previous.tab) input.view.close();
    if (previous.tab.isConnected && !previous.tab.closing) {
      previous.browser.userTypedValue = previous.userTypedValue;
      if (gBrowser.selectedTab === previous.tab) {
        if (refresh) input.setURI({ dueToTabSwitch: true });
        input.searchMode = previous.searchMode;
      } else {
        // Native TabSelect has restored the destination input. Restore only the
        // origin browser's saved mode, without resetting the destination's URI.
        const destination = gBrowser.selectedBrowser;
        const saved = previous.otherSearchModes.get(destination);
        // Native tab switching can finish query teardown after focus changes.
        // Restore a pre-existing destination mode after that synchronous work.
        queueMicrotask(() => {
          if (previous.tab.isConnected && !previous.tab.closing && state?.browser !== previous.browser) {
            input.setSearchMode(previous.searchMode, previous.browser).catch(error => console.error("ZenFX search-mode restore:", error));
            previous.browser.userTypedValue = previous.userTypedValue;
          }
          if (!saved) return;
          if (state || gBrowser.selectedBrowser !== destination || !destination.isConnected || input.searchMode) return;
          destination.userTypedValue = saved.value;
          input.setURI({ dueToTabSwitch: true });
          input.searchMode = saved.mode;
        });
      }
      previous.browser.userTypedValue = previous.userTypedValue;
    }
    if (focus) gBrowser.selectedBrowser.focus();
  }
  function open() {
    if (!state) {
      const otherSearchModes = new Map();
      for (const tab of gBrowser.tabs) if (tab.linkedPanel && tab !== gBrowser.selectedTab) {
        const browser = tab.linkedBrowser, mode = input.getSearchMode(browser);
        if (mode) otherSearchModes.set(browser, { mode, value: browser.userTypedValue });
      }
      state = { tab: gBrowser.selectedTab, browser: gBrowser.selectedBrowser,
        userTypedValue: gBrowser.selectedBrowser.userTypedValue,
        searchMode: input.searchMode ? { ...input.searchMode } : null, otherSearchModes, submitting: false };
      document.documentElement.setAttribute("zenfx-newtab-overlay", "true");
      input.searchMode = null;
      input.search("");
    } else {
      input.focus();
    }
  }
  function loadURL(request) {
    if (!state || state.tab !== gBrowser.selectedTab) return originalLoad.call(this, request);
    // Retain Firefox's resolved search engine, POST data, security principal,
    // modifiers and native suggestions. Change only an ordinary current-tab load.
    state.submitting = true;
    const forwarded = { ...request, where: request.where === "current" ? "tab" : request.where };
    try { return originalLoad.call(this, forwarded); }
    finally { finish({ refresh: false }); }
  }
  controller.loadURL = loadURL;
  listen(document, "command", event => {
    if (event.target.id === "Browser:OpenLocation") {
      if (state) finish();
      return;
    }
    if (!commands.has(event.target.id)) return;
    // Native New Tab owns exiting content fullscreen and creating its new tab.
    if (document.documentElement.hasAttribute("inDOMFullscreen")) return;
    // Middle-click paste/new-tab and special modifier commands retain Firefox behavior.
    const source = event.sourceEvent;
    if (source?.button === 1 || source?.shiftKey || source?.altKey) return;
    event.preventDefault(); event.stopImmediatePropagation(); open();
  });
  listen(window, "keydown", event => {
    if (!state || event.key !== "Escape" || event.isComposing) return;
    event.preventDefault(); event.stopImmediatePropagation(); finish({ focus: true });
  });
  listen(document, "pointerdown", event => {
    if (!state || state.submitting || input.contains(event.target)) return;
    // Native results are in the input's top-layer popover subtree.
    if (event.composedPath().includes(input)) return;
    finish();
  });
  listen(gBrowser.tabContainer, "TabSelect", () => {
    if (state && !state.submitting && state.tab !== gBrowser.selectedTab) finish();
  });
  listen(gBrowser.tabContainer, "TabClose", event => {
    if (state?.tab === event.target) finish({ refresh: false });
  });
  listen(document, "focusin", event => {
    if (state && !state.submitting && event.target === gBrowser.selectedBrowser) finish();
  });
  const api = window.ZenfxNewTabOverlay = {
    open,
    cancel: () => finish({ focus: true }),
    get active() { return !!state; },
    uninstall() {
      finish();
      for (const remove of listeners.splice(0)) remove();
      if (controller.loadURL === loadURL) {
        if (hadOwnLoad) controller.loadURL = originalLoad;
        else delete controller.loadURL;
      }
      if (window.ZenfxNewTabOverlay === api) delete window.ZenfxNewTabOverlay;
    },
  };
  listen(window, "unload", () => api.uninstall());
})();
