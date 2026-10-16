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
    previous.browser.userTypedValue = previous.userTypedValue;
    if (refresh) {
      input.view.close();
      input.searchMode = null;
      input.setURI({ dueToTabSwitch: true });
    }
    if (focus) gBrowser.selectedBrowser.focus();
  }
  function open() {
    if (!state) {
      state = { tab: gBrowser.selectedTab, browser: gBrowser.selectedBrowser,
        userTypedValue: gBrowser.selectedBrowser.userTypedValue, submitting: false };
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
