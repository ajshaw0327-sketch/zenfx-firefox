#!/usr/bin/env python3
"""Opt-in native regression. Connects ONLY to /tmp/zen-firefox-test-profile.

Start that disposable Firefox with -marionette --remote-allow-system-access.
No third-party packages, application modifications, or normal profile access.
Drag setup is controlled; physical OS drag release is not certified.
"""
import hashlib
import json
from pathlib import Path
import socket
import time
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[2]
PROFILE = Path('/tmp/zen-firefox-test-profile')
REPORT = ROOT / 'docs/validation/tab-functional.json'


class Driver:
    def __init__(self):
        self.socket = socket.create_connection(('127.0.0.1', 2828), 8)
        self.socket.settimeout(25)
        self.sequence = 0
        self.read()
        self.cmd('WebDriver:NewSession', {'capabilities': {'alwaysMatch': {}}})
        self.cmd('Marionette:SetContext', {'value': 'chrome'})
        assert self.js("return Services.dirsvc.get('ProfD',Ci.nsIFile).path;") == str(PROFILE)

    def take(self, length):
        output = b''
        while len(output) < length:
            chunk = self.socket.recv(length - len(output))
            if not chunk:
                raise EOFError('Test browser disconnected')
            output += chunk
        return output

    def read(self):
        prefix = b''
        while not prefix.endswith(b':'):
            prefix += self.take(1)
        return json.loads(self.take(int(prefix[:-1])))

    def cmd(self, name, params=None):
        self.sequence += 1
        data = json.dumps([0, self.sequence, name, params or {}]).encode()
        self.socket.sendall(str(len(data)).encode() + b':' + data)
        result = self.read()
        if result[2]:
            raise RuntimeError(result[2])
        return result[3]

    def js(self, source):
        return self.cmd('WebDriver:ExecuteScript', {'script': source, 'args': []})['value']

    def wait(self, milliseconds=350):
        self.cmd('WebDriver:ExecuteAsyncScript', {
            'script': f'setTimeout(arguments[arguments.length-1],{milliseconds});', 'args': []})

    def key(self, key, modifiers=()):
        actions = ([{'type': 'keyDown', 'value': value} for value in modifiers] +
                   [{'type': 'keyDown', 'value': key}, {'type': 'keyUp', 'value': key}] +
                   [{'type': 'keyUp', 'value': value} for value in reversed(modifiers)])
        self.cmd('WebDriver:PerformActions', {'actions': [
            {'type': 'key', 'id': 'tab-regression-key', 'actions': actions}]})

    def click(self, expression, button=0):
        rect = self.js('return ' + expression + '.getBoundingClientRect().toJSON();')
        assert rect['height'] > 0 and rect['width'] > 0, rect
        self.cmd('WebDriver:PerformActions', {'actions': [{
            'type': 'pointer', 'id': 'tab-regression-pointer',
            'parameters': {'pointerType': 'mouse'}, 'actions': [
                {'type': 'pointerMove', 'origin': 'viewport',
                 'x': round(rect['x'] + rect['width'] / 2),
                 'y': round(rect['y'] + rect['height'] / 2)},
                {'type': 'pointerDown', 'button': button},
                {'type': 'pointerUp', 'button': button}]}]})
        self.wait()


