# ZenFX appearance only

Contains only CSS and these instructions. No extensions, installer, startup loader, or executable browser scripts.

## Install

1. In Firefox, open `about:support` and click **Profile Folder → Open Folder / Show in Finder**. Quit Firefox completely.
2. Back up any existing `chrome/userChrome.css`. Copy this package's `chrome/userChrome.css` into that profile's `chrome` folder. Create the folder if necessary. Use it as the replacement stylesheet, rather than combining it with another full browser theme.
3. Open Firefox. In `about:config`, set the Boolean preference `toolkit.legacyUserProfileCustomizations.stylesheets` to `true`. Enable Firefox's native **Vertical Tabs** in its sidebar settings.
4. Quit and reopen Firefox.

**Resize the sidebar:** with the expanded sidebar visible and sidebar Compact Mode off, drag its right-hand edge. Firefox controls the chosen width; the collapsed icon rail stays 52px.

**Move the window:** the supplied sidebar window-drag rules are included for empty sidebar space, with exclusions for tabs, folder headers, buttons, links, inputs, split-tab pairs, and resize handles.

Includes Zen-like sidebar/tab and folder-group styling, rounded page frame and optional compact-mode CSS. The address bar stays in Firefox’s toolbar, including when focused. Firefox add-on themes supply the colors and header images; the CSS no longer forces a fixed palette over them. Firefox paints the sidebar’s native frame colors and images itself. Outline folder icons follow their native tab-group colors, while names use Firefox’s frame text color. Webpage content is not restyled.

Optional: in `about:config`, create Boolean preferences `zenfx.compact.top` and/or `zenfx.compact.sidebar`. `true` enables edge-reveal hiding; `false` keeps the toolbar/sidebar visible. With both enabled, either edge reveals the top bar and sidebar together. Both stay visible while either has hover/focus or a native menu is open, and hide together after you leave. The sidebar keeps a stable inset below the top bar. This CSS-only package has no custom toggle button, keyboard shortcut, or shortcut editor; its toolbar-height fallback uses the supplied toolbar/bookmarks height variables.

**Side-by-side pages:** right-click a tab → **Add Split View**, then choose the other tab. You can also select two tabs with Command-click and right-click → **Open in Split View**. Native split pairs have two equal-width headers in one row in the expanded sidebar, without a divider between the headers. Long titles truncate within their own half. Firefox creates and manages the actual page panes.

The Favorites / Pinned tabs / Today tabs hierarchy requires the separate `zenfx-tab-hierarchy.uc.js` script and updated loader; this CSS-only package cannot save Favorite status, provide its priority menu, or provide a working Clear tabs control.

Firefox's native groups remain available. Automatic tab cleanup and page-drop drag-to-split require separate code and are not in this package. New Tab uses Firefox’s normal behavior; the former floating New Tab override has been removed.

Tested on desktop Firefox 158/macOS. Windows/Linux styling is experimental; mobile Firefox and other Firefox versions are not verified.

To remove: quit Firefox, restore the original stylesheet or remove this `userChrome.css`, and reopen. Native Vertical Tabs can be changed independently in Firefox's settings.
