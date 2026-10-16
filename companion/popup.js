"use strict";
const enabled = document.getElementById("enabled"), status = document.getElementById("status"), list = document.getElementById("eligible"), undo = document.getElementById("undo");
async function refresh() {
  const state = await browser.runtime.sendMessage({ type: "preview" });
  enabled.checked = state.enabled; undo.disabled = !state.canUndo;
  const eligible = state.rows.filter(t => t.reason === "eligible");
  const unknown = state.rows.some(t => t.reason === "group-status-unknown");
  status.textContent = state.error ? `Cleanup stopped: ${state.error}` : unknown ? "Tabs with unknown group status are protected." : `${eligible.length} tab${eligible.length === 1 ? "" : "s"} eligible${state.enabled ? " for the next check" : "; cleanup paused"}.`;
  list.replaceChildren(...eligible.map(tab => { const item = document.createElement("li"); item.textContent = tab.title; return item; }));
}
enabled.addEventListener("change", async () => { await browser.runtime.sendMessage({ type: "enabled", enabled: enabled.checked }); await refresh(); });
undo.addEventListener("click", async () => { await browser.runtime.sendMessage({ type: "undo" }); await refresh(); });
refresh().catch(error => { status.textContent = String(error.message || error); });
