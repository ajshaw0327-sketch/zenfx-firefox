const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../zenfx-drag-to-split.uc.js'), 'utf8');
function fixture() {
  class Target {
    handlers = new Map();
    addEventListener(name, fn) { if (!this.handlers.has(name)) this.handlers.set(name, new Set()); this.handlers.get(name).add(fn); }
    removeEventListener(name, fn) { this.handlers.get(name)?.delete(fn); }
    emit(name, extra = {}) { for (const fn of [...(this.handlers.get(name) || [])]) fn({ target: this, ...extra }); }
    count() { return [...this.handlers.values()].reduce((n, s) => n + s.size, 0); }
  }
  class Element extends Target {
    nodeType = 1; children = []; dataset = {}; style = {}; isConnected = true;
    append(child) { child.parentElement = this; this.children.push(child); }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(n => n !== this); this.parentElement = null; }
    get firstElementChild() { return this.children[0]; }
    contains(node) { return node === this || this.children.some(c => c.contains(node)); }
  }
  const window = new Target(), document = new Target(), strip = new Target();
  let focused = true; document.hasFocus = () => focused;
  const root = new Element(); root.getAttribute = () => 'navigator:browser';
  document.documentElement = root;
  document.createElementNS = () => new Element();
  document.getElementById = () => ({ getBoundingClientRect: () => ({ x: 200, y: 50, width: 800, height: 600 }) });
  const tab = () => ({ nodeType: 1, isConnected: true, ownerDocument: document,
    matches: s => s === '.tabbrowser-tab', closest() { return this; }, _dragData: { movingTabs: [1] } });
  const dragged = tab(), selected = tab();
  const gBrowser = { selectedTab: selected, tabContainer: strip, addTabSplitView() {} };
  window.gBrowser = gBrowser;
  let next = 0; const timers = new Map();
  const Services = { focus: { activeWindow: window } };
  const context = vm.createContext({ window, document, gBrowser, Services, console,
    setTimeout(fn) { const id = ++next; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); } });
  vm.runInContext(source, context);
  const count = () => [window, document, strip].reduce((n, x) => n + x.count(), 0);
  function start() {
    focused = true; Services.focus.activeWindow = window;
    strip.emit('pointerdown', { isTrusted: true, button: 0, target: dragged });
    strip.emit('dragstart', { isTrusted: true, defaultPrevented: false, target: dragged });
    const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn());
    assert.equal(window.ZenfxDragToSplit.active, true);
  }
  return { window, document, strip, root, dragged, selected, gBrowser, timers, start, count, setFocus(value) { focused = value; Services.focus.activeWindow = value ? window : null; } };
}
test('a new pointer gesture clears an overlay when the preceding dragend was lost', () => {
  const f = fixture(), idle = f.count(); f.start();
  f.document.emit('pointerdown');
  assert.equal(f.window.ZenfxDragToSplit.active, false);
  assert.equal(f.root.children.length, 0); assert.equal(f.count(), idle);
});
test('tab/content blur preserves a drag preview; real window deactivation cancels it', () => {
  const f = fixture(); f.start(); f.window.emit('blur', { target: {} });
  assert.equal(f.window.ZenfxDragToSplit.active, true);
  f.document.hasFocus = () => false;
  f.window.emit('blur'); assert.equal(f.window.ZenfxDragToSplit.active, true);
  f.setFocus(false); f.window.emit('blur'); assert.equal(f.window.ZenfxDragToSplit.active, false);
});
test('release outside the tab strip does not retain a pressed tab for a later drag', () => {
  const f = fixture();
  f.strip.emit('pointerdown', { isTrusted: true, button: 0, target: f.dragged });
  f.window.emit('pointerup');
  f.strip.emit('dragstart', { isTrusted: true, defaultPrevented: false, target: f.dragged });
  const pending = [...f.timers.values()]; f.timers.clear(); pending.forEach(fn => fn());
  assert.equal(f.window.ZenfxDragToSplit.active, false); assert.equal(f.root.children.length, 0);
});
test('closing or pinning a dragged tab releases the overlay', () => {
  for (const event of ['TabClose', 'TabPinned']) {
    const f = fixture(); f.start(); f.strip.emit(event, { target: f.dragged });
    assert.equal(f.window.ZenfxDragToSplit.active, false); assert.equal(f.root.children.length, 0);
  }
});
test('50 canceled drag cycles return to the same idle listeners without pending work', () => {
  const f = fixture(), idle = f.count();
  for (let i = 0; i < 50; i++) {
    f.start();
    if (i % 3 === 0) f.document.emit('keydown', { key: 'Escape' });
    else if (i % 3 === 1) f.document.emit('dragend');
    else { f.setFocus(false); f.window.emit('blur'); }
    assert.equal(f.count(), idle); assert.equal(f.root.children.length, 0); assert.equal(f.timers.size, 0);
  }
});
test('uninstall while dragging removes all handlers and DOM', () => {
  const f = fixture(); f.start(); f.window.ZenfxDragToSplit.uninstall();
  assert.equal(f.count(), 0); assert.equal(f.root.children.length, 0); assert.equal(f.window.ZenfxDragToSplit, undefined);
});
