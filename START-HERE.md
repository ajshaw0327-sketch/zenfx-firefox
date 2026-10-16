# ZenFX setup

**Already installed? [Update without uninstalling](docs/UPDATING.md).** Run the latest setup and choose **4 — Update existing ZenFX**. It keeps settings, custom CSS, and original restore backups.

**Desktop Firefox 158. macOS is browser-tested. Windows/Linux launchers and styles are experimental and have not been browser-tested. Mobile Firefox, older Firefox/ESR, and arbitrary future releases are not supported by this build.**

**Easiest on Mac: [Copy the quick setup command](docs/SOURCE-SETUP.md#quick-mac-setup-copy-once).** It downloads the package, checks the checksum, and starts setup. Python 3.10+ is required; no Tk, app signing, or downloaded launcher is needed.

## Before you start

- **Want only the look?** [Download appearance only](https://github.com/ajshaw0327-sketch/zenfx-firefox/raw/refs/heads/main/dist/ZenFX-Appearance.zip) and follow its [four copy-and-restart steps](appearance/README.md). Python is not needed.
- **Want the tab features and Compact controls?** [Download full setup](https://github.com/ajshaw0327-sketch/zenfx-firefox/raw/refs/heads/main/dist/ZenFX-Setup.zip), extract the whole ZIP, and use the steps below. No Git or build step is needed.
- Full setup needs **Python 3.10+**. Launchers use the text wizard by default. The optional graphical installer (`--gui`) additionally needs Tk; [guided source setup](docs/SOURCE-SETUP.md) does not. If Python is missing, use the [official Python downloads](https://www.python.org/downloads/). The official macOS and Windows Python distributions include Tk; Linux users may need their distribution’s Tk package. [Python’s Tk documentation](https://docs.python.org/3/library/tkinter.html) explains how to check it.

## Install

1. In the Firefox you want to customize, enter `about:support` in the address bar. Click **Profile Folder → Open Folder / Show in Finder**. Keep that folder open so you can select it in setup, then **quit Firefox completely**.
2. Open the extracted **ZenFX** folder. Use the launcher for your operating system:

   | System | Open | Firefox application field |
   | --- | --- | --- |
   | macOS | [Quick setup command](docs/SOURCE-SETUP.md#quick-mac-setup-copy-once) (no Tk); `Install.command` is an alternative unsigned text-wizard launcher | Select `Firefox.app`, usually in Applications |
   | Windows | Double-click **Install.cmd** | Select the Firefox installation folder containing `application.ini` |
   | Linux | Run **Install.sh** from a terminal with `sh Install.sh` | Select the Firefox installation folder containing `application.ini` |

3. In the text wizard, choose **1** for appearance or **2** for full setup and paste/drag the profile folder from step 1. If using the optional graphical installer, choose it in **Firefox profile folder**. For floating New Tab search, drag-to-split, Favorites, Clear, and Compact controls, also choose the **Firefox application**. In the graphical installer, leaving that field blank installs only the appearance.
4. Confirm Firefox is completely closed, inspect the listed files, and type `yes` to proceed. In the optional graphical installer, check **Firefox is completely closed** and click **Review and install**. Setup backs up the files it replaces.
5. Reopen that Firefox profile, then check the controls below.

## Check it worked

| Check | Expected result |
| --- | --- |
| Appearance | Vertical sidebar, rounded page frame, and folder-style native groups; drag the expanded sidebar’s edge to resize |
| Floating New Tab | The normal New Tab command opens search over the current page; Escape cancels, and submitting creates a tab |
| Tab hierarchy | Right-click a tab → **Tab priority** → Favorites / Pinned tabs / Today tabs; **↓ Clear** sits above New Tab |
| Compact controls | Right-click the Compact Mode button, or use **Tools → ZenFX shortcut settings…**, to choose hidden bars and record a shortcut |
| Drag to split | Drag an ordinary tab onto the left or right side of the current page; dropping creates native Split View |
| Tab restoration | Quit Firefox with windows still open, then reopen it; previous regular tabs return. On Mac use ⌘Q. |

The last four checks need the optional scripts. If only the appearance changes, follow the troubleshooting table below. The AutoConfig loader’s full quit/relaunch path remains unverified; these checks let you confirm it on your installation.

## If something is missing

| Problem | What to do |
| --- | --- |
| Setup will not open / Python or Tk is missing | Use [guided source setup](docs/SOURCE-SETUP.md), which needs Python but no Tk. Do not run the launcher from inside the ZIP. |
| A launcher is not executable | From the extracted ZenFX folder, use `python3 installer/install.py --guided` on Mac/Linux or `py -3 installer/install.py --guided` on Windows. |
| Firefox looks unchanged | Recheck the exact profile in `about:support`. In `about:config`, confirm `toolkit.legacyUserProfileCustomizations.stylesheets` is `true`, then fully quit and reopen Firefox. Enable native Vertical Tabs in the sidebar settings if needed. |
| Appearance works, but the scripts are missing | Confirm setup included the Firefox application. [Update managed profile files](docs/UPDATING.md) with option 4. If the application loader is missing or outdated, restore/uninstall the managed profile and explicitly repeat full setup with the application selected. Copying scripts into the profile alone does not run them. See the startup limitation below. |
| Setup says another AutoConfig exists | Keep that configuration. This installer refuses conflicts; use appearance only or integrate the scripts with your existing compatible loader. |
| Setup cannot write the application folder | Appearance-only setup does not need application writes. The optional loader needs a writable application or a separately authorized administrator installation; setup does not elevate itself. |
| Cleanup is not running | It is a separate unsigned extension source package, not part of automatic setup. See [cleanup installation limits](#what-is-an-extension). |

## What setup changes

Choosing only a profile installs the appearance and enables native vertical tabs. Existing `userChrome.css` is backed up and replaced with the ZenFX entry; existing `user.js` settings are retained with an appended ZenFX block. Firefox must be closed. The installer itself performs no network downloads, account access, automatic elevation, or extension-signature changes. The quick Mac command downloads the archive and checksum before starting it.

Setup and updates also enable native **Open previous windows and tabs** through `browser.startup.page = 3`. Updates append this setting without removing unrelated preferences. [Session restoration, private-window limits, and recovering missing tabs](docs/SESSION-RESTORE.md).

For the full New Tab overlay, drag-to-split, Compact Mode controls, and tab hierarchy to load after restart, also select the **Firefox application** in setup. On macOS this is `Firefox.app`; on Windows/Linux it is the directory containing `application.ini`. This optional choice adds **`zenfx.cfg` and `defaults/pref/zenfx-autoconfig.js` to that application**. It enables privileged AutoConfig JavaScript, as required by the supplied startup loader. Only profiles explicitly containing the ZenFX managed marker/scripts load the hooks. An existing AutoConfig setup or conflicting files cause setup to stop rather than overwrite them. An unwritable application folder requires a separately authorized administrator install; this installer does not request elevation. Application updates may remove these files. On macOS, these application writes can affect Firefox’s code signature; appearance-only avoids them.

The application-level AutoConfig installation has **not** been performed on this machine. The loader's real new-window lifecycle was tested within the authorized test profile; a full application AutoConfig cold-start remains unverified. Setup writes the selected files but does not certify that cold-start path.

## Change visibility or the shortcut

Right-click the Compact Mode button to choose **Hide the top toolbar**, **Hide the sidebar**, and **Reveal both bars together**. Turn off the last option for independent edge reveals, then click **Save**.


**Right-click the Compact Mode button → click the shortcut field → press your combination → Save.**

Alternatively, use the native **Tools → ZenFX shortcut settings…** menu. The default reuses Firefox’s own sidebar-toggle shortcut: **Control+Z** in the tested Firefox 158/macOS build. The script reads Firefox’s localized key definition on other platforms rather than assuming the same combination. While this binding is selected, it toggles Compact Mode instead of native sidebar expansion. Choosing another shortcut, choosing No shortcut, or unloading the hook restores the original sidebar shortcut. Existing custom bindings are preserved; choose **Use default → Save** to switch them to the sidebar binding. A saved shortcut applies immediately and is stored in the selected profile. The editor supports modifier-plus-letter/number/navigation combinations and function keys, checks known Firefox shortcut conflicts, and offers **Use default** and **No shortcut**. Some operating-system shortcuts cannot be intercepted. Escape cancels the dialog. Holding Option uses the physical letter key, so Option-generated symbols do not corrupt the binding.

## Favorites, Pinned tabs, and Today tabs

With the updated CSS and `zenfx-tab-hierarchy.uc.js` loaded, right-click a tab → **Tab priority** → choose **Favorites**, **Pinned tabs**, or **Today tabs**. Favorites are icon tiles; Pinned tabs show their titles; Today tabs are ordinary unpinned, ungrouped tabs, shown without a heading. Folders stay above the **↓ Clear** divider. **New Tab** sits directly below it; Clear closes visible ordinary tabs and preserves Favorites, pins, folders, and hidden tabs. Firefox’s **Reopen Closed Tab** can undo the closure. Favorites and Pinned tabs both use Firefox's real pinning, so the cleanup extension protects them. Favorite markers are included in Firefox's saved tab session data. Today tabs restore with the previous session; there is no automatic midnight wipe.

For an existing managed installation, use **4 — Update existing ZenFX** to replace the profile's managed stylesheet/scripts while keeping settings and custom CSS. No uninstall is needed for normal updates. An old application loader missing the fourth script needs a separate full-setup repair: restore/uninstall the managed profile, then explicitly repeat full setup with the application selected. Setup backs up and upgrades an exact, unmodified previous ZenFX loader; it refuses custom, modified, or unrelated AutoConfig files. Shared loader files remain after uninstall so other opted-in profiles keep working. See [update instructions](docs/UPDATING.md) and [hierarchy details](docs/TAB-HIERARCHY.md).

## What is an extension?

The optional **tab cleanup companion** is a normal Firefox extension. It preserves pinned/grouped tabs and closes ordinary web tabs after 24 hours of inactivity, with additional activity/media protections. Its settings and Undo remain in its own popup. It is not required for the appearance or Compact Mode controls.

`packages/ZenFX-Tab-Cleanup-1.0.3-unsigned.zip` is **unsigned source**. It must receive Mozilla signing before a normal permanent installation. It has not been published or submitted. Temporary loading in `about:debugging` is for testing and disappears at restart. Renaming the ZIP to XPI does not sign it.

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
python3 installer/install.py --profile "/path/to/profile" --update --closed-confirmed
python3 installer/install.py --profile "/path/to/profile" --closed-confirmed --uninstall
```

On Windows, replace `python3` with `py -3`. Only the optional `--gui` mode needs Tk; default and `--guided` modes do not. For prompts instead of path flags, run `python3 installer/install.py --guided` from the extracted ZenFX folder.

[Full feature and installation notes](README.md) · [What was tested](docs/VALIDATION.md)

References: [Mozilla CSS customization](https://support.mozilla.org/en-US/kb/contributors-guide-firefox-advanced-customization), [Mozilla AutoConfig](https://support.mozilla.org/en-US/kb/customizing-firefox-using-autoconfig), [Mozilla extension signing](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/). The small startup bootstrap follows the documented AutoConfig entry and the public [fx-autoconfig chrome-registration pattern](https://github.com/MrOtherGuy/fx-autoconfig/blob/master/program/config.js); no third-party runtime is downloaded or installed.
