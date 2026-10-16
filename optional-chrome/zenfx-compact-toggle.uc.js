// ZenFX Compact Mode controls — Firefox 158 desktop browser chrome. macOS verified.
// OPTIONAL PRIVILEGED SCRIPT. No loader installed. See README.md.
// @name ZenFX Compact Mode controls
// @include chrome://browser/content/browser.xhtml
(() => {
  "use strict";
  if (document.documentElement.getAttribute("windowtype") !== "navigator:browser" || !window.gBrowser) return;
  window.ZenfxCompactToggle?.uninstall();
  const toolbar = document.getElementById("nav-bar");
  if (!toolbar) return;
  const prefs = ["zenfx.compact.top", "zenfx.compact.sidebar"];
  const enabled = () => prefs.every(name => Services.prefs.getBoolPref(name, false));
  const toggle = () => {
    const next = !enabled();
    for (const name of prefs) Services.prefs.setBoolPref(name, next);
  };
  const button = document.createXULElement("toolbarbutton");
  button.id = "zenfx-compact-toggle";
  button.classList.add("toolbarbutton-1", "chromeclass-toolbar-additional");
  button.setAttribute("label", "Compact Mode");
  button.setAttribute("aria-label", "Toggle Compact Mode");
  button.setAttribute("type", "checkbox");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><g fill="none" stroke="#7c8877" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="1.5" width="13" height="13" rx="2.5"/><path d="M2 5h12M5 5v9"/></g></svg>`;
  button.style.listStyleImage = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  const keyset = document.createXULElement("keyset");
  keyset.id = "zenfx-compact-keyset";
  const commandset = document.createXULElement("commandset");
  const command = document.createXULElement("command");
  command.id = "zenfx-compact-command";
  commandset.append(command);
  const key = document.createXULElement("key");
  key.id = "zenfx-compact-key";
  const shortcutPref = "zenfx.compact.shortcut";
  // Reuse Firefox's localized sidebar binding rather than guessing by platform.
  const sidebarKey = document.getElementById("toggleSidebarKb");
  const sidebarDisabled = sidebarKey?.getAttribute("disabled");
  const sidebarShortcut = sidebarKey?.getAttribute("key")
    ? { key: sidebarKey.getAttribute("key").toUpperCase(), modifiers: sidebarKey.getAttribute("modifiers") || "" }
    : sidebarKey?.getAttribute("keycode")
      ? { keycode: sidebarKey.getAttribute("keycode"), modifiers: sidebarKey.getAttribute("modifiers") || "" }
      : null;
  const defaultShortcut = sidebarShortcut || { key: "X", modifiers: "accel,alt" };
  const mac = Services.appinfo.OS === "Darwin";
  let shortcut;
  function normalizedModifiers(value) {
    return value.split(/[\s,]+/).filter(Boolean).map(m => m === "accel" ? (mac ? "meta" : "control") : m === "access" ? "alt" : m).sort().join(",");
  }
  function sameShortcut(a, b) {
    return !!a && !!b && normalizedModifiers(a.modifiers) === normalizedModifiers(b.modifiers) &&
      (a.key ? a.key.toUpperCase() === b.key?.toUpperCase() : a.keycode === b.keycode);
  }
  function restoreSidebarKey() {
    if (!sidebarKey) return;
    if (sidebarDisabled === null) sidebarKey.removeAttribute("disabled");
    else sidebarKey.setAttribute("disabled", sidebarDisabled);
  }
  function labelFor(value) {
    if (!value) return "No shortcut";
    const names = mac ? { accel: "⌘", control: "⌃", alt: "⌥", shift: "⇧", meta: "⌘" } : { accel: "Ctrl+", control: "Ctrl+", alt: "Alt+", shift: "Shift+", meta: "Meta+" };
    return value.modifiers.split(",").filter(Boolean).map(m => names[m] || "").join("") + (value.key || value.keycode.replace("VK_", ""));
  }
  function readShortcut() {
    try {
      const value = JSON.parse(Services.prefs.getStringPref(shortcutPref));
      if (value === null) return null;
      if (!value || typeof value.modifiers !== "string" || !/^(?:(?:accel|control|alt|shift|meta)(?:,|$))*$/.test(value.modifiers)) return defaultShortcut;
      if (typeof value.key === "string" && /^[A-Z0-9]$/.test(value.key)) return value;
      if (typeof value.keycode === "string" && /^VK_(?:F(?:[1-9]|1[0-9]|2[0-4])|SPACE|PERIOD|COMMA|HOME|END|PAGE_UP|PAGE_DOWN|INSERT|DELETE|UP|DOWN|LEFT|RIGHT)$/.test(value.keycode)) return value;
      return defaultShortcut;
    }
    catch { return defaultShortcut; }
  }
  function syncShortcut() {
    shortcut = readShortcut();
    // Only suppress the native action while Compact Mode owns its exact binding.
    if (sameShortcut(shortcut, sidebarShortcut)) sidebarKey.setAttribute("disabled", "true");
    else restoreSidebarKey();
    key.removeAttribute("key"); key.removeAttribute("keycode");
    if (shortcut) key.removeAttribute("disabled");
    else key.setAttribute("disabled", "true");
    if (shortcut) {
      key.setAttribute(shortcut.key ? "key" : "keycode", shortcut.key || shortcut.keycode);
      key.setAttribute("modifiers", shortcut.modifiers);
    }
    if (keyset.isConnected) {
      keyset.remove();
      document.documentElement.append(keyset);
    }
  }
  syncShortcut();
  key.setAttribute("command", command.id);
  keyset.append(key);
  const sync = () => {
    const on = enabled();
    button.setAttribute("checked", String(on));
    button.setAttribute("aria-pressed", String(on));
    button.setAttribute("tooltiptext", `Compact Mode: ${on ? "On" : "Off"} (${labelFor(shortcut)}). Right-click to change shortcut.`);
  };
  const panel = document.createElementNS("http://www.w3.org/1999/xhtml", "dialog");
  panel.id = "zenfx-compact-settings";
  panel.style.cssText = "padding:0;border:1px solid var(--zenfx-search-border);border-radius:11px;background:var(--zenfx-panel);color:var(--zenfx-foreground);box-shadow:var(--zenfx-shadow);max-width:calc(100vw - 32px);";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "ZenFX shortcut settings");
  const html = (tag, text) => {
    const e = document.createElementNS("http://www.w3.org/1999/xhtml", tag);
    if (text) e.textContent = text;
    return e;
  };
  const box = html("div");
  box.style.cssText = "padding:18px;width:320px;font:13px/1.5 system-ui;color:var(--zenfx-foreground);background:var(--zenfx-panel);border-radius:10px;";
  const heading = html("h2", "Compact Mode shortcut");
  heading.style.cssText = "font-size:17px;margin:0 0 8px;";
  const hint = html("p", "Click the field, then press your preferred key combination.");
  const field = html("input");
  field.id = "zenfx-shortcut-recorder"; field.readOnly = true;
  field.setAttribute("aria-label", "Record a new Compact Mode shortcut");
  field.style.cssText = "box-sizing:border-box;width:100%;padding:10px;border:1px solid currentColor;border-radius:7px;background:transparent;color:inherit;font:inherit;";
  const status = html("p"); status.id = "zenfx-shortcut-status"; status.setAttribute("role", "status");
  const actions = html("div"); actions.style.cssText = "display:flex;gap:7px;flex-wrap:wrap;";
  const save = html("button", "Save"), reset = html("button", "Use default"), clearKey = html("button", "No shortcut");
  for (const b of [save, reset, clearKey]) b.style.cssText = "font:inherit;padding:7px 10px;border:1px solid currentColor;border-radius:6px;background:transparent;color:inherit;cursor:pointer;";
  actions.append(save, reset, clearKey);
  box.append(heading, hint, field, status, actions, html("p", "Some system shortcuts are reserved. Escape cancels."));
  panel.append(box);
  document.documentElement.append(panel);
  let pendingShortcut;
  function conflict(value) {
    if (!value) return null;
    const modifiers = normalizedModifiers(value.modifiers);
    return Array.from(document.querySelectorAll("key")).find(other => other !== key && other !== sidebarKey && other.getAttribute("disabled") !== "true" &&
      normalizedModifiers(other.getAttribute("modifiers") || "") === modifiers &&
      (value.key ? other.getAttribute("key")?.toUpperCase() === value.key : other.getAttribute("keycode") === value.keycode));
  }
  function choose(value) {
    pendingShortcut = value;
    field.value = labelFor(value);
    const taken = conflict(value);
    save.disabled = !!taken;
    status.textContent = taken ? "Firefox or another shortcut already uses this combination." : "Ready to save.";
  }
  function openSettings(event) {
    event?.preventDefault();
    event?.stopPropagation();
    choose(shortcut);
    if (!panel.open) panel.showModal();
    field.focus();
  }
  function record(event) {
    if (event.key === "Escape" || event.key === "Tab") return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (["Meta", "Control", "Alt", "Shift"].includes(event.key) || event.repeat || event.isComposing) return;
    const modifiers = [];
    if (mac ? event.metaKey : event.ctrlKey) modifiers.push("accel");
    if (mac && event.ctrlKey) modifiers.push("control");
    if (!mac && event.metaKey) modifiers.push("meta");
    if (event.altKey) modifiers.push("alt");
    if (event.shiftKey) modifiers.push("shift");
    const code = event.code;
    let value;
    if (/^Key[A-Z]$/.test(code)) value = { key: code.slice(3) };
    else if (/^Digit[0-9]$/.test(code)) value = { key: code.slice(5) };
    else if (/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(code)) value = { keycode: "VK_" + code };
    else {
      const codes = { Space: "VK_SPACE", Period: "VK_PERIOD", Comma: "VK_COMMA", Home: "VK_HOME", End: "VK_END", PageUp: "VK_PAGE_UP", PageDown: "VK_PAGE_DOWN", Insert: "VK_INSERT", Delete: "VK_DELETE", ArrowUp: "VK_UP", ArrowDown: "VK_DOWN", ArrowLeft: "VK_LEFT", ArrowRight: "VK_RIGHT" };
      if (codes[code]) value = { keycode: codes[code] };
    }
    if (!value || (!modifiers.some(m => m !== "shift") && !code.startsWith("F"))) {
      save.disabled = true; status.textContent = "Use Command/Ctrl/Option with a key, or a function key."; return;
    }
    choose({ ...value, modifiers: modifiers.join(",") });
  }
  function saveShortcut() {
    if (save.disabled) return;
    Services.prefs.setStringPref(shortcutPref, JSON.stringify(pendingShortcut));
    panel.close();
  }
  field.addEventListener("keydown", record);
  save.addEventListener("click", saveShortcut);
  reset.addEventListener("click", () => choose(defaultShortcut));
  clearKey.addEventListener("click", () => choose(null));
  button.addEventListener("contextmenu", openSettings);
  const tools = document.getElementById("menu_ToolsPopup");
  const settingsMenu = document.createXULElement("menuitem");
  settingsMenu.id = "zenfx-settings-menuitem";
  settingsMenu.setAttribute("label", "ZenFX shortcut settings…");
  settingsMenu.addEventListener("command", openSettings);
  tools?.append(settingsMenu);
  const shortcutObserver = () => { syncShortcut(); sync(); };
  Services.prefs.addObserver(shortcutPref, shortcutObserver);
  button.addEventListener("command", toggle);
  command.addEventListener("command", toggle);
  // Keep the exit button beside the native navigation controls. Hovering the
  // top edge reveals it when compact; the shortcut works while chrome is hidden.
  toolbar.insertBefore(button, document.getElementById("nav-bar-overflow-button"));
  document.documentElement.append(commandset, keyset);
  for (const name of prefs) Services.prefs.addObserver(name, sync);
  sync();
  // The shared compact corner follows the actual toolbar, including bookmarks,
  // theme sizing and density changes. CSS-only installs retain their fallback.
  const root = document.documentElement;
  const heightProperty = "--zenfx-measured-top-height";
  const priorHeight = [root.style.getPropertyValue(heightProperty), root.style.getPropertyPriority(heightProperty)];
  const toolbox = document.getElementById("navigator-toolbox");
  const measureTop = () => {
    const height = toolbox.getBoundingClientRect().height;
    if (height > 0) root.style.setProperty(heightProperty, `${height}px`);
  };
  const heightObserver = new ResizeObserver(measureTop);
  heightObserver.observe(toolbox);
  measureTop();
  const api = window.ZenfxCompactToggle = {
    toggle,
    openSettings,
    get enabled() { return enabled(); },
    uninstall() {
      heightObserver.disconnect();
      if (priorHeight[0]) root.style.setProperty(heightProperty, ...priorHeight);
      else root.style.removeProperty(heightProperty);
      for (const name of prefs) Services.prefs.removeObserver(name, sync);
      Services.prefs.removeObserver(shortcutPref, shortcutObserver);
      restoreSidebarKey();
      button.removeEventListener("contextmenu", openSettings);
      panel.close(); panel.remove(); settingsMenu.remove();
      button.removeEventListener("command", toggle);
      command.removeEventListener("command", toggle);
      window.removeEventListener("unload", onUnload);
      button.remove(); keyset.remove(); commandset.remove();
      if (window.ZenfxCompactToggle === api) delete window.ZenfxCompactToggle;
    },
  };
  function onUnload() { api.uninstall(); }
  window.addEventListener("unload", onUnload, { once: true });
})();
