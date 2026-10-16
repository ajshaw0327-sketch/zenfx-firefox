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

The floating-search tests simulate focus/power events and frame scheduling to cover draft recovery, cancellation races, background-window focus, and handler cleanup. They complement the isolated native-window checks; they do not put the operating system to sleep.
