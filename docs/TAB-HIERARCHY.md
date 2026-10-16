# Favorites, Pinned tabs, Today tabs

The hierarchy is provided by `optional-chrome/zenfx-tab-hierarchy.uc.js` and its matching CSS. The startup loader includes this fourth script. Appearance-only installations keep their existing native layout until the hook is loaded.

Right-click an ordinary tab and choose **Tab priority → Favorites / Pinned tabs / Today tabs**. Favorites sit in an icon grid at the top without an oversized heading. Thin dividers separate Pinned tabs and Today tabs; their small labels appear on hover. Empty tiers do not add separators.

| Section | Presentation | Storage and cleanup |
| --- | --- | --- |
| Favorites | Icon tiles first | Native pinned tabs with the `zenfxFavorite` custom session value. Protected from cleanup by native pinning. |
| Pinned tabs | Full-width rows with titles | Native pinned tabs. Protected from cleanup. |
| Today tabs | Ordinary native tabs, groups, and split pairs | Native session settings apply. The optional add-on closes eligible unpinned, ungrouped web tabs after 24 hours of inactivity; grouped tabs remain protected. No midnight or exit-time deletion is introduced. |

Changing a Favorite to Pinned tabs removes only its Favorite marker. Choosing Today tabs unpins it. Firefox's native Unpin command also clears the marker, so later pinning does not unexpectedly restore Favorite status. Native pinning can remove a tab from its group, just as Firefox's own Pin Tab command does. Existing split pairs must be separated before a constituent tab can be promoted, preserving the actual split.

The presentation is informed by [Zen’s public vertical-tab stylesheet](https://github.com/zen-browser/desktop/blob/dev/src/zen/tabs/zen-tabs/vertical-tabs.css): a gap of 4px between Favorite tiles, small rounded corners, subdued separator lines, transparent pinned rows, and a native theme selected fill. No Zen installation was inspected. Favorite columns adapt to both the tab count and sidebar width, up to four columns; two Favorites fill two equal tracks. Normal rows are 36px high, and Favorite rows are 42px. Selected fills use Firefox’s exact native selected-tab color without an additional tint; the bright Nova gradient border is removed while keyboard focus remains visible.

Native tab nodes, indices, and containers are retained. Favorite tabs are kept before other pinned tabs through Firefox's move API so native keyboard order matches the visual order. Within each tier, native ordering is retained. The headings use pseudo-elements and do not appear among native tab children. The collapsed rail hides section headings and uses native icon behavior.

Favorite status is saved in per-tab Firefox SessionStore metadata and was verified through serialization and restoration of a test tab as well as script reload. This is not an independent bookmark database and does not recreate tabs after deliberate closure or guarantee recovery if the saved Firefox session is deleted. Full application AutoConfig cold-start remains unverified; see the main README.

## Validation

A disposable window in the isolated Firefox 158/macOS test profile contained two Favorites, one Pinned document, and one Today page. The [measurement report](validation/tab-hierarchy.json) records two 124px-wide Favorite tracks at a 260px sidebar width, 42px Favorite rows, 36px full-width rows, and Today tabs below both sections. Both custom light and dark theme fixtures matched Firefox’s native frame/sidebar colors and retained their frame images; selected fills adapted without a gradient border, and unselected pinned rows remained transparent. The real tab context menu targeted Today page and its Favorites command promoted that tab. Tests also covered native reorder normalization, native unpin and repin, session restore, collapsed rail, and native split compatibility. The screenshot contains only these fixture tabs; the window was removed after testing.

![Test hierarchy](images/tab-hierarchy.png)
