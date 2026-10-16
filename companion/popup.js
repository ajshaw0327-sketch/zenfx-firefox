"use strict";
const enabled = document.getElementById("enabled"), status = document.getElementById("status"), list = document.getElementById("eligible"), undo = document.getElementById("undo");
let busy = false, lastState = null;
async function refresh() {
  const state = await browser.runtime.sendMessage({ type: "preview" });
  lastState = state;
  enabled.checked = state.enabled; undo.disabled = !state.canUndo;
  const eligible = state.rows.filter(t => t.reason === "eligible");
  const unknown = state.rows.some(t => t.reason === "group-status-unknown");
  status.textContent = state.error ? `Cleanup stopped: ${state.error}` : unknown ? "Tabs with unknown group status are protected." : `${eligible.length} tab${eligible.length === 1 ? "" : "s"} eligible${state.enabled ? " for the next check" : "; cleanup paused"}.`;
  list.replaceChildren(...eligible.map(tab => { const item = document.createElement("li"); item.textContent = tab.title; return item; }));
}
async function run(action = async () => {}) {
  if (busy) return;
  busy = true; enabled.disabled = true; undo.disabled = true;
  try { await action(); await refresh(); }
  catch (error) {
    if (lastState) enabled.checked = lastState.enabled;
    status.textContent = `Could not update cleanup: ${error.message || error}`;
  } finally {
    busy = false; enabled.disabled = false; undo.disabled = !lastState?.canUndo;
  }
}
enabled.addEventListener("change", () => run(() => browser.runtime.sendMessage({ type: "enabled", enabled: enabled.checked })));
undo.addEventListener("click", () => run(() => browser.runtime.sendMessage({ type: "undo" })));
run();
