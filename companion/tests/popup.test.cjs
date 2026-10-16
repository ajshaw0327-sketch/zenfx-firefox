const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const tick = () => new Promise(resolve => setImmediate(resolve));
function popup(sendMessage) {
  const elements = Object.fromEntries(['enabled','status','eligible','undo'].map(id => [id, { checked: false, disabled: false, textContent: '', listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; }, replaceChildren(...children) { this.children = children; } }]));
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../popup.js'),'utf8'), { browser: { runtime: { sendMessage } }, document: { getElementById: id => elements[id], createElement: () => ({}) } });
  return elements;
}
const state = { enabled:true, canUndo:true, rows:[], error:null };
test('popup pause failure reports the error and restores the confirmed switch state', async () => {
  const e = popup(async message => { if(message.type==='enabled') throw Error('background unavailable'); return state; });
  await tick(); e.enabled.checked=false; await e.enabled.listeners.change();
  assert.equal(e.enabled.checked,true); assert.equal(e.enabled.disabled,false);
  assert.match(e.status.textContent,/background unavailable/); assert.equal(e.undo.disabled,false);
});
test('popup serializes duplicate Undo clicks while a request is pending', async () => {
  let finish, calls=0;
  const e = popup(async message => { if(message.type==='undo') { calls++; await new Promise(resolve=>finish=resolve); } return state; });
  await tick(); const first=e.undo.listeners.click(); e.undo.listeners.click();
  assert.equal(calls,1); assert.equal(e.undo.disabled,true);
  finish(); await first; assert.equal(e.undo.disabled,false);
});
test('popup initial failure leaves recovery disabled and reports a useful error', async () => {
  const e=popup(async()=>{throw Error('connection lost');}); await tick();
  assert.match(e.status.textContent,/connection lost/); assert.equal(e.undo.disabled,true);
});
