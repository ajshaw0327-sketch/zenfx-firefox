#!/usr/bin/env python3
"""Explicit-folder ZenFX setup. Never searches profiles, downloads, or elevates."""
import argparse
import configparser
import hashlib
import json
import os
from pathlib import Path
import sys
import uuid

ROOT = Path(__file__).resolve().parent.parent
BEGIN, END = '// BEGIN ZENFX MANAGED SETTINGS', '// END ZENFX MANAGED SETTINGS'
BLOCK = BEGIN + '\n' + '\n'.join('user_pref(%s, %s);' % (json.dumps(k), json.dumps(v)) for k, v in {
    'toolkit.legacyUserProfileCustomizations.stylesheets': True,
    'sidebar.verticalTabs': True, 'sidebar.revamp': True,
    'sidebar.visibility': 'always-show', 'zenfx.enabled': True,
}.items()) + '\n' + END + '\n'
ENTRY = '/* ZenFX installer entry. Original saved in zenfx-backups. */\n@import url("zenfx-installed/userChrome.css");\n'

def digest(data):
    return hashlib.sha256(data).hexdigest()

def safe_target(path):
    # Refuse symlinks in destination paths to keep writes in the selected folders.
    for item in [path, *path.parents]:
        if item.is_symlink():
            raise ValueError('Destination contains a symbolic link: ' + str(item))

def app_resources(folder):
    folder = Path(folder).resolve()
    if folder.suffix == '.app':
        folder = folder / 'Contents' / 'Resources'
    if not (folder / 'application.ini').is_file():
        raise ValueError('Choose Firefox.app or the Firefox application directory containing application.ini.')
    parser = configparser.ConfigParser()
    parser.read(folder / 'application.ini')
    version = parser.get('App', 'Version')
    if version.split('.')[0] != '158':
        raise ValueError('This build is verified on Firefox 158. Selected application version: ' + version)
    pref_dir = folder / 'defaults' / 'pref'
    for path in pref_dir.glob('*.js'):
        if path.name != 'zenfx-autoconfig.js' and 'general.config.filename' in path.read_text(errors='replace'):
            raise ValueError('An existing AutoConfig setup is present. Nothing was changed: ' + str(path))
    return folder

def prepare(profile, application=None):
    profile = Path(profile).resolve()
    if not profile.is_dir() or not any((profile / n).is_file() for n in ('prefs.js', 'times.json', 'compatibility.ini')):
        raise ValueError('Choose the Firefox profile folder shown in about:support, not its chrome subfolder.')
    if (profile / 'zenfx-install-state.json').exists():
        raise ValueError('ZenFX is already installed here. Uninstall with this setup before reinstalling; backups are preserved.')
    ini = profile / 'compatibility.ini'
    if ini.exists():
        parser = configparser.ConfigParser(); parser.read(ini)
        version = parser.get('Compatibility', 'LastVersion', fallback='158').split('_')[0]
        if version.split('.')[0] != '158':
            raise ValueError('This profile last used Firefox ' + version + '; this package targets Firefox 158.')
    managed = profile / 'chrome' / 'zenfx-installed'
    if managed.exists():
        raise ValueError('Unmanaged chrome/zenfx-installed already exists. Nothing was changed.')
    user = profile / 'user.js'
    prior = user.read_text() if user.exists() else ''
    if BEGIN in prior or END in prior:
        raise ValueError('An existing ZenFX settings block was found. Resolve the previous installation first.')
    files = {
        profile / 'chrome' / 'userChrome.css': ENTRY.encode(),
        profile / 'user.js': (prior + ('\n' if prior and not prior.endswith('\n') else '') + BLOCK).encode(),
        managed / 'userChrome.css': (ROOT / 'standalone' / 'userChrome.css').read_bytes(),
        managed / 'chrome.manifest': (ROOT / 'installer' / 'chrome.manifest').read_bytes(),
        managed / 'enabled.json': b'{"zenfx":true,"version":"1.6"}\n',
    }
    for source in (ROOT / 'optional-chrome').glob('*.uc.js'):
        files[managed / source.name] = source.read_bytes()
    if application:
        resources = app_resources(application)
        files[resources / 'zenfx.cfg'] = (ROOT / 'installer' / 'zenfx.cfg').read_bytes()
        files[resources / 'defaults' / 'pref' / 'zenfx-autoconfig.js'] = (ROOT / 'installer' / 'zenfx-autoconfig.js').read_bytes()
        for p, data in list(files.items()):
            if p.is_relative_to(resources) and p.exists() and p.read_bytes() != data:
                # Upgrade only an exact previously shipped ZenFX loader. It is
                # backed up by the same transaction; custom AutoConfig stays protected.
                known_loader = p == resources / 'zenfx.cfg' and any(
                    p.read_bytes() == old.read_bytes() for old in (ROOT / 'installer/legacy').glob('*.cfg'))
                if not known_loader:
                    raise ValueError('A different existing file would be overwritten: ' + str(p))
    for p in files:
        safe_target(p)
    return profile, managed, files

