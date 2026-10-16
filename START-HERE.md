# ZenFX setup

**Desktop Firefox 158. macOS is browser-tested. Windows/Linux launchers and styles are experimental and have not been browser-tested. Mobile Firefox, older Firefox/ESR, and arbitrary future releases are not supported by this build.**

## Install on another compatible Firefox profile

1. Extract this entire ZIP. Install **Python 3.10 or newer with Tk** if it is not already available. The installer is not a standalone native application.
2. In the target Firefox, open `about:support` and use **Profile Folder → Open Folder / Show in Finder**. Remember that folder, then quit Firefox completely.
3. Double-click **Install.command** on macOS, **Install.cmd** on Windows, or run **Install.sh** on Linux. Choose that **profile folder**, review the changes, and install. The installer does not scan or select your profiles automatically.

Choosing only a profile installs the appearance and enables native vertical tabs. Existing `userChrome.css` is backed up and replaced with the ZenFX entry; existing `user.js` settings are retained with an appended ZenFX block. Firefox must be closed. No network downloads, account access, automatic elevation, or extension-signature changes occur.

For the full New Tab overlay, drag-to-split, Compact Mode controls, and tab hierarchy to load after restart, also select the **Firefox application** in setup. On macOS this is `Firefox.app`; on Windows/Linux it is the directory containing `application.ini`. This optional choice adds **`zenfx.cfg` and `defaults/pref/zenfx-autoconfig.js` to that application**. It enables privileged AutoConfig JavaScript, as required by the supplied startup loader. Only profiles explicitly containing the ZenFX managed marker/scripts load the hooks. An existing AutoConfig setup or conflicting files cause setup to stop rather than overwrite them. An unwritable application folder requires a separately authorized administrator install; this installer does not request elevation. Application updates may remove these files.

The application-level AutoConfig installation has **not** been performed on this machine. The loader's real new-window lifecycle was tested within the authorized test profile; a full application AutoConfig cold-start remains unverified. Setup writes the selected files but does not certify that cold-start path.

## Change the shortcut

**Right-click the Compact Mode button → click the shortcut field → press your combination → Save.**

Alternatively, use the native **Tools → ZenFX shortcut settings…** menu. The default reuses Firefox’s own sidebar-toggle shortcut: **Control+Z** in the tested Firefox 158/macOS build. The script reads Firefox’s localized key definition on other platforms rather than assuming the same combination. While this binding is selected, it toggles Compact Mode instead of native sidebar expansion. Choosing another shortcut, choosing No shortcut, or unloading the hook restores the original sidebar shortcut. Existing custom bindings are preserved; choose **Use default → Save** to switch them to the sidebar binding. A saved shortcut applies immediately and is stored in the selected profile. The editor supports modifier-plus-letter/number/navigation combinations and function keys, checks known Firefox shortcut conflicts, and offers **Use default** and **No shortcut**. Some operating-system shortcuts cannot be intercepted. Escape cancels the dialog. Holding Option uses the physical letter key, so Option-generated symbols do not corrupt the binding.

## Favorites, Pinned tabs, and Today tabs

With the updated CSS and `zenfx-tab-hierarchy.uc.js` loaded, right-click a tab → **Tab priority** → choose **Favorites**, **Pinned tabs**, or **Today tabs**. Favorites are icon tiles; Pinned tabs show their titles; Today tabs are ordinary unpinned tabs/groups. Favorites and Pinned tabs both use Firefox's real pinning, so the cleanup extension protects them. Favorite markers are included in Firefox's saved tab session data. Today tabs follow Firefox's ordinary session settings; there is no automatic midnight wipe.

For an existing managed installation, keep its backups and use the documented uninstall/restore process before installing the updated full package. Do not simply add the fourth script without updating the application loader's script list. Setup backs up and updates an exact, unmodified previous ZenFX loader. It still refuses custom, modified, or unrelated AutoConfig files. Shared loader files remain after uninstall so other opted-in profiles keep working. See [hierarchy details](docs/TAB-HIERARCHY.md).

## What is an extension?

The optional **tab cleanup companion** is a normal Firefox extension. It preserves pinned/grouped tabs and closes ordinary web tabs after 24 hours of inactivity, with additional activity/media protections. Its settings and Undo remain in its own popup. It is not required for the appearance or Compact Mode controls.

`packages/ZenFX-Tab-Cleanup-1.0.0-unsigned.zip` is **unsigned source**. It must receive Mozilla signing before a normal permanent installation. It has not been published or submitted. Temporary loading in `about:debugging` is for testing and disappears at restart. Renaming the ZIP to XPI does not sign it.

A normal extension cannot install `userChrome.css`, replace the native Firefox interface, or run these privileged hooks. The full product therefore uses the explicit setup above, rather than claiming to be a one-click universal XPI. No standard extension was added for Compact Mode and no native messaging service is installed.

## Restore / uninstall

Quit Firefox, rerun setup, select the same profile, and choose **Uninstall / restore originals**. Original profile files are restored from `zenfx-backups`. If a managed file was edited after setup, uninstall stops and preserves it for review. Backups are retained. Settings already loaded into `prefs.js`, including native vertical tabs and saved shortcut preferences, are not erased; reset them in `about:config` if desired.

The two shared application loader files are deliberately retained so removing one profile does not break another opted-in profile. After uninstalling **all** opted-in profiles, remove `zenfx.cfg` and `defaults/pref/zenfx-autoconfig.js` from the selected application to remove the shared loader. They are no-ops for profiles without the marker. Remove the cleanup extension separately.

## Command-line alternative

From the extracted ZenFX folder (paths below are examples, not auto-detected targets):

```text
python3 installer/install.py --profile "/path/to/profile" --closed-confirmed --dry-run
python3 installer/install.py --profile "/path/to/profile" --closed-confirmed
python3 installer/install.py --profile "/path/to/profile" --application "/path/to/Firefox.app" --closed-confirmed
python3 installer/install.py --profile "/path/to/profile" --closed-confirmed --uninstall
```

On Windows, replace `python3` with `py -3`. GUI setup needs Tk; the command-line path does not.

[Full feature and installation notes](README.md) · [What was tested](docs/VALIDATION.md)

References: [Mozilla CSS customization](https://support.mozilla.org/en-US/kb/contributors-guide-firefox-advanced-customization), [Mozilla AutoConfig](https://support.mozilla.org/en-US/kb/customizing-firefox-using-autoconfig), [Mozilla extension signing](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/). The small startup bootstrap follows the documented AutoConfig entry and the public [fx-autoconfig chrome-registration pattern](https://github.com/MrOtherGuy/fx-autoconfig/blob/master/program/config.js); no third-party runtime is downloaded or installed.
