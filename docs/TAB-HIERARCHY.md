# Favorites, Pinned tabs, Today tabs

The hierarchy is provided by `optional-chrome/zenfx-tab-hierarchy.uc.js` and its matching CSS. The startup loader includes this fourth script. Appearance-only installations keep their existing native layout until the hook is loaded.

Right-click an ordinary tab and choose **Tab priority → Favorites / Pinned tabs / Today tabs**. Favorites sit in an icon grid at the top without an oversized heading. Pinned rows and folders follow the grid without an extra separator. One **↓ Clear** divider separates these protected tabs from **New Tab** and ordinary tabs. There is no Today heading or workspace name.

| Section | Presentation | Storage and cleanup |
| --- | --- | --- |
| Favorites | Icon tiles first | Native pinned tabs with the `zenfxFavorite` custom session value. Protected from cleanup by native pinning. |
| Pinned tabs | Full-width rows with titles | Native pinned tabs. Protected from cleanup. |
| Folders | Native groups above Clear, with group-colored outline icons | Group membership protects tabs from both Clear and automatic cleanup. |
| Today tabs | Unlabeled ordinary native tabs and split pairs below New Tab | Native session settings apply. The optional add-on closes eligible unpinned, ungrouped web tabs after 24 hours of inactivity; grouped tabs remain protected. No midnight or exit-time deletion is introduced. |

Changing a Favorite to Pinned tabs removes only its Favorite marker. Choosing Today tabs unpins it and moves it out of its folder, preserving the other folder members. Firefox's native Unpin command also clears the marker, so later pinning does not unexpectedly restore Favorite status. Native pinning can remove a tab from its group, just as Firefox's own Pin Tab command does. Existing split pairs must be separated before a constituent tab can be promoted, preserving the actual split.

In the expanded vertical sidebar, drag a single tab onto a Favorite tile or pinned row to change its tier and place it there. The insertion edge shows before/after placement: left/right for tiles and top/bottom for rows. Existing Favorites and pins can be reordered or moved between these tiers. This avoids Firefox's uniform pinned-grid animation, which does not match the mixed tile/row layout. Modified/copy/multi-tab/cross-window gestures and the collapsed rail remain native; existing split pairs must be separated first.

The helper attaches drop/hover/cancel handlers only during a tab drag. It caches pin geometry while hovering, invalidates it on size/scroll changes, and removes the marker/handlers after drop, cancellation, source closure, or unload. Native scroll buttons are left available. Eight controlled native-API cases verified insertion, reordering, and tier transitions; split-preview invalidation, cancellation, handler cleanup, and fallback guards were also checked. The fixture does not certify physical OS pointer release or overflow autoscroll. [Results](validation/pinned-drag.json).

The presentation is informed by [Zen’s public vertical-tab stylesheet](https://github.com/zen-browser/desktop/blob/dev/src/zen/tabs/zen-tabs/vertical-tabs.css): a gap of 4px between Favorite tiles, small rounded corners, subdued separator lines, transparent pinned rows, and a native theme selected fill. No Zen installation was inspected. Favorite columns adapt to both the tab count and sidebar width, up to four columns; two Favorites fill two equal tracks. Normal rows are 36px high, and Favorite rows are 42px. Selected fills use Firefox’s exact native selected-tab color without an additional tint; the bright Nova gradient border is removed while keyboard focus remains visible.

Native tab nodes, indices, and containers are retained. In vertical mode, Favorite tabs are kept before other pinned tabs through Firefox's move API so native keyboard order matches the visual order. Within each tier, native ordering is retained. Named shadow slots present native groups above Clear. A dedicated New Tab row follows Clear and calls Firefox's normal New Tab action to create a regular tab. The row reserves its own height even with overflowing tabs. The original native controls remain in place but are hidden while the vertical hierarchy is active. Firefox's periphery stays after ordinary tabs, where native drag calculations expect it. Unloading removes the row and restores native controls and group slots. Horizontal mode retains native pin/group ordering, scrolling and New Tab controls; the helper does not normalize their order or scroll selection there. The collapsed rail hides Clear and shows an icon. Expansion changes also reveal the selected tab after layout settles. Folder glyphs work in all three layouts, including CSS-only installations.

Favorite status is saved in per-tab Firefox SessionStore metadata and was verified through serialization and restoration of a test tab as well as script reload. This is not an independent bookmark database and does not recreate tabs after deliberate closure or guarantee recovery if the saved Firefox session is deleted. Full application AutoConfig cold-start remains unverified; see the main README.

## Clear tabs

Click **↓ Clear** to close all visible, ordinary unpinned and ungrouped tabs in the current window. This includes the selected ordinary tab and both tabs of an ordinary split pair. Favorites, native pinned tabs, every tab inside a group, and hidden tabs are protected. The button is disabled when there is nothing eligible to clear. Native before-unload handling and recently-closed recovery remain active; use Firefox’s **Reopen Closed Tab** to undo. Clearing the final ordinary tabs keeps the window open with a blank tab.

This is a manual action, independent of the optional extension’s 24-hour cleanup policy. It requires the hierarchy script; CSS alone cannot close tabs.

## Validation

The current native regression also uses 60 loaded local pages. It reproduced and fixed a visibility bug when selecting a child of a collapsed folder: native visual selection can finish after the first layout frames, so a final `TabSwitchDone` check reveals the child without changing background-refresh scrolling policy. Repeated folder selection, native pin/unpin, SessionStore metadata, close/undo, priority drops, split/separate, cancellation, page input, compact modes, Clear protections, short-window scrolling and reload/uninstall are covered by the [repeatable functional runner](validation/tab-functional.json). Its drag events are controlled; physical OS drop release remains unverified.

The current layout was measured and captured in a disposable Firefox 158/macOS test window with a Favorite, a folder and child, and two ordinary tabs. At a 240px sidebar width, the Favorite occupies one 42px row, ordinary rows occupy 36px, and the single Clear row is 24px. Two Favorites and a native pinned row also stayed adjacent, with equal tile widths and no blank grid tracks, at 180px, 240px, and 300px sidebar widths. The measured order is Favorite → folder → child → Clear → New Tab → ordinary tabs, with no section-heading pseudo-elements. [Current measurements](validation/clear-layout.json).

An actual pointer click on Clear preserved the Favorite and folder, removed both ordinary tabs, and disabled the empty control. Firefox’s real Reopen Closed Tab command restored both tabs. Additional checks preserved native pinned and hidden tabs, closed an ordinary split pair with aligned headers, kept the window open after clearing its final ordinary tabs, hid Clear in the collapsed rail, avoided duplicate controls on reload, and restored slots on unload.

Earlier hierarchy checks covered native reorder normalization, context-menu commands, native unpin/repin, Favorite session serialization/restoration, and responsive Favorite columns; [that report](validation/tab-hierarchy.json) records the previous separator design. Current theme checks compared four themes and 24 folder-color/state combinations against native Firefox colors. The screenshot contains only fixture tabs, and each test window was removed afterward.

![Current test hierarchy](images/tab-hierarchy.png)
