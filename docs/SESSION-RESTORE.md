# Restore tabs on restart

ZenFX setup and **4 — Update existing ZenFX** enable Firefox's native **Open previous windows and tabs** setting (`browser.startup.page = 3`). Use the [latest setup](UPDATING.md) to apply it to an existing managed installation. It also applies to appearance-only managed installs.

To enable it immediately in a manually customized profile, open **Firefox Settings → General → Startup → Open previous windows and tabs**. The wording/location can vary by Firefox version. Then leave the windows open and use **Firefox → Quit Firefox (⌘Q on Mac)** before reopening. Closing windows individually closes their tabs; quitting with windows open preserves the whole session. [Mozilla's instructions](https://support.mozilla.org/en-US/kb/restore-previous-session).

Ordinary tabs, pinned tabs, Favorites' saved markers, native groups, and native Split View use Firefox's session data. There is no extra session-manager process, duplicate tab database, polling, or eager loading added by this change. Firefox retains its existing lazy-loading behavior.

## Tabs already missing

Check **History → Restore Previous Session**, **Recently Closed Windows**, or **Recently Closed Tabs** before opening and closing more windows. Enabling restoration protects future sessions; it cannot recreate session data Firefox has already discarded. See [Mozilla's recovery guidance](https://support.mozilla.org/en-US/kb/restore-previous-session).

Private windows are not restored. Always-private browsing and clearing browsing history on exit can prevent restoration; check your history settings if tabs still disappear. ZenFX does not change those privacy settings. Tabs deliberately closed with **Clear**, the optional 24-hour cleanup extension, or normal tab/window closing do not count as open tabs to restore automatically.

Updates keep unrelated `user.js` preference lines and add the managed restoration block at the end. Original installation backups remain. If you edited `user.js` after installation, the update also saves a restoration copy with your later edits retained and ZenFX's managed blocks removed for a future uninstall. Browser preferences already loaded into `prefs.js` remain after uninstall, as before.

The session preference is separate from the application script loader. Testing native tab restoration does not certify AutoConfig hook loading after a full restart.