def install(profile, application=None, closed=False, dry_run=False):
    if not closed:
        raise ValueError('Quit Firefox completely and confirm it is closed before installing.')
    profile, managed, files = prepare(profile, application)
    if dry_run:
        return {'action': 'preview', 'profile': str(profile), 'files': [str(p) for p in files], 'startup_loader': bool(application)}
    backup = profile / 'zenfx-backups' / ('install-' + uuid.uuid4().hex[:12])
    backup.mkdir(parents=True)
    state = {'format': 1, 'backup': str(backup), 'managed': str(managed), 'application': str(app_resources(application)) if application else None, 'files': []}
    try:
        # Save the whole change set before the first destination write.
        for i, (target, data) in enumerate(files.items()):
            old = target.read_bytes() if target.exists() else None
            record = {'path': str(target), 'installed_hash': digest(data), 'existed': old is not None, 'changed': old != data, 'shared_loader': bool(application and target.is_relative_to(Path(state['application'])))}
            if old is not None:
                saved = backup / str(i); saved.write_bytes(old); record['backup'] = str(saved)
            state['files'].append(record)
        changed_paths = {r['path'] for r in state['files'] if r['changed']}
        for target, data in files.items():
            if str(target) not in changed_paths: continue
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        (profile / 'zenfx-install-state.json').write_text(json.dumps(state, indent=2) + '\n')
    except Exception:
        for record in reversed(state['files']):
            if record['changed']:
                target = Path(record['path'])
                if record['existed']:
                    target.write_bytes(Path(record['backup']).read_bytes())
                elif target.exists():
                    target.unlink()
        raise
    return {'action': 'installed', 'profile': str(profile), 'backup': str(backup), 'startup_loader': bool(application), 'addon': 'Cleanup still requires a separately signed XPI; it was not installed.'}

def uninstall(profile, closed=False, dry_run=False):
    if not closed:
        raise ValueError('Quit Firefox completely before uninstalling.')
    profile = Path(profile).resolve()
    state_path = profile / 'zenfx-install-state.json'
    state = json.loads(state_path.read_text())
    changes = [r for r in state['files'] if r['changed'] and not r.get('shared_loader')]
    for record in changes:
        target = Path(record['path']); safe_target(target)
        if not target.exists() or digest(target.read_bytes()) != record['installed_hash']:
            raise ValueError('A file was edited after installation; it was preserved. Review: ' + str(target))
    if dry_run:
        return {'action': 'uninstall-preview', 'files': [r['path'] for r in changes]}
    for record in reversed(changes):
        target = Path(record['path'])
        if record['existed']:
            target.write_bytes(Path(record['backup']).read_bytes())
        else:
            target.unlink()
    # Installed preferences are not reset in prefs.js. Clear them in Firefox if desired.
    state_path.unlink()
    managed = Path(state['managed'])
    if managed.exists() and not any(managed.iterdir()): managed.rmdir()
    return {'action': 'uninstalled', 'backup_preserved': state['backup'], 'note': 'Native vertical tabs remain enabled. Shared application loader files are retained for other opted-in profiles; remove them separately after all profiles are uninstalled. Reset zenfx preferences/about:config if desired.'}

