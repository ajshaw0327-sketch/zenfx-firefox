const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../zenfx-newtab-overlay.uc.js'), 'utf8');

function fixture() {
  class Target {
    handlers = new Map();
    addEventListener(type, callback) {
      if (!this.handlers.has(type)) this.handlers.set(type, new Set());
      this.handlers.get(type).add(callback);
    }
    removeEventListener(type, callback) { this.handlers.get(type)?.delete(callback); }
    emit(type, target = this, extra = {}) {
      for (const fn of [...(this.handlers.get(type) || [])]) fn({ target, ...extra });
    }
    count() { return [...this.handlers.values()].reduce((n, set) => n + set.size, 0); }
  }
  const window = new Target(), document = new Target(), field = new Target();
  const attributes = new Map([['windowtype', 'navigator:browser']]);
  document.documentElement = {
    getAttribute: name => attributes.get(name),
    hasAttribute: name => attributes.has(name),
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: name => attributes.delete(name),
  };
  let foreground = true;
  document.hasFocus = () => foreground;
  const tab = { isConnected: true, closing: false };
  const browser = { currentURI: { spec: 'https://fixture.invalid/' }, userTypedValue: null,
    focus() { input.focused = false; document.emit('focusin', browser); } };
  tab.linkedBrowser = browser;
  const gBrowser = { selectedTab: tab, selectedBrowser: browser, tabs: [tab], tabContainer: new Target() };
  Object.assign(field, { value: '', selectionStart: 0, selectionEnd: 0, selectionDirection: 'none',
    setSelectionRange(start, end, direction) { Object.assign(this, { selectionStart: start, selectionEnd: end, selectionDirection: direction }); } });
  const requests = [], input = {
    inputField: field, focused: false, searchMode: null,
    parentController: { loadURL(request) { requests.push(request); } },
    view: { close() {} },
    focus() { this.focused = true; window.emit('focus'); document.emit('focusin', field); },
    search(value) { this.focus(); field.value = value; field.setSelectionRange(value.length, value.length, 'none'); },
    setURI() { field.value = browser.currentURI.spec; },
    contains(target) { return target === field || target === input; },
    getSearchMode() { return null; }, setSearchMode() { return Promise.resolve(); },
  };
  const observers = new Map(), frames = new Map();
  let nextFrame = 0;
  const Services = { focus: { activeWindow: window }, obs: {
    addObserver(observer, topic) { observers.set(topic, observer); },
    removeObserver(observer, topic) { assert.equal(observers.get(topic), observer); observers.delete(topic); },
  } };
  Object.assign(window, { gBrowser, gURLBar: input, STATE_MINIMIZED: 2, windowState: 1 });
  const context = vm.createContext({ window, document, gBrowser, gURLBar: input, Services, console, queueMicrotask,
    requestAnimationFrame(fn) { const id = ++nextFrame; frames.set(id, fn); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
  });
  vm.runInContext(source, context);
  const api = window.ZenfxNewTabOverlay;
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); };
  const type = (value = 'saved draft') => {
    field.value = value; field.setSelectionRange(2, 6, 'backward'); field.emit('input');
  };
  const power = topic => observers.get(topic)?.observe(null, topic);
  const background = () => { foreground = false; Services.focus.activeWindow = {}; window.emit('deactivate'); input.focused = false; };
  const activate = () => { foreground = true; Services.focus.activeWindow = window; window.emit('activate'); };
  const count = () => [window, document, field, gBrowser.tabContainer].reduce((n, target) => n + target.count(), 0);
  return { window, document, field, tab, browser, gBrowser, input, Services, api, frames, observers,
    requests, flush, type, power, background, activate, count };
}

test('reactivation restores draft, selection and search mode after native field reset', () => {
  const f = fixture(); f.api.open(); f.input.searchMode = { source: 1, entry: 'typed' }; f.type();
  f.background(); f.field.value = ''; f.browser.focus(); f.flush();
  assert.equal(f.input.focused, false);
  f.activate(); f.browser.focus(); f.flush();
  assert.equal(f.api.active, true); assert.equal(f.field.value, 'saved draft');
  assert.equal(f.input.focused, true); assert.equal(f.field.selectionStart, 2);
  assert.equal(f.field.selectionEnd, 6); assert.equal(f.field.selectionDirection, 'backward');
  assert.equal(f.input.searchMode.source, 1); assert.equal(f.frames.size, 0);
});

