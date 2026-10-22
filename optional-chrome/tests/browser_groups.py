#!/usr/bin/env python3
"""Opt-in collapsed/horizontal group checks. See docs/DEVELOPMENT.md.

Uses only the fixed disposable profile and native tab nodes. No OS drag loop.
"""
import base64
import hashlib
import json
from pathlib import Path
import tempfile
from urllib.parse import quote

from browser_tabs import Driver, PROFILE, ROOT


def main():
    assert (PROFILE / 'chrome/userChrome.css').read_bytes() == (ROOT / 'standalone/userChrome.css').read_bytes()
    driver = Driver()
    js, wait = driver.js, driver.wait
    original = driver.cmd('WebDriver:GetWindowHandle')['value']
    before = driver.cmd('WebDriver:GetWindowHandles')
    prefs = js("return ['sidebar.verticalTabs','zenfx.compact.top','zenfx.compact.sidebar'].map(k=>({k,has:Services.prefs.prefHasUserValue(k),v:Services.prefs.getBoolPref(k,false)}));")
    report = {'version': js('return Services.appinfo.version;'), 'environment': 'macOS, headless Firefox, disposable window',
              'method': 'Native groups with real pointer clicks, keyboard commands and wheel input; temporary native theme add-ons. No physical OS drag loop.',
              'cases': [], 'checks': [], 'sourceHashes': {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in ['chrome/zenfx/features.css', 'optional-chrome/zenfx-tab-hierarchy.uc.js']}}
    created, original_theme = None, None
    theme_ids = []

    def async_js(source):
        return driver.cmd('WebDriver:ExecuteAsyncScript', {'script': 'const done=arguments[arguments.length-1];(async()=>{' + source + '})().then(done,e=>done({error:String(e)}));', 'args': []})['value']

    def check(name):
        report['checks'].append(name)
        print('PASS', name, flush=True)

    def mode(name):
        js(f"Services.prefs.setBoolPref('sidebar.verticalTabs',{str(name!='horizontal').lower()});SidebarController._state.launcherExpanded={str(name=='expanded').lower()};")
        wait(500)

    def snapshot(name):
        data = async_js("const b=await window.docShell.browsingContext.currentWindowGlobal.drawSnapshot(new DOMRect(0,0,innerWidth,Math.min(innerHeight,500)),1,'white');const c=document.createElementNS('http://www.w3.org/1999/xhtml','canvas');c.width=b.width;c.height=b.height;c.getContext('2d').drawImage(b,0,0);const data=c.toDataURL('image/png');b.close();return data;")
        assert isinstance(data, str), data
        Path('/tmp/zenfx-verified-groups-' + name + '.png').write_bytes(base64.b64decode(data.split(',')[1]))

    with tempfile.TemporaryDirectory(prefix='zenfx-group-themes-', dir='/tmp') as theme_dir:
        try:
            driver.cmd('WebDriver:ExecuteAsyncScript', {'script': "const done=arguments[arguments.length-1],w=OpenBrowserWindow(),o={observe(s){if(s===w){Services.obs.removeObserver(o,'browser-delayed-startup-finished');done(true)}}};Services.obs.addObserver(o,'browser-delayed-startup-finished');", 'args': []})
            created = next(handle for handle in driver.cmd('WebDriver:GetWindowHandles') if handle not in before)
            driver.cmd('WebDriver:SwitchToWindow', {'handle': created, 'focus': True})
            driver.cmd('WebDriver:SetWindowRect', {'width': 1100, 'height': 768})
            js("Services.prefs.setBoolPref('sidebar.verticalTabs',true);Services.prefs.setBoolPref('zenfx.compact.top',false);Services.prefs.setBoolPref('zenfx.compact.sidebar',false);window._errors=[];window.addEventListener('error',e=>_errors.push(String(e.message)));window._strip=gBrowser.tabContainer;window._normal=document.getElementById('tabbrowser-arrowscrollbox');")
            for name in ['zenfx-tab-hierarchy.uc.js', 'zenfx-drag-to-split.uc.js', 'zenfx-compact-toggle.uc.js']:
                js((ROOT / 'optional-chrome' / name).read_text())
            urls = ['data:text/html,' + quote(f'<title>Group fixture {i:02}</title><body>Local test {i:02}') for i in range(40)]
            js('window._tabs=' + json.dumps(urls) + ".map(url=>gBrowser.addTab(url,{triggeringPrincipal:document.nodePrincipal,skipAnimation:true}));gBrowser.selectedTab=_tabs[20];for(const t of Array.from(gBrowser.tabs))if(!_tabs.includes(t))gBrowser.removeTab(t,{animate:false});for(let i=0;i<4;i++)ZenfxTabHierarchy.setTier(_tabs[i],i<2?'favorite':'pinned');window._groups=[gBrowser.addTabGroup(_tabs.slice(4,7),{label:'Research',color:'blue'}),gBrowser.addTabGroup(_tabs.slice(7,10),{label:'Design notes',color:'red'}),gBrowser.addTabGroup(_tabs.slice(10,13),{label:'Long folder name with many words and Unicode ✓',color:'green'})];")
            wait(700)
            js("window._manager=ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs').AddonManager;")
            original_theme = async_js("return (await _manager.getAddonsByTypes(['theme'])).find(a=>a.isActive)?.id;")
            assert isinstance(original_theme, str), original_theme

            for theme in ['original', 'light', 'dark']:
                if theme != 'original':
                    directory = Path(theme_dir) / theme
                    directory.mkdir()
                    manifest = {'manifest_version': 2, 'name': 'ZenFX group check ' + theme, 'version': '1.0',
                                'browser_specific_settings': {'gecko': {'id': f'group-check-{theme}@zenfx.test'}},
                                'theme': {'colors': {'frame': '#e9edf3' if theme == 'light' else '#1d2430', 'tab_background_text': '#202531' if theme == 'light' else '#f2f3f9', 'toolbar': '#fafbfc' if theme == 'light' else '#273343', 'toolbar_text': '#252931' if theme == 'light' else '#f3f4f7'}}}
                    (directory / 'manifest.json').write_text(json.dumps(manifest))
                    addon_id = async_js("const file=Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);file.initWithPath(" + json.dumps(str(directory)) + ");const addon=await _manager.installTemporaryAddon(file);await addon.enable();return addon.id;")
                    assert isinstance(addon_id, str), addon_id
                    theme_ids.append(addon_id)
                    wait(600)
                for layout in ['expanded', 'collapsed', 'horizontal']:
                    mode(layout)
                    for collapsed in [False, True]:
                        js('gBrowser.selectedTab=_tabs[20];for(const group of _groups)group.collapsed=' + str(collapsed).lower() + ';_normal.shadowRoot.querySelector("[part=scrollbox]").scrollTop=0;_normal.shadowRoot.querySelector("[part=scrollbox]").scrollLeft=0;')
                        wait(400)
                        metrics = js("""return _groups.map(g=>{const l=g.labelElement,s=getComputedStyle(l),p=getComputedStyle(l,'::before'),r=l.getBoundingClientRect(),probe=document.createElementNS('http://www.w3.org/1999/xhtml','span');probe.style.color='var(--tab-group-color)';l.append(probe);const expected=getComputedStyle(probe).color;probe.remove();return {label:g.label,aria:l.getAttribute('aria-label'),expanded:l.getAttribute('aria-expanded'),width:r.width,height:r.height,iconWidth:p.width,iconHeight:p.height,iconFill:p.backgroundColor,expectedFill:expected,mask:p.maskImage.includes('data:image/svg+xml'),maskImage:p.maskImage,opacity:p.opacity,firstLetter:getComputedStyle(l,'::first-letter').color,font:s.fontSize,slot:g.getAttribute('slot'),childHeight:g.tabs[0].getBoundingClientRect().height,childWidth:g.tabs[0].getBoundingClientRect().width};});""")
                        for entry in metrics:
                            assert entry['mask'] and entry['opacity'] == '1' and entry['iconFill'] == entry['expectedFill'], entry
                            assert entry['aria'] == entry['label'] and entry['expanded'] == str(not collapsed).lower(), entry
                            assert entry['width'] >= 28 and entry['height'] >= 24, entry
                            child_size = entry['childWidth'] if layout == 'horizontal' else entry['childHeight']
                            assert child_size < 1 if collapsed else child_size > 0, entry
                            assert entry['iconWidth'] == ('18px' if layout == 'horizontal' else '20px'), entry
                            if layout == 'collapsed':
                                assert entry['font'] == '0px' and entry['firstLetter'] == 'rgba(0, 0, 0, 0)', entry
                            if layout == 'horizontal':
                                assert entry['slot'] is None, entry
                            del entry['maskImage']
                        report['cases'].append({'theme': theme, 'layout': layout, 'collapsed': collapsed, 'groups': metrics})
                    # Real native click toggles the group and keeps its full accessible name.
                    js('for(const g of _groups)g.collapsed=false;_normal.shadowRoot.querySelector("[part=scrollbox]").scrollTop=0;_normal.shadowRoot.querySelector("[part=scrollbox]").scrollLeft=0;'); wait()
                    driver.click('_groups[0].labelElement')
                    assert js('return _groups[0].collapsed;'), (layout, theme)
                    driver.click('_groups[0].labelElement')
                    assert js('return !_groups[0].collapsed;'), (layout, theme)
                    js('_groups[0].collapsed=true;gBrowser.selectedTab=_tabs[5];'); wait(600)
                    selected = js('const a=_tabs[5].getBoundingClientRect(),b=_normal.shadowRoot.querySelector("[part=scrollbox]").getBoundingClientRect();return {width:a.width,height:a.height,top:a.top,bottom:a.bottom,left:a.left,right:a.right,viewport:b.toJSON()};')
                    assert selected['height'] > 0 and selected['width'] > 0, (layout, selected)
                    if layout == 'horizontal':
                        assert selected['left'] >= selected['viewport']['left']-1 and selected['right'] <= selected['viewport']['right']+1, selected
                    else:
                        assert selected['top'] >= selected['viewport']['top']-1 and selected['bottom'] <= selected['viewport']['bottom']+1, selected
                    js('gBrowser.selectedTab=_tabs[20];_groups[0].collapsed=false;'); wait()
                    if theme == 'original':
                        snapshot(layout)
                check(theme + ': group colors, open/closed glyphs, full accessible labels and native click in all three layouts')

            # Native horizontal ordering must not be rewritten by vertical priorities.
            mode('horizontal')
            js('gBrowser.moveTabBefore(_tabs[3],_tabs[0]);window._pinOrder=Array.from(gBrowser.tabs).filter(t=>t.pinned);for(let i=0;i<20;i++)ZenfxTabHierarchy.refresh();'); wait()
            assert js('return _pinOrder.every((t,i)=>Array.from(gBrowser.tabs).filter(t=>t.pinned)[i]===t)&&_tabs[3].index===0;')
            # Native move APIs preserve group membership and allow groups among ordinary tabs.
            js('gBrowser.moveTabAfter(_groups[1],_tabs[25]);ZenfxTabHierarchy.refresh();'); wait()
            assert js('return _groups[1].tabs[0].index>_tabs[25].index&&_groups[1].tabs.every(t=>t.group===_groups[1]);')
            check('Horizontal pin and group ordering survives repeated hierarchy refreshes')
            js('gBrowser.selectedTab=_tabs[39];'); wait(600)
            driver.key('\ue004', ('\ue009',)); wait()
            assert js('return gBrowser.selectedTab===_tabs[3];')  # native wrap to first pin
            count = js('return gBrowser.tabs.length;')
            driver.key('t', ('\ue03d',)); wait()
            assert js('return gBrowser.tabs.length;') == count + 1
            driver.key('w', ('\ue03d',)); wait()
            assert js('return gBrowser.tabs.length;') == count
            check('Horizontal native keyboard wrap and New Tab/close')
            # Real wheel moves overflowing horizontal tabs in both directions.
            rect = js('return _normal.shadowRoot.querySelector("[part=scrollbox]").getBoundingClientRect().toJSON();')
            positions = []
            js('_normal.shadowRoot.querySelector("[part=scrollbox]").scrollLeft=0;'); wait()
            for delta in [650, -300]:
                driver.cmd('WebDriver:PerformActions', {'actions': [{'type': 'wheel', 'id': 'group-wheel', 'actions': [{'type': 'scroll', 'origin': 'viewport', 'x': round(rect['x']+rect['width']/2), 'y': round(rect['y']+rect['height']/2), 'deltaX': 0, 'deltaY': delta, 'duration': 120}]}]})
                wait(500)
                positions.append(js('return _normal.shadowRoot.querySelector("[part=scrollbox]").scrollLeft;'))
            assert positions[0] > 100 and positions[1] < positions[0] - 50, positions
            report['horizontalWheel'] = positions
            check('Horizontal overflow scrolls forward and backward with real wheel input')

            # Orientation cycles retain memberships, metadata, slots and controls.
            js('window._memberships=_groups.map(g=>g.tabs.slice());')
            for cycle in range(4):
                for layout in ['collapsed', 'horizontal', 'expanded']:
                    mode(layout)
                    js('gBrowser.selectedTab=_tabs[5];'); wait(500)
                    assert js('return _groups.every((g,i)=>g.tabs.length===_memberships[i].length&&g.tabs.every((t,j)=>t===_memberships[i][j]));')
            check('Twelve orientation changes preserve group membership and selected grouped tabs')
            # Appearance-only installations get the same glyphs without helper scripts.
            js('ZenfxTabHierarchy.uninstall();ZenfxCompactToggle.uninstall();ZenfxDragToSplit.uninstall();')
            for layout in ['expanded', 'collapsed', 'horizontal']:
                mode(layout)
                assert js('return _groups.every(g=>getComputedStyle(g.labelElement,"::before").maskImage.includes("data:image/svg+xml"));')
            check('All three folder styles work in CSS-only installations')
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
                if created and theme_ids:
                    # Select the original before removing inactive test themes;
                    # uninstalling the active theme queues native fallback work.
                    report['themeRestored'] = async_js('const original=await _manager.getAddonByID(' + json.dumps(original_theme) + ');if(original)await original.enable();for(const id of ' + json.dumps(theme_ids) + '){const addon=await _manager.getAddonByID(id);if(addon)await addon.uninstall();}return !!original?.isActive;')
                    if report['themeRestored'] is not True:
                        report['pass'] = False
                js('for(const p of ' + json.dumps(prefs) + '){if(p.has)Services.prefs.setBoolPref(p.k,p.v);else Services.prefs.clearUserPref(p.k);}')
                if created:
                    js('window.close();')
                driver.cmd('WebDriver:SwitchToWindow', {'handle': original, 'focus': True})
                driver.cmd('WebDriver:DeleteSession')
            finally:
                driver.socket.close()
                (ROOT / 'docs/validation/tab-groups-orientations.json').write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    main()
