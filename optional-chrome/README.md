# Optional browser scripts

These are privileged Firefox 158 interface scripts, not normal WebExtensions. A compatible loader must evaluate them once in each browser window after delayed browser startup. Copying `.uc.js` files into `chrome` alone does not run them.

| Script | Behavior |
| --- | --- |
| `zenfx-newtab-overlay.uc.js` | New Tab opens the real address/search field over the current live webpage, including Split View. Opening/repeating/Escape does not create tabs; submitting opens a tab. Tab switching cancels the overlay. Ordinary address editing remains native. |
| `zenfx-drag-to-split.uc.js` | Drag one ordinary unpinned tab onto the left/right half of the current page to create native Split View. Copy, modified, multi-tab, cross-window, and existing-split gestures remain outside this hook. |
| `zenfx-tab-hierarchy.uc.js` | Adds Favorites icon tiles, full-width Pinned tabs, protected folders, and unlabeled ordinary tabs. A **↓ Clear** divider closes ordinary tabs; New Tab sits immediately below it. Right-click → Tab priority to change sections. Favorites use native pinning and saved session metadata; the cleanup add-on protects them as pinned tabs. |
| `zenfx-compact-toggle.uc.js` | Adds the Compact Mode toolbar button and editable shortcut. Measures the real top-toolbar height so the shared compact sidebar inset follows bookmarks, theme sizing, and density changes. Its default replaces Firefox's localized sidebar-toggle shortcut (Control+Z on tested macOS). Choosing another shortcut, No shortcut, or uninstall restores native handling. |

Right-click the Compact Mode button or use **Tools → ZenFX shortcut settings…** to change its binding. Choose **Use default → Save** to use the sidebar shortcut if you previously customized it.

## Persistence

The [guided setup](../START-HERE.md) offers a profile-scoped AutoConfig loader when both a profile and Firefox application are explicitly selected. It adds two application files, preserves conflicting AutoConfig setups by refusing installation, and backs up changed profile files. Application updates may remove the loader.

The scripts and actual new-window loading were browser-tested in an isolated profile. **Application AutoConfig loading after a full quit/relaunch is unverified.** No application files were modified during development. These scripts use Firefox private APIs and need review after browser updates. Standard signed extensions cannot load them.

## Removal

Remove the scripts from your chosen loader and restart, or use the [installer's restore flow](../START-HERE.md#restore--uninstall). To unload them temporarily from the current browser window, their browser-chrome APIs are `window.ZenfxNewTabOverlay.uninstall()`, `window.ZenfxDragToSplit.uninstall()`, `window.ZenfxCompactToggle.uninstall()`, and `window.ZenfxTabHierarchy.uninstall()`. Do not run these expressions in an ordinary webpage console.

See the [validation report](../docs/VALIDATION.md) for tested behavior and remaining limits. The appearance CSS works independently; tab cleanup is a [separate add-on](../companion/README.md).

The Compact Mode settings dialog also has separate **Hide top toolbar** and **Hide sidebar** controls. **Reveal both bars together** keeps the default shared hover area; turn it off for independent edge reveals. CSS-only users can set `zenfx.compact.independent-reveal` to `true` for independent reveals.
