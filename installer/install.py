#!/usr/bin/env python3
"""Explicit-folder ZenFX setup. Never searches profiles, downloads, or elevates."""
import argparse
import configparser
import hashlib
import json
import os
import re
import shlex
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
OLD_ENTRY = '/* ZenFX installer entry. Original saved in zenfx-backups. */\n@import url("zenfx-installed/userChrome.css");\n'
ENTRY = OLD_ENTRY + '@import url("zenfx-custom.css");\n'
CUSTOM = b'/* Your ZenFX overrides. Setup updates preserve this file. */\n'
RESTORE_BEGIN = b'// BEGIN ZENFX SESSION RESTORE'
RESTORE_END = b'// END ZENFX SESSION RESTORE'
RESTORE_BLOCK = RESTORE_BEGIN + b'\nuser_pref("browser.startup.page", 3);\n' + RESTORE_END + b'\n'

def without_block(data, begin, end):
    pattern = rb'(?ms)^' + re.escape(begin) + rb'\r?\n.*?^' + re.escape(end) + rb'(?:\r?\n|$)'
    result = re.sub(pattern, b'', data)
    if begin in result or end in result:
        raise ValueError('An incomplete ZenFX settings block needs review. Nothing was changed.')
    return result

def session_restore_settings(data):
    if data.endswith(RESTORE_BLOCK): return data
    prior = without_block(data, RESTORE_BEGIN, RESTORE_END)
    return prior + (b'\n' if prior and not prior.endswith(b'\n') else b'') + RESTORE_BLOCK

def digest(data):
    return hashlib.sha256(data).hexdigest()

def atomic_write(path, data):
    temporary = path.with_name(path.name + '.zenfx-' + uuid.uuid4().hex + '.tmp')
    try:
        with temporary.open('xb') as stream:
            stream.write(data)
        if path.exists(): temporary.chmod(path.stat().st_mode & 0o777)
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)

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

def profile_folder(profile):
    profile = Path(profile).resolve()
    if not profile.is_dir() or not any((profile / n).is_file() for n in ('prefs.js', 'times.json', 'compatibility.ini')):
        raise ValueError('Choose the Firefox profile folder shown in about:support, not its chrome subfolder.')
    ini = profile / 'compatibility.ini'
    if ini.exists():
        parser = configparser.ConfigParser(); parser.read(ini)
        version = parser.get('Compatibility', 'LastVersion', fallback='158').split('_')[0]
        if version.split('.')[0] != '158':
            raise ValueError('This profile last used Firefox ' + version + '; this package targets Firefox 158.')
    return profile

def managed_files(managed):
    files = {
        managed / 'userChrome.css': (ROOT / 'standalone' / 'userChrome.css').read_bytes(),
        managed / 'chrome.manifest': (ROOT / 'installer' / 'chrome.manifest').read_bytes(),
        managed / 'enabled.json': b'{"zenfx":true,"version":"1.6"}\n',
    }
    for source in (ROOT / 'optional-chrome').glob('*.uc.js'):
        files[managed / source.name] = source.read_bytes()
    return files

def prepare(profile, application=None):
    profile = profile_folder(profile)
    if (profile / 'zenfx-install-state.json').exists():
        raise ValueError('ZenFX is already installed here. Choose 4 — Update existing ZenFX, or use --update. Backups are preserved.')
    managed = profile / 'chrome' / 'zenfx-installed'
    if managed.exists():
        raise ValueError('Unmanaged chrome/zenfx-installed already exists. Nothing was changed.')
    user = profile / 'user.js'
    prior = user.read_text() if user.exists() else ''
    if BEGIN in prior or END in prior:
        raise ValueError('An existing ZenFX settings block was found. Resolve the previous installation first.')
    files = {
        profile / 'chrome' / 'userChrome.css': ENTRY.encode(),
        profile / 'user.js': session_restore_settings((prior + ('\n' if prior and not prior.endswith('\n') else '') + BLOCK).encode()),
    }
    files.update(managed_files(managed))
    custom = profile / 'chrome' / 'zenfx-custom.css'
    if not custom.exists(): files[custom] = CUSTOM
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
    created_dirs = set()
    try:
        # Save the whole change set before the first destination write.
        for i, (target, data) in enumerate(files.items()):
            old = target.read_bytes() if target.exists() else None
            record = {'path': str(target), 'installed_hash': digest(data), 'existed': old is not None, 'changed': old != data, 'shared_loader': bool(application and target.is_relative_to(Path(state['application'])))}
            if target == profile / 'chrome' / 'zenfx-custom.css': record['user_owned'] = True
            if old is not None:
                saved = backup / str(i); saved.write_bytes(old); record['backup'] = str(saved)
            state['files'].append(record)
        changed_paths = {r['path'] for r in state['files'] if r['changed']}
        for target, data in files.items():
            if str(target) not in changed_paths: continue
            parent = target.parent
            while not parent.exists():
                created_dirs.add(parent); parent = parent.parent
            target.parent.mkdir(parents=True, exist_ok=True)
            atomic_write(target, data)
        atomic_write(profile / 'zenfx-install-state.json', (json.dumps(state, indent=2) + '\n').encode())
    except Exception:
        for record in reversed(state['files']):
            if record['changed']:
                target = Path(record['path'])
                if record['existed']:
                    atomic_write(target, Path(record['backup']).read_bytes())
                elif target.exists():
                    target.unlink()
        for folder in sorted(created_dirs, key=lambda p: len(p.parts), reverse=True):
            try: folder.rmdir()
            except OSError: pass  # Never remove user data or a pre-existing folder.
        raise
    return {'action': 'installed', 'profile': str(profile), 'backup': str(backup), 'startup_loader': bool(application), 'addon': 'Cleanup still requires a separately signed XPI; it was not installed.'}