def main():
    assert (PROFILE / 'chrome/userChrome.css').read_bytes() == (ROOT / 'standalone/userChrome.css').read_bytes(), 'Stage current appearance CSS in test profile before launch'
    driver = Driver()
    js, wait = driver.js, driver.wait
    original = driver.cmd('WebDriver:GetWindowHandle')['value']
    before = driver.cmd('WebDriver:GetWindowHandles')
    names = ['sidebar.verticalTabs', 'zenfx.compact.top', 'zenfx.compact.sidebar', 'zenfx.compact.independent-reveal']
    prefs = js('return ' + json.dumps(names) + '.map(k=>({k,has:Services.prefs.prefHasUserValue(k),v:Services.prefs.getBoolPref(k,false)}));')
    sources = {name: (ROOT / 'optional-chrome' / name).read_text() for name in [
        'zenfx-tab-hierarchy.uc.js', 'zenfx-drag-to-split.uc.js',
        'zenfx-compact-toggle.uc.js', 'zenfx-newtab-overlay.uc.js']}
    report = {'method': 'Firefox native chrome APIs and real WebDriver pointer/keyboard/wheel input in a disposable window. Loaded local data pages. Controlled drag setup and DOM dragover/drop dispatch; no OS drag loop.',
              'version': js('return Services.appinfo.version;'), 'checks': [],
              'sourceHashes': {name: hashlib.sha256(source.encode()).hexdigest() for name, source in sources.items()},
              'limits': ['Physical macOS drag release and overflow drag autoscroll are not certified.',
                         'SessionStore round-trip is tested; this does not certify application AutoConfig cold startup or physical sleep.']}
    created = None

    def check(name, evidence=True):
        report['checks'].append({'name': name, 'evidence': evidence})
        print('PASS', name, flush=True)

    def load():
        # Expose existing private entry points ONLY in the test evaluation.
        js(sources['zenfx-tab-hierarchy.uc.js'].replace(
            'listen(strip, "dragstart", event => {',
            'listen(strip, "dragstart", window._beginPriorityFixture = event => {'))
        js(sources['zenfx-drag-to-split.uc.js'].replace(
            '  const api = window.ZenfxDragToSplit = {',
            '  window._showSplitFixture = show;\n  const api = window.ZenfxDragToSplit = {'))
        js(sources['zenfx-compact-toggle.uc.js'])
        js(sources['zenfx-newtab-overlay.uc.js'])

    def selected_visible():
        return js('''const t=gBrowser.selectedTab,s=document.getElementById(t.pinned?'pinned-tabs-container':'tabbrowser-arrowscrollbox').shadowRoot.querySelector('[part=scrollbox]'),a=t.getBoundingClientRect(),b=s.getBoundingClientRect();return a.height>0&&a.top>=b.top-1&&a.bottom<=b.bottom+1;''')

    try:
        driver.cmd('WebDriver:ExecuteAsyncScript', {'script': '''const done=arguments[arguments.length-1],w=OpenBrowserWindow(),o={observe(s){if(s===w){Services.obs.removeObserver(o,'browser-delayed-startup-finished');done(true)}}};Services.obs.addObserver(o,'browser-delayed-startup-finished');''', 'args': []})
        created = next(handle for handle in driver.cmd('WebDriver:GetWindowHandles') if handle not in before)
        driver.cmd('WebDriver:SwitchToWindow', {'handle': created, 'focus': True})
        driver.cmd('WebDriver:SetWindowRect', {'width': 1100, 'height': 768})
        js("Services.prefs.setBoolPref('sidebar.verticalTabs',true);Services.prefs.setBoolPref('zenfx.compact.top',false);Services.prefs.setBoolPref('zenfx.compact.sidebar',false);SidebarController._state.launcherExpanded=true;window._errors=[];window.addEventListener('error',e=>_errors.push(String(e.message)));window._strip=gBrowser.tabContainer;window._normal=document.getElementById('tabbrowser-arrowscrollbox');window._pins=document.getElementById('pinned-tabs-container');")
        load()
        urls = ['data:text/html,' + quote(f'<title>Fixture {i:02}</title><body style="margin:70px"><h1>Tab {i:02}</h1><button id="test" style="position:absolute;left:70px;top:140px;width:80px;height:30px" onclick="document.title+=\' clicked\'">Click</button></body>') for i in range(60)]
        js('window._tabs=' + json.dumps(urls) + ".map(url=>gBrowser.addTab(url,{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal(),skipAnimation:true}));gBrowser.selectedTab=_tabs[20];for(const t of Array.from(gBrowser.tabs))if(!_tabs.includes(t))gBrowser.removeTab(t,{animate:false});")
        deadline = time.monotonic() + 25
        while time.monotonic() < deadline:
            loaded = js("return _tabs.filter(t=>t.label.startsWith('Fixture')).length;")
            if loaded == 60:
                break
            wait()
        assert loaded == 60, loaded
        check('60 distinct local pages loaded', loaded)
        js("for(let i=0;i<10;i++)ZenfxTabHierarchy.setTier(_tabs[i],i<3?'favorite':'pinned');window._groups=[gBrowser.addTabGroup(_tabs.slice(10,14),{label:'Research',color:'blue'}),gBrowser.addTabGroup(_tabs.slice(14,18),{label:'Reading',color:'red'})];")
        wait()
        assert js("return _tabs.slice(0,3).every(t=>ZenfxTabHierarchy.tierOf(t)==='favorite')&&_tabs.slice(3,10).every(t=>ZenfxTabHierarchy.tierOf(t)==='pinned')&&_tabs.slice(10,18).every(t=>t.group);")
        assert js('return Array.from(gBrowser.tabs).every((t,i)=>t.index===i)&&_tabs[10].index===10&&_tabs[17].index===17;')
        check('Favorite/pinned/folder order matches native indices', js('return Array.from(gBrowser.tabs).slice(0,20).map(t=>({label:t.label,index:t.index,tier:ZenfxTabHierarchy.tierOf(t)}));'))

        # All selected pages must remain reachable, even across both scrollers.
        for i in [59, 21, 5, 0, 3, 12, 58, 16, 20]:
            js(f'gBrowser.selectedTab=_tabs[{i}];'); wait()
            assert selected_visible(), ('selected tab offscreen', i)
        js('gBrowser.selectedTab=_tabs[20];'); wait()
        driver.key('\ue004', ('\ue009',)); wait()  # Ctrl+Tab, native next tab.
        assert js('return gBrowser.selectedTab===_tabs[21];')
        driver.click('_tabs[20]')
        assert js('return gBrowser.selectedTab===_tabs[20];')
        check('Native pointer and keyboard selection across Favorites, pins, groups and ordinary tabs')

        # Group membership, labels, collapse and theme color remain native.
        js("_groups[0].label='Renamed folder';_groups[0].color='green';gBrowser.selectedTab=_tabs[20];_groups[0].collapsed=true;"); wait()
        assert js("return _groups[0].label==='Renamed folder'&&_groups[0].color==='green'&&_tabs[12].getBoundingClientRect().height===0;")
        js('gBrowser.selectedTab=_tabs[12];'); wait()
        assert selected_visible(), js('''const t=_tabs[12],s=_normal.shadowRoot.querySelector('[part=scrollbox]');return {tab:t.getBoundingClientRect().toJSON(),scroll:s.getBoundingClientRect().toJSON(),top:s.scrollTop,collapsed:t.group.collapsed,selected:t.selected};''')
        for cycle in range(8):
            js('gBrowser.selectedTab=_tabs[20];'); wait()
            js('gBrowser.selectedTab=_tabs[12];'); wait()
            assert selected_visible(), ('repeated collapsed folder selection', cycle)
        assert js("return ZenfxTabHierarchy.setTier(_tabs[12],'today')&&!_tabs[12].group&&_groups[0].tabs.length===3;")
        js('ZenfxTabHierarchy.setTier(_tabs[12],"favorite");'); wait()
        assert js("return _tabs[12].pinned&&SessionStore.getCustomTabValue(_tabs[12],'zenfxFavorite')==='true';")
        js('gBrowser.unpinTab(_tabs[12]);gBrowser.pinTab(_tabs[12]);'); wait()
        assert js("return ZenfxTabHierarchy.tierOf(_tabs[12])==='pinned'&&!SessionStore.getCustomTabValue(_tabs[12],'zenfxFavorite');")
        js('ZenfxTabHierarchy.setTier(_tabs[12],"today");_groups[1].ungroupTabs();'); wait()
        assert js('return !_groups[1].isConnected&&_tabs.slice(14,18).every(t=>!t.group);')
        check('Group rename/color/collapse/selection/ungroup and native Unpin clear Favorite metadata')

        # SessionStore round trip on one real loaded Favorite; never restart the original window.
        state = driver.cmd('WebDriver:ExecuteAsyncScript', {
            'script': '''const done=arguments[arguments.length-1];ChromeUtils.importESModule('moz-src:///browser/components/sessionstore/TabStateFlusher.sys.mjs').TabStateFlusher.flush(_tabs[0].linkedBrowser).then(()=>done(SessionStore.getTabState(_tabs[0])));''', 'args': []})['value']
        assert json.loads(state)['extData']['zenfxFavorite'] == 'true'
        js("window._restored=gBrowser.addTab('about:blank',{triggeringPrincipal:document.nodePrincipal});SessionStore.setTabState(_restored," + json.dumps(state) + ');')
        wait(700)
        assert js("return _restored.pinned&&ZenfxTabHierarchy.tierOf(_restored)==='favorite';")
        assert json.loads(js('return SessionStore.getTabState(_restored);'))['entries'][0]['url'] == json.loads(state)['entries'][0]['url']
        js('gBrowser.removeTab(_restored,{animate:false});')
        check('Favorite URL, native pin and custom metadata survive native SessionStore round-trip')

        # Real close and undo keyboard shortcuts; native New Tab row creates exactly one tab.
        js('gBrowser.selectedTab=_tabs[30];gBrowser.selectedBrowser.focus();'); wait()
        driver.key('w', ('\ue03d',)); wait()
        assert js('return !_tabs[30].isConnected;')
        driver.key('t', ('\ue03d', '\ue008')); wait(700)
        assert js("return gBrowser.selectedTab.label==='Fixture 30';")
        check('Command+W and Command+Shift+T restore the selected loaded page')
        js("_normal.shadowRoot.querySelector('[part=scrollbox]').scrollTop=0;"); wait()
        count = js('return gBrowser.tabs.length;')
        driver.click('_normal.shadowRoot.getElementById("zenfx-newtab-row")')
        assert js('return gBrowser.tabs.length;') == count + 1
        assert selected_visible()
        assert js('return !window.ZenfxNewTabOverlay&&getComputedStyle(document.getElementById("urlbar")).position!=="fixed";')
        js('gBrowser.removeTab(gBrowser.selectedTab,{animate:false});'); wait()
        check('Visible New Tab row creates one native tab without a floating search overlay')

        # Controlled drag with native Firefox setup; real DOM dragover/drop handlers.
        js('''window._beginDrag=(source)=>{window._dt=new DataTransfer();const r=source.getBoundingClientRect(),e=new DragEvent('dragstart',{dataTransfer:_dt,clientX:r.x+5,clientY:r.y+5,screenX:r.x+5,screenY:r.y+5});_strip.tabDragAndDrop.startTabDrag(e,source,{fromTabList:true});_beginPriorityFixture({composedPath:()=>[source],defaultPrevented:false});};window._dragTo=(target,after)=>{const r=target.getBoundingClientRect(),fav=ZenfxTabHierarchy.tierOf(target)==='favorite',x=r.x+r.width*(fav?(after?.75:.25):.5),y=r.y+r.height*(fav?.5:(after?.75:.25));for(const type of ['dragover','drop'])target.dispatchEvent(new DragEvent(type,{bubbles:true,cancelable:true,dataTransfer:_dt,clientX:x,clientY:y}));};''')
        for source, target, after, tier in [(25, 4, False, 'pinned'), (26, 1, True, 'favorite'), (7, 4, True, 'pinned'), (2, 4, False, 'pinned'), (6, 0, False, 'favorite'), (1, 0, False, 'favorite')]:
            js('_pins.shadowRoot.querySelector("[part=scrollbox]").scrollTop=0;'); wait()
            js(f'_beginDrag(_tabs[{source}]);'); wait()
            js(f'_dragTo(_tabs[{target}],{str(after).lower()});'); wait()
            assert js(f'return ZenfxTabHierarchy.tierOf(_tabs[{source}])==="{tier}"&&!_tabs[{source}]._dragData&&!_strip.hasAttribute("movingtab")&&!document.querySelector("[zenfx-priority-drop]");'), (source, target, tier)
            assert js(f'return _tabs[{source}].index===_tabs[{target}].index+({1 if after else -1});'), (source, target)
        check('Six native-setup priority drops: ordinary to pins/Favorites and reorder/tier transitions')

        # Actual native split creation via drop handler on each side, followed by native separation.
        for side in ['left', 'right']:
            js('gBrowser.selectedTab=_tabs[20];'); wait()
            js('_beginDrag(_tabs[35]);_showSplitFixture(_tabs[35],_tabs[20]);'); wait()
            assert js('return ZenfxDragToSplit.active;')
            js(f'''const z=document.querySelector('[data-zenfx-split-side="{side}"]');for(const type of ['dragover','drop'])z.dispatchEvent(new DragEvent(type,{{bubbles:true,cancelable:true,dataTransfer:_dt}}));'''); wait()
            assert js(f'return !!_tabs[35].splitview&&_tabs[35].splitview===_tabs[20].splitview&&_tabs[35].splitview.tabs[{0 if side=="left" else 1}]===_tabs[35]&&!ZenfxDragToSplit.active&&!document.getElementById("zenfx-split-drop-overlay");'), side
            assert js('return !ZenfxTabHierarchy.setTier(_tabs[35],"pinned")&&!_tabs[35].pinned;')
            assert js('return [_tabs[35],_tabs[20]].every(t=>!t.style.transform);')
            js('_tabs[35].splitview.unsplitTabs();'); wait()
        check('Plain split drop on both halves without modifiers, correct order, clean headers, priority guard and separation')

        for fallback in ['copy', 'modifier']:
            js('_beginDrag(_tabs[35]);_showSplitFixture(_tabs[35],_tabs[20]);'); wait()
            assert js("const z=document.querySelector('[data-zenfx-split-side=left]');return !z.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:_dt}));")
            result = js("""const z=document.querySelector('[data-zenfx-split-side=left]');""" + ("_dt.dropEffect='copy';" if fallback == 'copy' else '') + """const init={bubbles:true,cancelable:true,dataTransfer:_dt,altKey:""" + str(fallback == 'modifier').lower() + """};const over=z.dispatchEvent(new DragEvent('dragover',init)),drop=z.dispatchEvent(new DragEvent('drop',init));return {over,drop,color:z.style.color,active:ZenfxDragToSplit.active,split:!!_tabs[35].splitview};""")
            assert result == {'over': True, 'drop': True, 'color': 'transparent', 'active': True, 'split': False}, (fallback, result)
            driver.key('\ue00c'); js('delete _tabs[35]._dragData;')
        check('Copy and modified gestures are not claimed and clear a preceding split highlight')

        for cycle in range(20):
            js('_beginDrag(_tabs[35]);_showSplitFixture(_tabs[35],_tabs[20]);')
            driver.key('\ue00c'); wait(40)
            assert js('return !ZenfxDragToSplit.active&&!document.getElementById("zenfx-split-drop-overlay")&&!document.querySelector("[zenfx-priority-drop]");')
            js('delete _tabs[35]._dragData;')
        # Assert the page still receives real pointer input after repeated cancellation.
        js('gBrowser.selectedTab=_tabs[20];gBrowser.selectedBrowser.focus();'); wait()
        # Content is in a separate process. Click its known fixture button in
        # browser viewport coordinates and observe its real title-change event.
        driver.click('({getBoundingClientRect(){const r=gBrowser.selectedBrowser.getBoundingClientRect();return new DOMRect(r.x+70,r.y+140,80,30);}})')
        assert js('return gBrowser.selectedTab.label;') == 'Fixture 20 clicked'
        check('20 canceled drags leave page clicks working and no stale split overlay')

        # New Tab never overlaps a tab at narrow/short dimensions or after group changes.
        layouts = []
        for width, expanded, height in [(180, True, 500), (300, True, 768), (240, False, 500)]:
            driver.cmd('WebDriver:SetWindowRect', {'width': 1100, 'height': height})
            js(f'SidebarController._state.launcherExpanded={str(expanded).lower()};document.getElementById("sidebar-container").style.setProperty("width","{width}px","important");_normal.shadowRoot.querySelector("[part=scrollbox]").scrollTop=0;'); wait()
            metrics = js('''const n=_normal.shadowRoot.getElementById('zenfx-newtab-row').getBoundingClientRect(),s=_normal.shadowRoot.querySelector('[part=scrollbox]'),bad=Array.from(gBrowser.tabs).filter(t=>!t.pinned&&!t.hidden&&t.getBoundingClientRect().height>0).filter(t=>{const r=t.getBoundingClientRect();return r.top<n.bottom-1&&r.bottom>n.top+1;});return {buttonHeight:n.height,overlap:bad.map(t=>t.label),client:s.clientHeight,scroll:s.scrollHeight};''')
            assert metrics['buttonHeight'] >= 36 and metrics['client'] >= 36 and not metrics['overlap'], metrics
            box = js('return _normal.shadowRoot.querySelector("[part=scrollbox]").getBoundingClientRect().toJSON();')
            for delta in [600, -300]:
                driver.cmd('WebDriver:PerformActions', {'actions': [{'type': 'wheel', 'id': 'functional-wheel', 'actions': [{'type': 'scroll', 'origin': 'viewport', 'x': round(box['x']+box['width']/2), 'y': round(box['y']+box['height']/2), 'deltaX': 0, 'deltaY': delta, 'duration': 100}]}]}); wait()
            top = js('return _normal.shadowRoot.querySelector("[part=scrollbox]").scrollTop;')
            assert top > 0, top
            js('for(let i=0;i<25;i++)ZenfxTabHierarchy.refresh();'); wait()
            assert abs(js('return _normal.shadowRoot.querySelector("[part=scrollbox]").scrollTop;')-top)<1
            layouts.append({'width': width, 'expanded': expanded, 'windowHeight': height, **metrics, 'stableScrollTop': top})
        check('Scrollable ordinary tabs, stable refresh, no New Tab overlap at three layouts', layouts)

        compact = []
        driver.cmd('WebDriver:SetWindowRect', {'width': 1100, 'height': 768})
        js('SidebarController._state.launcherExpanded=true;')
        for top, side in [(False, False), (True, False), (False, True), (True, True)]:
            js(f"Services.prefs.setBoolPref('zenfx.compact.top',{str(top).lower()});Services.prefs.setBoolPref('zenfx.compact.sidebar',{str(side).lower()});gBrowser.selectedTab=_tabs[21];gBrowser.selectedTab=_tabs[20];gBrowser.selectedBrowser.focus();")
            # Real pointer at the left edge reveals the compact tab sidebar.
            driver.cmd('WebDriver:PerformActions', {'actions': [{
                'type': 'pointer', 'id': 'tab-regression-pointer',
                'parameters': {'pointerType': 'mouse'}, 'actions': [
                    {'type': 'pointerMove', 'origin': 'viewport', 'x': 2, 'y': 400}]}]})
            wait(700)
            assert selected_visible(), (top, side)
            driver.click('_tabs[20]')
            assert js('return gBrowser.selectedTab===_tabs[20];')
            count = js('return gBrowser.tabs.length;')
            driver.key('t', ('\ue03d',)); wait()
            assert js('return gBrowser.tabs.length;') == count + 1
            assert selected_visible(), (top, side)
            driver.key('w', ('\ue03d',)); wait()
            assert js('return gBrowser.tabs.length;') == count
            compact.append({'topCompact': top, 'sidebarCompact': side})
        js("Services.prefs.setBoolPref('zenfx.compact.top',false);Services.prefs.setBoolPref('zenfx.compact.sidebar',false);")
        wait()
        check('Tab edge reveal, selection and Command+T/W in all four compact configurations', compact)

        # Clear actual button preserves every protected class, closes ordinary split pair.
        js('SidebarController._state.launcherExpanded=true;gBrowser.selectedTab=_tabs[20];window._hidden=_tabs[59];gBrowser.hideTab(_hidden);window._protected=Array.from(gBrowser.tabs).filter(t=>t.pinned||t.group||t.hidden);window._clearable=Array.from(gBrowser.tabs).filter(t=>!t.pinned&&!t.group&&!t.hidden);gBrowser.addTabSplitView([_tabs[35],_tabs[20]],{insertBefore:_tabs[20]});_normal.shadowRoot.querySelector("[part=scrollbox]").scrollTop=0;'); wait()
        clear_count = js('return _clearable.length;')
        driver.click('_normal.shadowRoot.getElementById("zenfx-clear-tabs")')
        assert js('return _protected.every(t=>t.isConnected)&&_clearable.every(t=>!t.isConnected)&&!window.closed&&_normal.shadowRoot.getElementById("zenfx-clear-tabs").disabled;')
        driver.key('t', ('\ue03d', '\ue008')); wait(700)
        assert js('return Array.from(gBrowser.tabs).some(t=>!t.pinned&&!t.group&&!t.hidden);')
        check('Real Clear click closes ordinary tabs and split pair; protects pins/Favorites/groups/hidden; Undo works', {'closed': clear_count, 'protected': js('return _protected.length;')})

        # Repeated loader evaluation is idempotent; uninstall restores native slots/buttons.
        for cycle in range(10):
            load()
        wait()
        assert js('return _normal.shadowRoot.querySelectorAll("#zenfx-newtab-row").length===1&&_normal.shadowRoot.querySelectorAll("#zenfx-clear-tabs").length===1&&document.querySelectorAll("#zenfx-tab-priority-menu").length===1;')
        js('Services.prefs.setBoolPref("sidebar.verticalTabs",false);'); wait()
        assert js('return !_normal.hasAttribute("zenfx-hierarchy-vertical")&&Array.from(_strip.querySelectorAll("tab-group")).every(g=>!g.hasAttribute("slot"));')
        js('Services.prefs.setBoolPref("sidebar.verticalTabs",true);'); wait()
        js('for(const group of Array.from(_strip.querySelectorAll("tab-group")))group.ungroupTabs();for(const t of Array.from(gBrowser.tabs)){gBrowser.showTab(t);ZenfxTabHierarchy.setTier(t,"today");}ZenfxTabHierarchy.clearToday();'); wait()
        assert js('return !window.closed&&gBrowser.tabs.length===1&&!!gBrowser.selectedTab.isConnected;')
        check('Clearing the final ordinary tabs leaves a usable open window')
        js('ZenfxTabHierarchy.uninstall();ZenfxDragToSplit.uninstall();ZenfxCompactToggle.uninstall();')
        assert js('return !_normal.shadowRoot.getElementById("zenfx-newtab-row")&&!_normal.shadowRoot.getElementById("zenfx-clear-tabs")&&!document.getElementById("zenfx-tab-priority-menu")&&!document.getElementById("zenfx-split-drop-overlay")&&!document.documentElement.hasAttribute("zenfx-tab-hierarchy");')
        check('10 full reloads create no duplicate controls; horizontal switch and uninstall restore native layout')
        report['errors'] = js('return _errors;')
        assert not report['errors'], report['errors']
        report['pass'] = True
    except Exception as error:
        report['pass'] = False
        report['failure'] = str(error)
        if created:
            report['errors'] = js('return window._errors||[];')
        raise
    finally:
        try:
            js('for(const p of ' + json.dumps(prefs) + '){if(p.has)Services.prefs.setBoolPref(p.k,p.v);else Services.prefs.clearUserPref(p.k);}')
            if created:
                js('window.close();')
            driver.cmd('WebDriver:SwitchToWindow', {'handle': original, 'focus': True})
            driver.cmd('WebDriver:DeleteSession')
        finally:
            driver.socket.close()
            REPORT.write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    main()
