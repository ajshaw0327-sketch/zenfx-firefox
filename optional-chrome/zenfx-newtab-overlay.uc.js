// Retired ZenFX New Tab overlay: compatibility cleanup for existing loaders.
// Keep this filename so managed updates replace the old hook without app edits.
// Native New Tab and URL submission are no longer intercepted.
(() => {
  "use strict";
  window.ZenfxNewTabOverlay?.uninstall();
})();