def update(profile, closed=False, dry_run=False):
    """Update only profile-managed files; retain the original restore records."""
    if not closed:
        raise ValueError('Quit Firefox completely and confirm it is closed before updating.')
    profile = profile_folder(profile)
    state_path = profile / 'zenfx-install-state.json'
    safe_target(state_path)
    if not state_path.is_file():
        raise ValueError('No managed ZenFX installation was found. Choose install instead. Manually copied CSS needs the manual update instructions.')
    old_state = state_path.read_bytes()
    state = json.loads(old_state)
    managed = profile / 'chrome' / 'zenfx-installed'
    if state.get('format') != 1 or state.get('managed') != str(managed) or not isinstance(state.get('files'), list):
        raise ValueError('Unrecognized installation record. Nothing was changed.')
    records = {}
    for record in state['files']:
        target = Path(record['path'])
        if record.get('shared_loader'): continue  # Application files are never changed by updates.
        if target in records or not (target.parent == managed or target in
                (profile / 'user.js', profile / 'chrome/userChrome.css', profile / 'chrome/zenfx-custom.css')):
            raise ValueError('Unexpected path in installation record. Nothing was changed: ' + str(target))
        safe_target(target)
        records[target] = record
    safe_target(managed)
    desired = managed_files(managed)
    for target, data in desired.items():
        safe_target(target)
        record = records.get(target)
        if target.exists() and (record is None or digest(target.read_bytes()) != record['installed_hash']):
            raise ValueError('A managed file has custom edits; nothing was changed. Move CSS overrides to chrome/zenfx-custom.css and restore this managed file before updating: ' + str(target))
    # Migrate the exact old entry, but never replace a user's edited entry or user.js.
    entry = profile / 'chrome/userChrome.css'
    if entry in records and entry.is_file() and entry.read_bytes() == OLD_ENTRY.encode():
        desired[entry] = ENTRY.encode()
    custom = profile / 'chrome/zenfx-custom.css'
    safe_target(custom)
    if not custom.exists(): desired[custom] = CUSTOM
    user = profile / 'user.js'
    if user not in records:
        raise ValueError('The installation record is missing user.js. Nothing was changed.')
    prior_user = user.read_bytes() if user.exists() else b''
    desired[user] = session_restore_settings(prior_user)
    changes = {p: data for p, data in desired.items() if not p.exists() or p.read_bytes() != data}
    preview = {'action': 'update-preview' if dry_run else 'up-to-date', 'profile': str(profile),
        'files': [str(p) for p in changes], 'startup_loader': bool(state.get('application')),
        'note': 'Previous windows and tabs will reopen on startup. Other settings and custom CSS are preserved. Application loader and cleanup extension are not changed.'}
    if dry_run or not changes: return preview
    backup = profile / 'zenfx-backups' / ('update-' + uuid.uuid4().hex[:12])
    safe_target(backup)
    backup.mkdir(parents=True)
    previous = {p: p.read_bytes() if p.exists() else None for p in changes}
    (backup / 'install-state.json').write_bytes(old_state)
    saved_files = []
    for i, (target, data) in enumerate(previous.items()):
        saved = backup / str(i)
        if data is not None: saved.write_bytes(data)
        saved_files.append({'path': str(target), 'existed': data is not None, 'backup': str(saved) if data is not None else None})
    (backup / 'files.json').write_text(json.dumps(saved_files, indent=2) + '\n')
    # Retain user.js edits made since installation when uninstalling later.
    # The original installation backup remains untouched in its own directory.
    if user in changes and (not user.exists() or digest(prior_user) != records[user]['installed_hash']):
        restored_user = without_block(without_block(prior_user, RESTORE_BEGIN, RESTORE_END), BEGIN.encode(), END.encode())
        saved = backup / 'user.js-without-zenfx'
        saved.write_bytes(restored_user)
        records[user].update(existed=user.exists(), backup=str(saved))
    written = []
    try:
        for target, data in changes.items():
            target.parent.mkdir(parents=True, exist_ok=True)
            atomic_write(target, data)
            written.append(target)
            if target in records:
                record = records[target]
                record['installed_hash'] = digest(data)
                record['changed'] = True
            else:
                record = {'path': str(target), 'installed_hash': digest(data), 'existed': False,
                    'changed': True, 'shared_loader': False}
                state['files'].append(record)
            if target == custom: record['user_owned'] = True
        state['last_update_backup'] = str(backup)
        atomic_write(state_path, (json.dumps(state, indent=2) + '\n').encode())
    except Exception:
        for target in reversed(written):
            if previous[target] is None: target.unlink(missing_ok=True)
            else: atomic_write(target, previous[target])
        raise
    return {**preview, 'action': 'updated', 'backup': str(backup)}

