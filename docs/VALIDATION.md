# Validation and limits

The browser target is Firefox 158.0 on macOS. Browser checks were performed only in a disposable test profile. Normal browsing profiles and the Zen installation were not used. This record describes targeted checks, not a guarantee for every Firefox version, theme, platform, or extension.

## Browser checks

- Native vertical tabs, groups, pinned tabs, collapsed rail, split panes, and native menus were exercised.
- Trusted pointer dragging resized the expanded sidebar from 173px to 263px to 203px. Collapse used the 52px rail; re-expansion retained the native width. The original width was restored.
- Two temporary custom themes verified native toolbar images and light/dark sidebar/search colors. Folder icons were checked in 12 combinations of theme, open/closed state, and normal/matching/missing group tint; the minimum measured icon contrast in these fixtures was 7.60:1.
- Native split pairs retained equal, horizontally aligned headers and actual side-by-side page panes. Header dividers were transparent with 173px and 280px sidebars, for active and inactive splits. The selected-tab outline remained visible.
- Empty-sidebar window-drag rules and interactive-element exclusions matched parsed chrome CSS rules. Physical macOS window movement was not certified by that check.
- Floating New Tab search was tested with real keyboard/button input: opening/canceling retained the current page and tab count, submission created a tab, and tab switching canceled the overlay. Native search/address handling was retained.
- Drag-to-split used native tab dragging and native split panes. Completing native drag cleanup before grouping prevents a retained tab translation from misaligning the headers.
- Compact Mode was checked across toolbar/sidebar visibility combinations. Real Control+Z presses toggled both flags without collapsing the native sidebar. Recording, saving, conflict rejection, reset, no-shortcut, reload, and uninstall behavior were checked. Selecting a different binding restored native Control+Z behavior.
- The startup loader was exercised in an existing window and through a new-window startup event. **Loading through application AutoConfig after a full quit/relaunch remains unverified.**
- Cleanup checks with disposable, artificially aged local test tabs closed the eligible ordinary tab and preserved pinned, grouped, selected, and recent tabs. Undo reopened the closed test page. A real unattended 24-hour run and all crash/event races remain unverified.

Temporary themes/tabs were removed and user settings restored after focused checks. Browser evidence containing local paths or browsing details is not distributed. The included split-header preview contains only two disposable local fixture tabs.

## Automated checks

The repository includes 14 cleanup policy/recovery tests and 11 installer tests. Installer cases use temporary filesystem fixtures and cover backup/restore, explicit closed-browser confirmation, previews without writes, conflicts, version checking, symlink rejection, edited-file preservation, shared loader retention, and write-failure rollback.

See [DEVELOPMENT.md](DEVELOPMENT.md) to run these checks and rebuild downloads. No real profile or application installation occurs during the automated tests.
