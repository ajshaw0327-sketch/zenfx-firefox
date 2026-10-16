# Performance

ZenFX keeps native tabs and Split View rather than embedding a second browser interface. The interface hooks have no recurring polling timer or continuous animation loop. CSS uses short interactions and opaque overlays without background blur. Optional cleanup remains a separate event-page extension with a five-minute alarm.

## Optimizations

- **Tab hierarchy:** notifications share one refresh per display frame; each refresh takes one tab snapshot and checks each pin’s saved Favorite status once. Folder discovery is reused. Sidebar resizing uses the observed width and cached Favorite count instead of rescanning all tabs. Native reordering waits until a drag finishes. Frame callbacks are canceled when the hook unloads.
- **Drag-to-split:** drag-over events still validate each drop, but the preview is repainted only when the pointer enters a different half of the page.
- **Compact Mode:** the measured toolbar-height value is written only when it changes.
- **Cleanup:** Firefox filters out title/favicon/loading updates before delivering the extension’s listener. Existing session activity state avoids tab queries and storage rewrites when the event page resumes. Protected and internal/private tabs skip unnecessary timestamp reads. Relevant pin/group/hide/navigation events and activity tracking remain active.

All requested interface features remain available. Closing rules and the five-minute cleanup interval are unchanged.

## Isolated Firefox 158 results

The fixture used 100 tabs, including 16 pins and eight Favorites. Counters were added only to temporary test copies of the hooks; production packages do not contain these counters.

| Controlled workload | Before | Optimized |
| --- | ---: | ---: |
| Favorite checks across 100 explicit hierarchy refreshes | 14,200 | 1,600 |
| Refreshes for 100 TabMove notifications across microtasks | 100 | 1 |
| Preview paint passes for 200 drag-over events across two halves | 200 | 2 |
| Hierarchy refreshes during 1.5 seconds idle | 0 | 0 |

The notification burst and drag-over events are synthetic, controlled tests. They demonstrate reduced work, not the frequency of those events in normal browsing. Both versions already produced zero observed attribute mutations in the unchanged-state refresh fixture; the optimization does not claim a reduction there. The recorded synchronous timings are single samples affected by warmup and browser activity, so operation counts are the stronger comparison.

[Measured counters](validation/performance.json) · [Feature regression checks](validation/performance-regression.json)

A disposable test extension also checked the real Firefox event API: 21 title updates reached an unfiltered reference listener, zero reached the production property-filtered listener, and both pin/unpin events were retained. [Native filter results](validation/cleanup-filter.json). The reference listener existed only in the test extension.

Automated checks cover skipped protected-tab timestamp reads, activity-state reuse across event-page resumes, and retained close/recovery protections. The browser regression check covers Compact Mode settings, independent reveals, search mode/submission, folders, 104-tab scrolling, deferred drag reordering, both native split-drop directions, and script errors.

## What these results do not establish

No controlled battery-discharge test, energy-use comparison, or total retained-RAM comparison has been completed. Source/archive sizes are not RAM measurements. No percentage battery saving or negligible-overhead guarantee is claimed. The small new caches hold counts, widths, and an activity map; they do not retain extra webpage/browser instances or create another process.

Split View displays two real pages. Favorites, pins, and folders do not automatically unload their pages. The optional cleanup extension can close eligible ordinary tabs, but that benefit depends on which pages would otherwise remain open.

The installer exits after setup and is not a background service. These runtime optimizations do not resolve the separate Mac application-loader/signature limitation or certify AutoConfig cold-start persistence.

[Mozilla: event-page lifetime and filtering](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Background_scripts) · [Mozilla: tab-update property filters](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/onUpdated) · [Firefox power profiling](https://firefox-source-docs.mozilla.org/performance/power_profiling_overview.html)
