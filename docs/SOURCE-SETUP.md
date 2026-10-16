# Install from source with Python

This runs the readable setup source through your installed Python. No ZenFX app signing, Apple Developer account, Tk, or downloaded `.command` launcher is required. It does not change macOS security settings or clear quarantine attributes. It is not an Apple-notarized installer, and it does not guarantee that every macOS policy will permit execution.

## Quick Mac setup: copy once

Requires an installed **Python 3.10+**. Open **Terminal**, paste this entire block, and press Return. It downloads the setup archive from this repository, checks its SHA-256 checksum, extracts it into a temporary folder, and starts the guided installer. You do not need to find the downloaded installer or type its path.

```sh
(
  set -eu
  command -v python3 >/dev/null || { echo "Install Python from https://www.python.org/downloads/ first."; exit 1; }
  python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else "Python 3.10+ is required.")'
  zenfx_setup_dir=$(mktemp -d "${TMPDIR:-/tmp}/zenfx-setup.XXXXXX")
  trap 'rm -rf "$zenfx_setup_dir"' EXIT
  zenfx_downloads="https://raw.githubusercontent.com/ajshaw0327-sketch/zenfx-firefox/main/dist"
  curl --fail --location --silent --show-error "$zenfx_downloads/ZenFX-Setup.zip" -o "$zenfx_setup_dir/ZenFX-Setup.zip"
  curl --fail --location --silent --show-error "$zenfx_downloads/SHA256SUMS.txt" -o "$zenfx_setup_dir/SHA256SUMS.txt"
  awk '$2 == "ZenFX-Setup.zip" { print }' "$zenfx_setup_dir/SHA256SUMS.txt" > "$zenfx_setup_dir/setup.sha256"
  test -s "$zenfx_setup_dir/setup.sha256"
  (cd "$zenfx_setup_dir" && shasum -a 256 -c setup.sha256)
  ditto -xk "$zenfx_setup_dir/ZenFX-Setup.zip" "$zenfx_setup_dir/extracted"
  python3 "$zenfx_setup_dir/extracted/ZenFX/installer/install.py" --guided
)
```

The checksum checks download integrity against this repository’s checksum file; it is not Apple signing or independent verification. Setup still shows the proposed file changes and asks before writing. Downloaded temporary files are removed when setup exits; installed files and profile backups stay.

Choose **1** for appearance, **2** for the full feature set, or **4 — Update existing ZenFX** if already installed. When asked for the profile, open `about:support` in Firefox → **Profile Folder → Show in Finder**, then drag that folder into Terminal. Full setup also asks for Firefox.app; updates need only the profile. Quit Firefox when prompted, review the changes, and type `yes`. Updates keep settings and custom CSS, without uninstalling or changing application files. [Update details](UPDATING.md).

## Manual source setup

1. [Download the setup ZIP](https://github.com/ajshaw0327-sketch/zenfx-firefox/raw/refs/heads/main/dist/ZenFX-Setup.zip) and extract it. Open the **ZenFX** folder. You can inspect `installer/install.py` before running it.
2. Use **Python 3.10+**. If needed, get it from [python.org](https://www.python.org/downloads/); Tk is not needed for this method.
3. Open **Terminal**. Type `python3` followed by a space. Drag **installer/install.py** from the extracted ZenFX folder into Terminal, then type a space followed by `--guided`. Press Return.

   The resulting command will look like this; your downloaded folder path may differ:

   ```sh
   python3 "/path/to/ZenFX/installer/install.py" --guided
   ```

4. Choose an option below. In Firefox, enter `about:support`, open **Profile Folder → Show in Finder**, and drag that folder into the wizard when asked. Quit Firefox completely before confirming it is closed.
5. Read the file list. Type `yes` to proceed, or anything else to cancel without writes. Reopen the selected Firefox profile when setup finishes.

On Windows, use `py -3` instead of `python3`. On Linux, use `python3`. Quoted paths and Finder’s escaped drag-and-drop paths are accepted. Setup does not search your profiles, download code, request administrator privileges, or execute pasted paths as commands.

## Choose what to install

| Choice | Result |
| --- | --- |
| **1 — Appearance only (default)** | Installs profile CSS/settings, enables vertical tabs, and backs up replaced files. Firefox.app is not changed. No startup scripts are activated. |
| **2 — Full setup** | Also asks for Firefox.app or its installation folder and installs the optional AutoConfig loader for floating New Tab, drag-to-split, tab priorities/Clear, and Compact controls. |
| **3 — Uninstall / restore** | Restores the profile’s original files using its saved installation record. Edited files are preserved for review; backups and any shared application loader remain. |
| **4 — Update existing ZenFX** | Replaces managed profile files with this package's version, keeping settings, `chrome/zenfx-custom.css`, and original uninstall backups. No application writes. Use the quick command above to get the latest package first. |

**Mac limitation for option 2:** adding the loader changes files inside Firefox.app and can affect its code signature. Running this source wizard instead of the launcher does not resolve that separate issue; signing the installer would not resolve it either. Appearance-only avoids application writes. The application loader’s full quit/relaunch path remains unverified. Standard extensions cannot run these browser-interface scripts.

This build targets desktop **Firefox 158**. macOS styling and the scripts were tested in an isolated profile; Windows/Linux browser behavior remains experimental. Automatic cleanup is separate unsigned extension source and is not installed by this wizard.

## If it stops

- **Python not found:** install Python using the official link above, then open a new Terminal window.
- **Wrong folder:** choose the actual profile shown by `about:support`, not its `chrome` subfolder. For full setup, choose Firefox.app itself on Mac.
- **Already installed:** use **4 — Update existing ZenFX** with the latest package. You do not need to uninstall first. [Update instructions](UPDATING.md).
- **Permission or AutoConfig conflict:** setup stops rather than elevating itself or overwriting an unrelated loader. Use appearance-only if you do not want application writes.

An explicit **“will damage your computer”** warning is different from an unidentified-developer warning. Do not use this procedure to rerun a copy identified as malicious; follow [Apple’s explanation of those alerts](https://support.apple.com/en-us/102445).

[Check the installed features](../START-HERE.md#check-it-worked) · [Full setup and removal details](../START-HERE.md) · [Manual appearance installation](../appearance/README.md)

References: [Mozilla AutoConfig locations](https://support.mozilla.org/en-US/kb/customizing-firefox-using-autoconfig), [Apple code-signature resource seals](https://developer.apple.com/library/archive/technotes/tn2206/).
