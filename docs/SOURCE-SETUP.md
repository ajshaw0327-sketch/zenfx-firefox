# Install from source with Python

This runs the readable setup source through your installed Python. No ZenFX app signing, Apple Developer account, Tk, or downloaded `.command` launcher is required. It does not change macOS security settings or clear quarantine attributes. It is not an Apple-notarized installer, and it does not guarantee that every macOS policy will permit execution.

## Start the guided setup

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

**Mac limitation for option 2:** adding the loader changes files inside Firefox.app and can affect its code signature. Running this source wizard instead of the launcher does not resolve that separate issue; signing the installer would not resolve it either. Appearance-only avoids application writes. The application loader’s full quit/relaunch path remains unverified. Standard extensions cannot run these browser-interface scripts.

This build targets desktop **Firefox 158**. macOS styling and the scripts were tested in an isolated profile; Windows/Linux browser behavior remains experimental. Automatic cleanup is separate unsigned extension source and is not installed by this wizard.

## If it stops

- **Python not found:** install Python using the official link above, then open a new Terminal window.
- **Wrong folder:** choose the actual profile shown by `about:support`, not its `chrome` subfolder. For full setup, choose Firefox.app itself on Mac.
- **Already installed:** use option 3 to restore originals before reinstalling. Backups remain available.
- **Permission or AutoConfig conflict:** setup stops rather than elevating itself or overwriting an unrelated loader. Use appearance-only if you do not want application writes.

An explicit **“will damage your computer”** warning is different from an unidentified-developer warning. Do not use this procedure to rerun a copy identified as malicious; follow [Apple’s explanation of those alerts](https://support.apple.com/en-us/102445).

[Check the installed features](../START-HERE.md#check-it-worked) · [Full setup and removal details](../START-HERE.md) · [Manual appearance installation](../appearance/README.md)

References: [Mozilla AutoConfig locations](https://support.mozilla.org/en-US/kb/customizing-firefox-using-autoconfig), [Apple code-signature resource seals](https://developer.apple.com/library/archive/technotes/tn2206/).
