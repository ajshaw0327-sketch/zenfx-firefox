#!/usr/bin/env python3
"""Opt-in page-popup and native drag recovery audit; fixed disposable profile only."""
import json,hashlib
from urllib.parse import quote
from browser_tabs import Driver,ROOT
x=Driver();js=x.js
original=x.cmd('WebDriver:GetWindowHandle')['value'];before=x.cmd('WebDriver:GetWindowHandles');prefs=js("return ['sidebar.verticalTabs','zenfx.compact.top','zenfx.compact.sidebar','zenfx.compact.independent-reveal'].map(k=>({k,has:Services.prefs.prefHasUserValue(k),v:Services.prefs.getBoolPref(k,false)}));")
x.cmd('WebDriver:ExecuteAsyncScript',{'script':"const done=arguments[arguments.length-1],w=OpenBrowserWindow(),o={observe(s){if(s===w){Services.obs.removeObserver(o,'browser-delayed-startup-finished');done(true)}}};Services.obs.addObserver(o,'browser-delayed-startup-finished');",'args':[]})
created=next(h for h in x.cmd('WebDriver:GetWindowHandles') if h not in before);x.cmd('WebDriver:SwitchToWindow',{'handle':created,'focus':True});x.cmd('WebDriver:SetWindowRect',{'width':1100,'height':768})
r={'method':'Headless Firefox test profile; real page context menu and select popup clicks; controlled native moving-tab setup with real next-click/window-switch cleanup. OS drag release is not certified.','version':js('return Services.appinfo.version;'),'popupCases':[],'movingRecovery':[]}
def move(xpos,ypos):
 x.cmd('WebDriver:PerformActions',{'actions':[{'type':'pointer','id':'tab-regression-pointer','parameters':{'pointerType':'mouse'},'actions':[{'type':'pointerMove','origin':'viewport','x':xpos,'y':ypos}]}]})
def hidden():
 return js("const a=document.getElementById('navigator-toolbox').getBoundingClientRect(),b=document.getElementById('sidebar-container').getBoundingClientRect();return {topBottom:a.bottom,sidebarRight:b.right,topHidden:a.bottom<=13,sideHidden:b.right<=1};")
