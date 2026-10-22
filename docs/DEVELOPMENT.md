# Build and test

Python 3.10+ and Node.js are needed for development. Builds use Python's standard library, perform no downloads, and install nothing. The launchers and default command use the text wizard. Tk is needed only for the explicit `--gui` graphical installer; `python3 installer/install.py --guided` runs the source wizard without Tk.

From the repository root:

```sh
python3 build.py
python3 -m unittest discover -s installer/tests -v
node --test companion/tests/*.test.cjs optional-chrome/tests/*.test.cjs
```

The build generates `standalone/userChrome.css`, `SHA256.json`, and three archives under `dist/`. The appearance archive contains exactly `README.md` and `chrome/userChrome.css`. The cleanup archive contains only its runtime files; it remains unsigned. The full archive uses an explicit allowlist, excluding `.git`, browser profiles, caches, and local test evidence.

Edit the modular files under `chrome/zenfx/` and rebuild to update the standalone file and downloads. Do not edit only a generated archive. For behavior changes, test in a disposable Firefox 158 profile, verify its path before privileged commands, and restore temporary tabs/themes/settings. Browser scripts must be loaded after delayed browser startup in each browser window.

Changing CSS/JavaScript, rebuilding ZIPs, or passing unit tests does not certify cross-version browser compatibility or AutoConfig cold-start persistence. Keep the limitations in the README and validation report accurate.

The retirement tests verify that old loaders can still evaluate the former New Tab script filename without intercepting native commands, and that an already-loaded old hook is unloaded once. Native keyboard/button/menu entry points require the isolated Firefox checks recorded in the validation report.

Split-drag lifecycle tests cover a missing dragend followed by a fresh gesture, window versus descendant blur, release outside the strip, tab close/pin, 50 repeated cancellations, and uninstall during a gesture. Browser scrolling checks separately use real wheel input with overflowing ordinary/pinned tabs and native tab selection.

Installer tests include managed updates from the old entry format, preserved custom CSS/settings/application files, no-op/preview behavior, rollback/retry, and original uninstall restoration after an update. All targets are temporary filesystem fixtures. To test an update manually, use the latest extracted package, a closed disposable Firefox 158 profile, and `--update --dry-run` before making changes. No normal browsing profile or real application bundle is needed for the automated checks.
