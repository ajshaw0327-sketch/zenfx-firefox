# Validation and limits

The browser target is Firefox 158.0 on macOS. Browser checks were performed only in a disposable test profile. Normal browsing profiles and the Zen installation were not used. This record describes targeted checks, not a guarantee for every Firefox version, theme, platform, or extension.

## Browser checks

- Native vertical tabs, groups, pinned tabs, collapsed rail, split panes, and native menus were exercised.
- The Favorites/Pinned/Today hierarchy was checked in a disposable window: three priority tiers, a responsive Favorite grid, compact full-width rows, native/visual ordering after reordering, a real tab context menu and its priority command, native unpin clearing the Favorite marker, serialized-and-restored Favorite session data, script reload, the 52px collapsed rail, and preservation of native split alignment. See [the hierarchy report](TAB-HIERARCHY.md) and [fixture measurements](validation/tab-hierarchy.json).
- The revised layout has one Clear divider, New Tab directly below it, and no Today heading. A real Clear click preserved the Favorite/folder and closed ordinary tabs; native undo restored them. Additional cases protected native pins/hidden tabs, closed an ordinary split pair, retained the last-tab window, and verified collapsed/reload/unload behavior. See [current measurements](validation/clear-layout.json).
- Trusted pointer dragging resized the expanded sidebar from 173px to 263px to 203px. Collapse used the 52px rail; re-expansion retained the native width. The original width was restored.
- The sidebar container, launcher, frame image, selected-tab background, and selected text were compared directly against native styling in four theme cases: built-in default, custom light, custom dark, and an image theme omitting sidebar colors. All matched; the selected tab keeps the Zen-style border treatment but uses the exact native fill. The custom layout was temporarily gated off in the fixture to obtain the native baseline.
- Folder icons were checked in 24 combinations of theme, blue/red/green group palette, and open/closed state. Each opaque icon matched its native group color, each name matched native sidebar text, and changing blue to purple updated the icon immediately. A faint theme-ink edge supports visibility; forced-colors mode uses CanvasText. See [theme details](THEMES.md) and [measurements](validation/native-theme-colors.json).
- Native split pairs retained equal, horizontally aligned headers and actual side-by-side page panes. Header divider borders have zero width with 173px and 280px sidebars, for active and inactive splits, with and without the hierarchy script (eight cases). See [measurements](validation/split-borders.json). The selected-tab outline remained visible.
- Empty-sidebar window-drag rules and interactive-element exclusions matched parsed chrome CSS rules. Physical macOS window movement was not certified by that check.
- Floating New Tab search was tested with real keyboard/button input: opening/canceling retained the current page and tab count, submission created a tab, and tab switching canceled the overlay. Native search/address handling was retained.
- Drag-to-split used native tab dragging and native split panes. Completing native drag cleanup before grouping prevents a retained tab translation from misaligning the headers.
- The floating Compact Mode toolbar inherited the native frame background in four themes. A sampled toolbar region remained pixel-identical when its fixture page changed from white to black; theme background colors and images matched the window body. See [measurements](validation/opaque-toolbar.json) and [fixture preview](images/opaque-toolbar.png).
- Compact Mode was checked across toolbar/sidebar visibility combinations. Real Control+Z presses toggled both flags without collapsing the native sidebar. Recording, saving, conflict rejection, reset, no-shortcut, reload, and uninstall behavior were checked. Selecting a different binding restored native Control+Z behavior.
- The startup loader was exercised in an existing window and through a new-window startup event. **Loading through application AutoConfig after a full quit/relaunch remains unverified.**
- Cleanup checks with disposable, artificially aged local test tabs closed the eligible ordinary tab and preserved pinned, grouped, selected, and recent tabs. Undo reopened the closed test page. A real unattended 24-hour run and all crash/event races remain unverified.

Temporary themes/tabs were removed and user settings restored after focused checks. Browser evidence containing local paths or browsing details is not distributed. The included split-header preview contains only two disposable local fixture tabs.

## Automated checks

The repository includes 14 cleanup policy/recovery tests and 13 installer tests. Installer cases use temporary filesystem fixtures and cover backup/restore, explicit closed-browser confirmation, previews without writes, conflicts, version checking, symlink rejection, edited-file preservation, shared loader retention, write-failure rollback, an exact previous-loader upgrade with backup, and rejection of a modified loader.

See [DEVELOPMENT.md](DEVELOPMENT.md) to run these checks and rebuild downloads. No real profile or application installation occurs during the automated tests.