def point(xoffset,yoffset):return '({getBoundingClientRect(){const r=gBrowser.selectedBrowser.getBoundingClientRect();return new DOMRect(r.x+'+str(xoffset)+',r.y+'+str(yoffset)+',2,2);}})'
try:
 js("Services.prefs.setBoolPref('sidebar.verticalTabs',true);Services.prefs.setBoolPref('zenfx.compact.top',false);Services.prefs.setBoolPref('zenfx.compact.sidebar',false);SidebarController._state.launcherExpanded=true;window._errors=[];window.addEventListener('error',e=>_errors.push(e.message));window._strip=gBrowser.tabContainer;window._drag=_strip.tabDragAndDrop;")
 url='data:text/html,'+quote('<title>Popup fixture</title><body style="background:#fff;color:#111"><select style="position:absolute;left:70px;top:140px;width:180px;height:36px"><option>First choice</option><option>Second choice</option><option>Third choice</option></select><p style="position:absolute;left:350px;top:300px">Context menu target</p></body>')
 js('window._tabs=Array.from({length:8},()=>gBrowser.addTab('+json.dumps(url)+',{triggeringPrincipal:document.nodePrincipal,skipAnimation:true}));gBrowser.selectedTab=_tabs[2];for(const t of Array.from(gBrowser.tabs))if(!_tabs.includes(t))gBrowser.removeTab(t,{animate:false});gBrowser.addTabGroup(_tabs.slice(0,2),{label:"Audit folder",color:"green"});')
 for name in ['zenfx-tab-hierarchy.uc.js','zenfx-drag-to-split.uc.js','zenfx-compact-toggle.uc.js']:
  source=(ROOT/'optional-chrome'/name).read_text()
  if name=='zenfx-tab-hierarchy.uc.js':source=source.replace('listen(strip, "dragstart", event => {','listen(strip, "dragstart", window._beginPriority = event => {')
  js(source)
 for independent in [False,True]:
  js("Services.prefs.setBoolPref('zenfx.compact.top',true);Services.prefs.setBoolPref('zenfx.compact.sidebar',true);Services.prefs.setBoolPref('zenfx.compact.independent-reveal',"+str(independent).lower()+");gBrowser.selectedBrowser.focus();")
  move(650,450);x.wait(900)
  baseline=hidden();assert baseline['topHidden'] and baseline['sideHidden'],baseline
  x.click(point(420,310),button=2);x.wait()
  menu=js("return document.getElementById('contentAreaContextMenu').state;")
  state=hidden();assert menu=='open' and state['topHidden'] and state['sideHidden'],(menu,state)
  r['popupCases'].append({'independent':independent,'popup':'page context menu',**state})
  x.key('\ue00c');x.wait()
  x.click(point(130,156));x.wait()
  opened=js("const e=document.getElementById('ContentSelectDropdown');return {open:e.open,attribute:e.getAttribute('open'),children:Array.from(e.children).map(c=>({tag:c.localName,state:c.state}))};")
  state=hidden();assert (opened.get('open') or opened.get('attribute')=='true' or any(c.get('state')=='open' for c in opened['children'])) and state['topHidden'] and state['sideHidden'],(opened,state)
  r['popupCases'].append({'independent':independent,'popup':'web select',**state})
  x.key('\ue00c');x.wait()
 print('PASS real page menus and select popups leave compact bars hidden in shared and independent modes',flush=True)
 js("Services.prefs.setBoolPref('zenfx.compact.top',false);Services.prefs.setBoolPref('zenfx.compact.sidebar',false);");x.wait()
 for signal in ['pointer','switch-then-pointer','native-end']:
  js("gBrowser.selectedTab=_tabs[5];window._dt=new DataTransfer();_dt.dropEffect='move';const rect=_tabs[5].getBoundingClientRect();_drag.startTabDrag(new DragEvent('dragstart',{dataTransfer:_dt,clientX:rect.x+10,clientY:rect.y+10,screenX:rect.x+10,screenY:rect.y+10}),_tabs[5]);_beginPriority({composedPath:()=>[_tabs[5]],defaultPrevented:false});")
  assert js("return _strip.hasAttribute('movingtab')&&!!_tabs[5]._dragData;")
  if signal=='switch-then-pointer':
   x.cmd('WebDriver:SwitchToWindow',{'handle':original,'focus':True});x.wait();x.cmd('WebDriver:SwitchToWindow',{'handle':created,'focus':True});x.click('_tabs[4]')
  elif signal=='pointer':x.click('_tabs[4]')
  else:js("_drag.handle_dragend(new DragEvent('dragend',{dataTransfer:_dt}));document.dispatchEvent(new Event('dragend'));")
  x.wait();state=js("return {moving:_strip.hasAttribute('movingtab'),data:!!_tabs[5]._dragData};");assert not state['moving'] and not state['data'],(signal,state)
  r['movingRecovery'].append({'signal':signal,**state})
 print('PASS native moving-tab state clears after a fresh click, window switch plus click and native drag end',flush=True)
 r['errors']=js('return _errors;');assert not r['errors'],r['errors']
 r['sourceHashes']={name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in ['chrome/zenfx/compact.css','optional-chrome/zenfx-tab-hierarchy.uc.js','optional-chrome/zenfx-drag-to-split.uc.js']};r['pass']=True
except Exception as e:r['pass']=False;r['failure']=str(e);raise
finally:
 js('for(const p of '+json.dumps(prefs)+'){if(p.has)Services.prefs.setBoolPref(p.k,p.v);else Services.prefs.clearUserPref(p.k);}')
 js('window.close();');x.cmd('WebDriver:SwitchToWindow',{'handle':original,'focus':True});x.cmd('WebDriver:DeleteSession');x.socket.close()
 (ROOT/'docs/validation/final-interactions.json').write_text(json.dumps(r,indent=2)+'\n')
