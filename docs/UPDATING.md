# Update ZenFX

**Run the latest setup → choose 4 — Update existing ZenFX → reopen Firefox.** You do not need to uninstall first.

1. On Mac, run the [quick setup command](SOURCE-SETUP.md#quick-mac-setup-copy-once) again. It downloads the latest package. Alternatively, [download the latest setup ZIP](https://github.com/ajshaw0327-sketch/zenfx-firefox/raw/refs/heads/main/dist/ZenFX-Setup.zip), extract it, and run its guided setup as before.
2. Choose **4 — Update existing ZenFX**. In Firefox, open `about:support` → **Profile Folder → Open Folder / Show in Finder** and drag that same folder into setup. Quit Firefox completely when prompted.
3. Review the changes and type `yes`. Reopen Firefox. If the managed files already match the package, setup says **Already up to date** and writes nothing.

The optional graphical installer has a **Review and update** button. It needs only the profile folder; the application field is ignored for updates.

The floating New Tab feature has been removed. Option 4 replaces its old script with a compatibility cleanup file, so older startup loaders stop intercepting New Tab too. No application-loader change is required for this removal. New Tab opens a regular Firefox tab after restart.

## What stays

- Your tabs, Favorites, folders, themes, Compact Mode preferences, shortcut, and unrelated Firefox settings. Updates now add a small managed session-restore block to `user.js` to enable **Open previous windows and tabs**. Existing preference lines are retained; `prefs.js` and session files are not rewritten by setup.
- Custom CSS in **`chrome/zenfx-custom.css`** inside your profile. This file loads after the managed stylesheet. Setup creates it once and leaves existing contents alone, including during uninstall.
- Your original uninstall backups. Each update also backs up the files it replaces under `zenfx-backups/update-…` and rolls back completed writes if the update fails.

Updates replace the managed CSS and interface scripts. They do not run in the background, add polling, change Firefox application files, or install the separate cleanup add-on.

After this update, regular tabs restore when Firefox is fully quit and reopened. Private windows are excluded by Firefox. [Session restoration and recovery](SESSION-RESTORE.md).

## If you customized the files

Keep CSS overrides in `chrome/zenfx-custom.css`, rather than editing `chrome/zenfx-installed/userChrome.css`. If a managed file has been edited, setup stops before writing anything and identifies it. Save those edits separately and restore that managed file to the version you installed before updating; do not discard them. An edited top-level `chrome/userChrome.css` is retained. If it lacks `@import url("zenfx-custom.css");`, add that import after the ZenFX import to activate the separate overrides file.

Old setup installations are recognized from their installation record. Their exact old CSS entry is upgraded automatically to load the separate custom file. A manual CSS copy has no installation record: either keep using the [appearance-only copy instructions](../README.md#start-with-appearance-only), or use the current setup once before using the managed updater. Setup backs up the previous stylesheet; move personal overrides into `zenfx-custom.css` to keep them active.

An update keeps the existing application startup loader. It cannot repair a loader removed by a Firefox update or expand an older loader's script list. If startup scripts are missing, follow [startup troubleshooting](../START-HERE.md#if-something-is-missing); application-loader setup remains a separate operation. The cleanup extension also keeps its own installation/update requirements.

## Command-line option

From the latest extracted ZenFX folder:

```sh
python3 installer/install.py --profile "/path/to/profile" --update --closed-confirmed
```

Add `--dry-run` to preview without writing. On Windows, use `py -3` instead of `python3`.

Updates use only the package you launched. Re-running an old downloaded copy does not fetch new files; use the quick command or the latest ZIP above. The updater does not check online or run after it exits.
