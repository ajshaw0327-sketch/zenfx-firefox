# Optional browser scripts

These are privileged Firefox 158 interface scripts, not normal WebExtensions. A compatible loader must evaluate them once in each browser window after delayed browser startup. Copying `.uc.js` files into `chrome` alone does not run them.

| Script | Behavior |
| --- | --- |
| `zenfx-drag-to-split.uc.js` | Drag another ordinary unpinned tab onto the left/right half of the current page to create native Split View. No modifier key is required. Copy, modified, multi-tab, cross-window, and existing-split gestures remain outside this hook; an ineligible drag clears any previous split highlight. |
| `zenfx-tab-hierarchy.uc.js` | Adds Favorites icon tiles, full-width Pinned tabs, protected folders, and unlabeled ordinary tabs. Drag a single tab onto a tile/row to change its priority and position, or right-click → Tab priority. A **↓ Clear** divider closes ordinary tabs; New Tab sits immediately below it. Favorites use native pinning and saved session metadata; the cleanup add-on protects them as pinned tabs. |
| `zenfx-compact-toggle.uc.js` | Adds the Compact Mode toolbar button and editable shortcut. Measures the real top-toolbar height so the shared compact sidebar inset follows bookmarks, theme sizing, and density changes. Its default replaces Firefox's localized sidebar-toggle shortcut (Control+Z on tested macOS). Choosing another shortcut, No shortcut, or uninstall restores native handling. |

Right-click the Compact Mode button or use **Tools → ZenFX shortcut settings…** to change its binding. Choose **Use default → Save** to use the sidebar shortcut if you previously customized it.

New Tab uses Firefox’s normal command and creates a regular tab. The floating New Tab feature has been removed. `zenfx-newtab-overlay.uc.js` is now a tiny compatibility cleanup file: older loaders can still reference it, but it only unloads an already-running old hook and adds no listeners or command wrappers. Managed updates replace the previous hook with this file without changing application files.

Vertical tabs keep Firefox’s native asynchronous scrolling; [comparison with Zen’s public implementation](../docs/ZEN-SCROLLING.md). Background tab-list refreshes preserve manual scroll position; native tab selection and sidebar expansion still reveal the selected tab. Canceled priority drags and Split View previews release their temporary state on the next pointer gesture or window deactivation, including when a dragend was missed. No polling is added.

## Persistence

The [guided setup](../START-HERE.md) offers a profile-scoped AutoConfig loader when both a profile and Firefox application are explicitly selected. It adds two application files, preserves conflicting AutoConfig setups by refusing installation, and backs up changed profile files. Application updates may remove the loader.

The scripts and actual new-window loading were browser-tested in an isolated profile. **Application AutoConfig loading after a full quit/relaunch is unverified.** No application files were modified during development. These scripts use Firefox private APIs and need review after browser updates. Standard signed extensions cannot load them.

## Removal

Remove the scripts from your chosen loader and restart, or use the [installer's restore flow](../START-HERE.md#restore--uninstall). To unload them temporarily from the current browser window, their browser-chrome APIs are `window.ZenfxDragToSplit.uninstall()`, `window.ZenfxCompactToggle.uninstall()`, and `window.ZenfxTabHierarchy.uninstall()`. Do not run these expressions in an ordinary webpage console.

See the [validation report](../docs/VALIDATION.md) for tested behavior and remaining limits. The appearance CSS works independently; tab cleanup is a [separate add-on](../companion/README.md).

The Compact Mode settings dialog also has separate **Hide top toolbar** and **Hide sidebar** controls. **Reveal both bars together** keeps the default shared hover area; turn it off for independent edge reveals. CSS-only users can set `zenfx.compact.independent-reveal` to `true` for independent reveals.
