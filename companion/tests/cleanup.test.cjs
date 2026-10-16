const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const box = { module: { exports: {} } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../cleanup.js'), 'utf8'), box);
const { DAY, STATE_KEY, ACTIVITY_KEY, decision, createController } = box.module.exports;
const NOW = DAY * 100;
const ordinary = (extra = {}) => ({ id: 1, groupId: -1, active: false, highlighted: false, pinned: false, status: 'complete', url: 'https://example.com/old', lastAccessed: NOW - 2 * DAY, ...extra });
function fixture({ tabs = [ordinary()], fresh = {}, failBackup = false, duringBackup = null } = {}) {
  const records = new Map(tabs.map(t => [t.id, { ...t }])), values = new Map(tabs.map(t => [t.id, NOW - 2 * DAY]));
  let storage = {}, mutated = false; const removed = [], created = [], alarms = [];
  const api = {
    tabs: { query: async () => [...records.values()].map(t => ({ ...t })), get: async id => { if (!records.has(id)) throw Error('closed'); return { ...records.get(id), ...fresh }; }, remove: async id => { removed.push(id); records.delete(id); }, create: async opts => { created.push(opts); return {}; } },
    sessions: { getTabValue: async id => values.get(id), setTabValue: async (id, key, value) => { assert.equal(key, ACTIVITY_KEY); values.set(id, value); }, getRecentlyClosed: async () => [], restore: async () => { throw Error('expired'); } },
    storage: { local: { get: async () => structuredClone(storage), set: async data => { if (data[STATE_KEY]?.history?.length) { if (failBackup) throw Error('quota'); if (!mutated && duringBackup) { mutated = true; duringBackup(records); } } storage = structuredClone(data); } } },
    alarms: { create: async (...args) => alarms.push(args) }
  };
  return { api, controller: createController(api, { clock: () => NOW }), records, values, removed, created, alarms, state: () => storage[STATE_KEY] };
}
test('24-hour boundary and session clock survive background restore timestamps', () => {
  assert.equal(decision(ordinary(), NOW - DAY + 1, NOW), 'recent');
  assert.equal(decision(ordinary(), NOW - DAY, NOW), 'eligible');
  assert.equal(decision(ordinary({ lastAccessed: NOW }), NOW - 2 * DAY, NOW), 'eligible');
  assert.equal(decision(ordinary(), NOW, NOW), 'recent');
});
test('pinned, grouped (including zero), active, selected, media, private, loading and non-web tabs are protected', () => {
  for (const fields of [{ pinned: true }, { groupId: 0 }, { groupId: 4 }, { active: true }, { highlighted: true }, { audible: true }, { sharingState: { camera: true } }, { incognito: true }, { status: 'loading' }, { url: 'about:config' }, { url: 'file:///notes.html' }]) assert.notEqual(decision(ordinary(fields), NOW - 2 * DAY, NOW), 'eligible');
  assert.equal(decision(ordinary({ groupId: undefined }), NOW - 2 * DAY, NOW), 'group-status-unknown');
  assert.equal(decision(ordinary({ lastAccessed: undefined }), undefined, NOW), 'age-unknown');
});
test('first install grants existing tabs a full grace period and schedules alarm', async () => {
  const f = fixture(); f.values.clear(); await f.controller.initialize();
  assert.equal(f.values.get(1), NOW); assert.equal(f.alarms[0][1].periodInMinutes, 5);
  await f.controller.sweep(); assert.equal(f.removed.length, 0);
});
test('sweep closes eligible tab and preserves pin/group protections', async () => {
  const f = fixture({ tabs: [ordinary(), ordinary({ id: 2, pinned: true }), ordinary({ id: 3, groupId: 2 })] });
  const result = await f.controller.sweep(); assert.equal(result.closed.length, 1); assert.deepEqual(f.removed, [1]); assert.equal(f.records.size, 2); assert.equal(f.state().history[0].closed, true);
});
test('hidden tabs are protected and receive a fresh activity stamp', async () => {
  const f = fixture({ tabs: [ordinary({ hidden: true })] });
  await f.controller.sweep();
  assert.deepEqual(f.removed, []);
  assert.equal(f.values.get(1), NOW);
});
test('a tab becoming hidden during recovery backup is not closed', async () => {
  const f = fixture({ duringBackup: records => { records.get(1).hidden = true; } });
  await f.controller.sweep();
  assert.deepEqual(f.removed, []);
});
test('a protected tab removed by the user later is not mistaken for an automatic close', async () => {
  const f = fixture({ duringBackup: records => { records.get(1).pinned = true; } });
  await f.controller.sweep();
  f.records.delete(1);
  assert.equal(await f.controller.undo(), false);
  assert.deepEqual(f.created, []);
});
test('pin/group/active changes between initial scan and fresh read prevent closing', async () => {
  for (const fresh of [{ pinned: true }, { groupId: 7 }, { active: true }]) { const f = fixture({ fresh }); await f.controller.sweep(); assert.equal(f.removed.length, 0); }
});
test('protection added while writing recovery backup is rechecked', async () => {
  const f = fixture({ duringBackup: records => { records.get(1).groupId = 9; } }); await f.controller.sweep(); assert.equal(f.removed.length, 0);
});
test('storage failure prevents removal', async () => {
  const f = fixture({ failBackup: true }); const r = await f.controller.sweep(); assert.equal(f.removed.length, 0); assert.match(r.error, /quota/);
});
test('pause prevents closure', async () => {
  const f = fixture(); await f.controller.setEnabled(false); const r = await f.controller.sweep(); assert.equal(r.paused, true); assert.equal(f.removed.length, 0);
});
test('parallel sweeps close each tab once', async () => {
  const f = fixture(); await Promise.all([f.controller.sweep(), f.controller.sweep()]); assert.deepEqual(f.removed, [1]);
});
test('undo can recover URL if native recently-closed session is unavailable', async () => {
  const f = fixture(); await f.controller.sweep(); assert.equal(await f.controller.undo(), true); assert.equal(f.created[0].url, 'https://example.com/old'); assert.equal(f.state().history.length, 0);
});

test('pause requested during a sweep takes effect before removal', async () => {
  let f; f = fixture({ duringBackup: () => { f.controller.setEnabled(false); } });
  await f.controller.sweep(); assert.equal(f.removed.length, 0); assert.equal(f.state().enabled, false);
});
test('pre-close recovery backup survives failure after removal', async () => {
  const f = fixture(); const set = f.api.storage.local.set;
  f.api.storage.local.set = async data => { if (f.removed.length) throw Error('disk full after close'); return set(data); };
  const result = await f.controller.sweep(); assert.match(result.error, /disk full/);
  assert.equal(f.state().history[0].pending, true);
  f.api.storage.local.set = set;
  assert.equal(await f.controller.undo(), true); assert.equal(f.created[0].url, 'https://example.com/old');
});
test('pending backup for a tab protected during removal does not duplicate it', async () => {
  const f = fixture({ duringBackup: records => { records.get(1).pinned = true; } });
  await f.controller.sweep(); assert.equal(await f.controller.undo(), false); assert.equal(f.created.length, 0);
});
test('activation timestamps include the tab being left and survive event-page restart', async () => {
  let memory = {}, stamps = [], activeId = 1;
  const settle = () => new Promise(resolve => setImmediate(resolve));
  function startPage() {
    const events = {};
    const event = name => ({ addListener: callback => { events[name] = callback; } });
    const browser = {
      runtime: { id: 'test', onInstalled: event('installed'), onStartup: event('startup'), onMessage: event('message') },
      alarms: { onAlarm: event('alarm') },
      tabs: { onCreated: event('created'), onActivated: event('activated'), onUpdated: event('updated'), query: async () => [{ id: activeId, windowId: 10 }] },
      storage: { session: { get: async () => structuredClone(memory), set: async value => { memory = structuredClone(value); } } }
    };
    const controller = { stamp: async id => stamps.push(id) };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../background.js'), 'utf8'), { browser, ZenfxCleanup: { createController: () => controller }, console });
    return events;
  }
  let events = startPage(); await settle();
  events.activated({ tabId: 2, windowId: 10 }); await settle(); assert.deepEqual(stamps, [1, 2]);
  activeId = 2; stamps = []; events = startPage(); await settle();
  events.activated({ tabId: 3, windowId: 10 }); await settle(); assert.deepEqual(stamps, [2, 3]);
});