def gui():
    import tkinter as tk
    from tkinter import filedialog, messagebox, ttk
    win = tk.Tk(); win.title('ZenFX Setup'); win.geometry('640x440')
    box = ttk.Frame(win, padding=22); box.pack(fill='both', expand=True)
    ttk.Label(box, text='Install ZenFX', font=('', 22)).pack(anchor='w')
    ttk.Label(box, text='Firefox 158 desktop • macOS verified • Windows/Linux unverified', wraplength=580).pack(anchor='w', pady=(6, 14))
    profile, app = tk.StringVar(), tk.StringVar()
    for text, var in [('Firefox profile folder (from about:support)', profile), ('Firefox application (optional: enables startup hooks)', app)]:
        ttk.Label(box, text=text).pack(anchor='w'); row = ttk.Frame(box); row.pack(fill='x', pady=(4, 10))
        ttk.Entry(row, textvariable=var).pack(side='left', fill='x', expand=True)
        ttk.Button(row, text='Choose…', command=lambda v=var: v.set(filedialog.askdirectory(title='Choose folder') or v.get())).pack(side='right', padx=(8, 0))
    ttk.Label(box, text='With an application selected, setup adds two AutoConfig files to that application. Only opted-in profiles load the privileged hooks. Existing AutoConfig is preserved by refusing conflicts. Cleanup is a separate signed extension.', wraplength=580).pack(anchor='w', pady=4)
    closed = tk.BooleanVar(); ttk.Checkbutton(box, text='Firefox is completely closed', variable=closed).pack(anchor='w', pady=10)
    def run(remove=False):
        try:
            kwargs = {'closed': closed.get()}
            if remove:
                result = uninstall(profile.get(), **kwargs)
            else:
                preview = install(profile.get(), app.get() or None, dry_run=True, **kwargs)
                if not messagebox.askokcancel('Review installation', '\n'.join(preview['files']) + '\n\nOriginal files are backed up. Install?', parent=win): return
                result = install(profile.get(), app.get() or None, **kwargs)
            message = ('ZenFX was removed from this profile. Original files were restored. Backups and shared startup-loader files were retained.' if remove else
                           'ZenFX appearance was installed. Restart Firefox.\n\n' + ('Startup hooks were prepared for this application. ' if result['startup_loader'] else 'Only the appearance is installed; no startup loader was selected. ') +
                           'Cleanup still requires the separately signed extension.\n\nBackup: ' + result['backup'])
            messagebox.showinfo('ZenFX Setup', message, parent=win)
        except Exception as error:
            messagebox.showerror('Setup stopped', str(error), parent=win)
    row = ttk.Frame(box); row.pack(fill='x', pady=8)
    ttk.Button(row, text='Review and install', command=run).pack(side='left')
    ttk.Button(row, text='Uninstall / restore originals', command=lambda: run(True)).pack(side='right')
    win.mainloop()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--profile'); parser.add_argument('--application')
    parser.add_argument('--closed-confirmed', action='store_true')
    parser.add_argument('--dry-run', action='store_true'); parser.add_argument('--uninstall', action='store_true')
    parser.add_argument('--gui', action='store_true')
    args = parser.parse_args()
    if args.gui or not args.profile:
        gui(); return
    result = uninstall(args.profile, args.closed_confirmed, args.dry_run) if args.uninstall else install(args.profile, args.application, args.closed_confirmed, args.dry_run)
    print(json.dumps(result, indent=2))

if __name__ == '__main__':
    try: main()
    except Exception as error:
        print('ZenFX setup stopped: ' + str(error), file=sys.stderr); sys.exit(1)
