const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../zenfx-newtab-overlay.uc.js'), 'utf8');

test('an older loader can evaluate the retired filename without changing native commands', () => {
  const nativeOpen = () => 'native tab', nativeLoad = () => 'native URL';
  const window = { BrowserCommands: { openTab: nativeOpen }, gURLBar: { parentController: { loadURL: nativeLoad } } };
  const context = vm.createContext({ window });
  for (let i = 0; i < 3; i++) vm.runInContext(source, context);
  assert.equal(window.BrowserCommands.openTab, nativeOpen);
  assert.equal(window.gURLBar.parentController.loadURL, nativeLoad);
  assert.equal(window.ZenfxNewTabOverlay, undefined);
});

test('upgrading a live window unloads the old hook and subsequent loads stay harmless', () => {
  let removed = 0;
  const nativeOpen = () => 'native tab', nativeLoad = () => 'native URL';
  const window = { BrowserCommands: { openTab: () => 'old overlay' }, gURLBar: { parentController: { loadURL: () => 'old redirect' } } };
  window.ZenfxNewTabOverlay = { uninstall() {
    removed++;
    window.BrowserCommands.openTab = nativeOpen;
    window.gURLBar.parentController.loadURL = nativeLoad;
    delete window.ZenfxNewTabOverlay;
  } };
  const context = vm.createContext({ window });
  vm.runInContext(source, context);
  vm.runInContext(source, context);
  assert.equal(removed, 1);
  assert.equal(window.BrowserCommands.openTab, nativeOpen);
  assert.equal(window.gURLBar.parentController.loadURL, nativeLoad);
  assert.equal(window.BrowserCommands.openTab(), 'native tab');
});