def uninstall(profile, closed=False, dry_run=False):
    if not closed:
        raise ValueError('Quit Firefox completely before uninstalling.')
    profile = Path(profile).resolve()
    state_path = profile / 'zenfx-install-state.json'
    state = json.loads(state_path.read_text())
    changes = [r for r in state['files'] if r['changed'] and not r.get('shared_loader') and not r.get('user_owned')]
    for record in changes:
        target = Path(record['path']); safe_target(target)
        if not target.exists() or digest(target.read_bytes()) != record['installed_hash']:
            raise ValueError('A file was edited after installation; it was preserved. Review: ' + str(target))
    if dry_run:
        return {'action': 'uninstall-preview', 'files': [r['path'] for r in changes]}
    installed = {r['path']: Path(r['path']).read_bytes() for r in changes}
    restored = []
    try:
        for record in reversed(changes):
            target = Path(record['path'])
            if record['existed']:
                atomic_write(target, Path(record['backup']).read_bytes())
            else:
                target.unlink()
            restored.append(record['path'])
        # Installed preferences are not reset in prefs.js. Clear them in Firefox if desired.
        state_path.unlink()
    except Exception:
        for name in reversed(restored): atomic_write(Path(name), installed[name])
        raise
    managed = Path(state['managed'])
    if managed.exists() and not any(managed.iterdir()): managed.rmdir()
    return {'action': 'uninstalled', 'backup_preserved': state['backup'], 'note': 'Native vertical tabs remain enabled. Shared application loader files are retained for other opted-in profiles; remove them separately after all profiles are uninstalled. Reset zenfx preferences/about:config if desired.'}

def prompt_path(label):
    value = input(label).strip()
    # Finder can paste either a quoted path or a shell-escaped drag/drop path.
    # Interpret quoting only; never evaluate a shell command or substitutions.
    if os.name == 'nt':
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
    else:
        parts = shlex.split(value)
        if len(parts) == 1: value = parts[0]
    if not value: raise ValueError('A folder path is required. Nothing was changed.')
    return str(Path(value).expanduser())

def guided():
    print('ZenFX source setup — no downloaded app launcher or Tk required.')
    print('1. Appearance only (profile files; default)')
    print('2. Full setup (also adds the startup loader to Firefox)')
    print('3. Uninstall / restore profile originals')
    print('4. Update existing ZenFX (keep settings and custom CSS)')
    choice = input('Choose 1, 2, 3, or 4 [1]: ').strip() or '1'
    if choice not in ('1', '2', '3', '4'): raise ValueError('Choose 1, 2, 3, or 4. Nothing was changed.')
    print('In Firefox, open about:support → Profile Folder → Open Folder / Show in Finder.')
    profile = prompt_path('Paste or drag that profile folder here: ')
    application = None
    if choice == '2':
        print('Full setup writes two AutoConfig files inside the selected Firefox application.')
        print('On macOS, changing a signed app bundle can affect its signature and future launches.')
        print('Signing this installer would not remove that separate limitation. Full-restart loading is unverified.')
        application = prompt_path('Paste or drag Firefox.app (or its installation folder) here: ')
    if input('Quit Firefox completely. Is it fully closed? Type yes: ').strip().lower() != 'yes':
        print('Canceled. Nothing was changed.'); return None
    def apply(dry_run=False):
        if choice == '3': return uninstall(profile, closed=True, dry_run=dry_run)
        if choice == '4': return update(profile, closed=True, dry_run=dry_run)
        return install(profile, application, closed=True, dry_run=dry_run)
    preview = apply(dry_run=True)
    if choice == '4' and not preview['files']:
        print('Already up to date. Nothing was changed.'); return apply()
    print('\nFiles to ' + ('restore/remove:' if choice == '3' else 'install/update:'))
    for name in preview['files']: print('  ' + name)
    print('Existing originals are backed up; existing backups are retained.')
    if input('Proceed with these changes? Type yes: ').strip().lower() != 'yes':
        print('Canceled. Nothing was changed.'); return None
    result = apply()
    if choice == '3':
        print('Profile originals restored. Backups and any shared application loader were retained.')
    elif choice == '4':
        print('Updated. Reopen the selected Firefox profile.')
        print('Previous files saved in: ' + result['backup'])
        print(result['note'])
    else:
        print('Done. Reopen the selected Firefox profile.')
        print('Backup: ' + result['backup'])
        print('Startup scripts prepared.' if result['startup_loader'] else 'Appearance installed. Startup scripts are not enabled.')
        print('Automatic cleanup is separate; its unsigned source was not installed.')
    return result

