/* Standard Firefox WebExtension event page, not a privileged chrome loader. */
"use strict";
const cleanup = ZenfxCleanup.createController(browser);
const reportError = error => console.error("ZenFX cleanup:", error);
browser.runtime.onInstalled.addListener(() => cleanup.initialize().catch(reportError));
browser.runtime.onStartup.addListener(() => cleanup.initialize().catch(reportError));
browser.alarms.onAlarm.addListener(alarm => { if (alarm.name === "zenfx-cleanup") cleanup.sweep().catch(reportError); });
browser.tabs.onCreated.addListener(tab => cleanup.stamp(tab.id));
// storage.session survives event-page suspension. Stamp the tab being left,
// so a long reading session receives the full 24 hours after switching away.
const activeKey = "zenfxActiveByWindow";
let active;
let activationQueue = (async () => {
  active = (await browser.storage.session.get(activeKey))[activeKey];
  // Event-page restarts retain this session map. Avoid querying every tab and
  // rewriting the map each time an unrelated event wakes the page.
  if (active) return;
  active = {};
  for (const tab of await browser.tabs.query({ active: true })) {
    if (active[tab.windowId] === undefined) active[tab.windowId] = tab.id;
  }
  await browser.storage.session.set({ [activeKey]: active });
})().catch(reportError);
browser.tabs.onActivated.addListener(info => {
  activationQueue = activationQueue.then(async () => {
    active ||= {};
    const previous = info.previousTabId ?? active[info.windowId];
    if (Number.isInteger(previous) && previous !== info.tabId) await cleanup.stamp(previous);
    await cleanup.stamp(info.tabId);
    active[info.windowId] = info.tabId;
    await browser.storage.session.set({ [activeKey]: active });
  }).catch(reportError);
});
// Closed windows must not accumulate entries throughout a long browser session.
browser.windows.onRemoved.addListener(windowId => {
  activationQueue = activationQueue.then(async () => {
    if (!active || !(windowId in active)) return;
    delete active[windowId];
    await browser.storage.session.set({ [activeKey]: active });
  }).catch(reportError);
});
browser.tabs.onUpdated.addListener((id, change) => {
  if (change.url !== undefined || change.pinned !== undefined || change.groupId !== undefined || change.hidden !== undefined) cleanup.stamp(id);
}, { properties: ["url", "pinned", "groupId", "hidden"] });
browser.runtime.onMessage.addListener((message, sender) => {
  if (sender.id !== browser.runtime.id) return undefined;
  if (message?.type === "preview") return cleanup.preview();
  if (message?.type === "enabled") return cleanup.setEnabled(message.enabled);
  if (message?.type === "undo") return cleanup.undo();
  return undefined;
});
