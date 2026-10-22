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

### Native tab regression

`optional-chrome/tests/browser_tabs.py` is an opt-in browser test using Python's standard library. It connects to a running Marionette server on localhost:2828 and refuses privileged work unless the profile is exactly `/tmp/zen-firefox-test-profile`. Stage the generated `standalone/userChrome.css` as that profile's `chrome/userChrome.css`, enable `toolkit.legacyUserProfileCustomizations.stylesheets`, and launch **that disposable profile only** with `-no-remote -profile /tmp/zen-firefox-test-profile -marionette --remote-allow-system-access`. On macOS the test uses Command shortcuts; a headless launch is supported.

```sh
python3 optional-chrome/tests/browser_tabs.py
```

The runner creates and closes its own window, restores the Boolean preferences it changes, and leaves the original window open. It loads the current feature scripts explicitly after browser startup; no application loader is installed. Sixty distinct local pages exercise native selection, folder operations, Favorite serialization, close/undo, priority drops, both split directions, cancellation, page clicks, scrolling, compact modes, Clear protections, last-tab handling, reload and uninstall. The report is `docs/validation/tab-functional.json` and includes exact source hashes. Only the fixture exposes private drag setup callbacks; production scripts have no test API. Controlled drag events exercise real DOM drop handlers and native Firefox setup, but do not certify physical OS drag release, overflow autoscroll, sleep or AutoConfig cold startup.

With the same isolated browser running, `python3 optional-chrome/tests/browser_groups.py` checks expanded/collapsed vertical and horizontal group styling, native collapse clicks, selected children, theme colors, horizontal order/keyboard/wheel behavior, repeated orientation changes and CSS-only use. It installs local temporary light/dark test themes in the disposable profile, restores the original theme before removing them, restores preferences, and closes its own window. Its measurements go to `docs/validation/tab-groups-orientations.json`; fixture screenshots go to `/tmp/zenfx-verified-groups-*.png`. This is a macOS/headless check; physical OS drag release and other platforms remain unverified.

Installer tests include managed updates from the old entry format, preserved custom CSS/settings/application files, no-op/preview behavior, rollback/retry, and original uninstall restoration after an update. All targets are temporary filesystem fixtures. To test an update manually, use the latest extracted package, a closed disposable Firefox 158 profile, and `--update --dry-run` before making changes. No normal browsing profile or real application bundle is needed for the automated checks.