def gui():
    import tkinter as tk
    from tkinter import filedialog, messagebox, ttk
    win = tk.Tk(); win.title('ZenFX Setup'); win.geometry('700x480')
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
    def run(remove=False, updating=False):
        try:
            kwargs = {'closed': closed.get()}
            if remove:
                result = uninstall(profile.get(), **kwargs)
            elif updating:
                preview = update(profile.get(), dry_run=True, **kwargs)
                if not preview['files']:
                    messagebox.showinfo('ZenFX Setup', 'Already up to date. Nothing was changed.', parent=win); return
                if not messagebox.askokcancel('Review update', '\n'.join(preview['files']) + '\n\nKeep settings/custom CSS and back up previous files. Update?', parent=win): return
                result = update(profile.get(), **kwargs)
            else:
                preview = install(profile.get(), app.get() or None, dry_run=True, **kwargs)
                if not messagebox.askokcancel('Review installation', '\n'.join(preview['files']) + '\n\nOriginal files are backed up. Install?', parent=win): return
                result = install(profile.get(), app.get() or None, **kwargs)
            message = ('ZenFX was removed from this profile. Original files were restored. Backups and shared startup-loader files were retained.' if remove else
                           'ZenFX appearance was installed. Restart Firefox.\n\n' + ('Startup hooks were prepared for this application. ' if result['startup_loader'] else 'Only the appearance is installed; no startup loader was selected. ') +
                           'Cleanup still requires the separately signed extension.\n\nBackup: ' + result['backup'])
            if updating: message = 'ZenFX updated. Restart Firefox.\n\n' + result['note'] + '\n\nPrevious files: ' + result['backup']
            messagebox.showinfo('ZenFX Setup', message, parent=win)
        except Exception as error:
            messagebox.showerror('Setup stopped', str(error), parent=win)
    row = ttk.Frame(box); row.pack(fill='x', pady=8)
    ttk.Button(row, text='Review and install', command=run).pack(side='left')
    ttk.Button(row, text='Review and update', command=lambda: run(updating=True)).pack(side='left', padx=8)
    ttk.Button(row, text='Uninstall / restore originals', command=lambda: run(True)).pack(side='right')
    win.mainloop()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--profile'); parser.add_argument('--application')
    parser.add_argument('--closed-confirmed', action='store_true')
    parser.add_argument('--dry-run', action='store_true')
    action = parser.add_mutually_exclusive_group()
    action.add_argument('--uninstall', action='store_true')
    action.add_argument('--update', action='store_true', help='Update an existing managed profile; keep settings/custom CSS and do not change application files')
    interface = parser.add_mutually_exclusive_group()
    interface.add_argument('--gui', action='store_true')
    interface.add_argument('--guided', action='store_true', help='Interactive source setup in Terminal; no Tk required')
    args = parser.parse_args()
    if args.guided:
        if args.profile or args.application or args.uninstall or args.update or args.dry_run or args.closed_confirmed:
            parser.error('--guided asks for its own targets and confirmations; do not combine it with other setup flags')
        try: guided()
        except (EOFError, KeyboardInterrupt): print('\nSetup interrupted. No further changes were made.')
        return
    if args.gui:
        if args.update: parser.error('Use Review and update in the graphical installer, or --profile with --update')
        gui(); return
    if args.update and args.application:
        parser.error('--update changes only the selected profile. Do not combine it with --application')
    if not args.profile:
        if args.application or args.uninstall or args.update or args.dry_run or args.closed_confirmed:
            parser.error('--profile is required with these setup flags')
        try: guided()
        except (EOFError, KeyboardInterrupt): print('\nSetup interrupted. No further changes were made.')
        return
    if args.update: result = update(args.profile, args.closed_confirmed, args.dry_run)
    elif args.uninstall: result = uninstall(args.profile, args.closed_confirmed, args.dry_run)
    else: result = install(args.profile, args.application, args.closed_confirmed, args.dry_run)
    print(json.dumps(result, indent=2))

if __name__ == '__main__':
    try: main()
    except Exception as error:
        print('ZenFX setup stopped: ' + str(error), file=sys.stderr); sys.exit(1)