test('window blur without deactivate preserves the overlay through native content focus', () => {
  const f = fixture(); f.api.open(); f.type();
  f.window.emit('blur'); f.input.focused = false; f.window.emit('focus'); f.browser.focus(); f.flush();
  assert.equal(f.api.active, true); assert.equal(f.field.value, 'saved draft');
  assert.equal(f.input.focused, true); assert.equal(f.frames.size, 0);
});

test('wake coalesces repeated signals and never focuses a background window', () => {
  const f = fixture(); f.api.open(); f.type(); f.background();
  for (let i = 0; i < 20; i++) f.power('wake_notification');
  assert.equal(f.frames.size, 1); f.flush(); assert.equal(f.input.focused, false);
  f.activate(); f.flush(); assert.equal(f.input.focused, true); assert.equal(f.frames.size, 0);
});

test('recovery tolerates synchronous content focus during native view teardown', () => {
  const f = fixture(); f.api.open(); f.type(); f.power('sleep_notification');
  f.input.view.close = () => f.browser.focus(); f.power('wake_notification'); f.flush();
  assert.equal(f.api.active, true); assert.equal(f.field.value, 'saved draft');
  assert.equal(f.frames.size, 0);
});

test('minimize defers recovery until restored', () => {
  const f = fixture(); f.api.open(); f.type(); f.window.windowState = 2;
  f.window.emit('sizemodechange'); f.input.focused = false;
  f.power('wake_notification'); f.flush(); assert.equal(f.input.focused, false);
  f.window.windowState = 1; f.window.emit('sizemodechange'); f.flush();
  assert.equal(f.field.value, 'saved draft'); assert.equal(f.input.focused, true);
});

for (const cause of ['Escape', 'outside click', 'Cmd+L', 'tab switch', 'origin close', 'navigation', 'uninstall']) {
  test(`${cause} cancels pending recovery and removes its observers`, () => {
    const f = fixture(); f.api.open(); f.type(); f.power('sleep_notification'); f.power('wake_notification');
    if (cause === 'Escape') f.window.emit('keydown', f.field, { key: 'Escape', preventDefault() {}, stopImmediatePropagation() {} });
    if (cause === 'outside click') f.document.emit('pointerdown', {}, { composedPath: () => [] });
    if (cause === 'Cmd+L') f.document.emit('command', { id: 'Browser:OpenLocation' });
    if (cause === 'tab switch') { f.gBrowser.selectedTab = {}; f.gBrowser.tabContainer.emit('TabSelect'); }
    if (cause === 'origin close') { f.tab.closing = true; f.gBrowser.tabContainer.emit('TabClose', f.tab); }
    if (cause === 'navigation') { f.browser.currentURI.spec += 'changed'; f.flush(); }
    if (cause === 'uninstall') f.api.uninstall();
    f.flush(); assert.equal(f.api.active, false); assert.equal(f.frames.size, 0);
    assert.equal(f.observers.size, 0); assert.equal(f.count(), cause === 'uninstall' ? 0 : 2);
  });
}

test('submission after recovery forwards native request and returns to two idle listeners', () => {
  const f = fixture(); f.api.open(); f.type(); f.power('suspend_process_notification');
  f.power('resume_process_notification'); f.flush();
  const principal = {}; f.input.parentController.loadURL({ where: 'current', triggeringPrincipal: principal });
  assert.equal(f.requests[0].where, 'tab'); assert.equal(f.requests[0].triggeringPrincipal, principal);
  assert.equal(f.api.active, false); assert.equal(f.observers.size, 0); assert.equal(f.count(), 2);
});

test('repeated lifecycle leaves no wake observers, pending frames or extra idle listeners', () => {
  const f = fixture();
  for (let i = 0; i < 40; i++) {
    f.api.open(); f.type(); f.power('sleep_notification'); f.power('wake_notification'); f.flush(); f.api.cancel();
    assert.equal(f.count(), 2); assert.equal(f.observers.size, 0); assert.equal(f.frames.size, 0);
  }
  f.api.uninstall(); assert.equal(f.count(), 0);
});
