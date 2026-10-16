/* No website access or network calls. Shared by the event page and tests. */
(function (root) {
  "use strict";
  const DAY = 24 * 60 * 60 * 1000;
  const STATE_KEY = "zenfxCleanupState";
  const ACTIVITY_KEY = "zenfxLastActivity";
  const defaults = () => ({ enabled: true, history: [], lastRun: null, error: null });
  function decision(tab, activity, now) {
    if (tab.incognito) return "private";
    if (tab.active || tab.highlighted) return "selected";
    if (tab.pinned) return "pinned";
    // Fail closed if this Firefox/API cannot establish group membership.
    if (!Number.isInteger(tab.groupId)) return "group-status-unknown";
    if (tab.groupId >= 0) return "grouped";
    if (tab.audible || Object.values(tab.sharingState || {}).some(Boolean)) return "media";
    if (tab.status === "loading") return "loading";
    if (!/^https?:\/\//i.test(tab.url || "")) return "non-web";
    // Session metadata survives restart without treating restored background
    // tabs as newly visited. Native lastAccessed is a fallback until seeded.
    const timestamp = Number.isFinite(activity) && activity > 0 ? activity : tab.lastAccessed;
    if (!Number.isFinite(timestamp) || timestamp <= 0) return "age-unknown";
    return now - timestamp >= DAY ? "eligible" : "recent";
  }
  function createController(api, { clock = () => Date.now() } = {}) {
    let tail = Promise.resolve(), enabledOverride = null;
    const serial = task => { const next = tail.then(task, task); tail = next.catch(() => {}); return next; };
    async function state() { return { ...defaults(), ...(await api.storage.local.get(STATE_KEY))[STATE_KEY] }; }
    async function write(value) { if (enabledOverride !== null) value.enabled = enabledOverride; await api.storage.local.set({ [STATE_KEY]: value }); }
    async function stamp(id) {
      try { await api.sessions.setTabValue(id, ACTIVITY_KEY, clock()); } catch { /* The tab may already be closed. */ }
    }
    async function activity(id) { try { return await api.sessions.getTabValue(id, ACTIVITY_KEY); } catch { return undefined; } }
    async function initialize() {
      const s = await state();
      await write(s);
      for (const t of await api.tabs.query({})) {
        // First installation grants existing tabs a full 24-hour grace period.
        if (!Number.isFinite(await activity(t.id))) await stamp(t.id);
      }
      await api.alarms.create("zenfx-cleanup", { periodInMinutes: 5, delayInMinutes: 5 });
    }
    async function preview() {
      const s = await state(), now = clock(), rows = [];
      for (const t of await api.tabs.query({})) {
        rows.push({ id: t.id, title: t.title || t.url || "Untitled", reason: decision(t, await activity(t.id), now) });
      }
      return { enabled: s.enabled, rows, lastRun: s.lastRun, error: s.error, canUndo: s.history.some(h => h.closed || h.pending) };
    }
    function sweep() { return serial(async () => {
      let s = await state();
      if (!s.enabled) return { closed: [], paused: true };
      const now = clock(), closed = [];
      try {
        for (const snapshot of await api.tabs.query({})) {
          let initial = decision(snapshot, await activity(snapshot.id), now);
          // Preserve 24 hours after a protected tab is made ordinary.
          if (["selected", "pinned", "grouped", "media", "loading"].includes(initial)) {
            await stamp(snapshot.id); continue;
          }
          if (initial !== "eligible") continue;
          // Re-read immediately before closing: never act on a stale pin/group/selection.
          let fresh;
          try { fresh = await api.tabs.get(snapshot.id); } catch { continue; }
          if (decision(fresh, await activity(fresh.id), clock()) !== "eligible") continue;
          if (enabledOverride === false || !(await state()).enabled) break;
          const before = new Set((await api.sessions.getRecentlyClosed({ maxResults: 25 })).flatMap(e => e.tab ? [e.tab.sessionId] : []));
          const entry = { token: `${clock()}-${fresh.id}`, url: fresh.url, title: fresh.title || fresh.url, closedAt: clock(), closed: false, pending: true, tabId: fresh.id, sessionId: null };
          // A successful local recovery write is required before remove().
          s.history = [entry, ...s.history].slice(0, 200); await write(s);
          // The backup write may yield; recheck protections one final time.
          try { fresh = await api.tabs.get(fresh.id); } catch { continue; }
          if (decision(fresh, await activity(fresh.id), clock()) !== "eligible") continue;
          if (enabledOverride === false || !(await state()).enabled) break;
          await api.tabs.remove(fresh.id);
          entry.closed = true; entry.pending = false;
          const candidates = (await api.sessions.getRecentlyClosed({ maxResults: 25 })).filter(e => e.tab && !before.has(e.tab.sessionId) && e.tab.url === entry.url);
          if (candidates.length === 1) entry.sessionId = candidates[0].tab.sessionId;
          await write(s); closed.push(entry.token);
        }
        s.lastRun = clock(); s.error = null; await write(s);
        return { closed, paused: false };
      } catch (error) {
        s.error = String(error.message || error); try { await write(s); } catch { /* No removals continue when recovery storage fails. */ }
        return { closed, error: s.error };
      }
    }); }
    function setEnabled(enabled) { enabledOverride = !!enabled; return serial(async () => { const s = await state(); s.enabled = !!enabled; await write(s); return preview(); }); }
    function undo() { return serial(async () => {
      const s = await state();
      // A crash/storage failure after remove() may leave the pre-close backup.
      // Reconcile it against the original tab before offering a duplicate restore.
      for (const candidate of s.history.filter(h => h.pending)) {
        try { await api.tabs.get(candidate.tabId); candidate.pending = false; }
        catch { candidate.pending = false; candidate.closed = true; }
      }
      const entry = s.history.find(h => h.closed);
      if (!entry) { await write(s); return false; }
      let restored = false;
      if (entry.sessionId) { try { await api.sessions.restore(entry.sessionId); restored = true; } catch { /* Native history may have expired. */ } }
      if (!restored) await api.tabs.create({ url: entry.url, active: true });
      s.history = s.history.filter(h => h.token !== entry.token); await write(s); return true;
    }); }
    return { initialize, preview, sweep, stamp, setEnabled, undo };
  }
  const exported = { DAY, STATE_KEY, ACTIVITY_KEY, decision, createController };
  root.ZenfxCleanup = exported;
  if (typeof module !== "undefined") module.exports = exported;
})(globalThis);
