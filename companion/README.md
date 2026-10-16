# Optional tab cleanup add-on

This is a **standard Firefox WebExtension**, separate from the CSS theme and the privileged New Tab hook. It implements the chosen rule: protect pinned and grouped tabs; close ordinary HTTP/HTTPS tabs after 24 hours of inactivity.

## Policy

- Favorites created by the hierarchy hook are real pinned tabs and are protected. Other pinned tabs and all native Firefox group members are protected, including collapsed groups. Group titles styled as folders remain real groups.
- Hidden tabs, active/highlighted tabs, private tabs, audible/capturing tabs, loading tabs, file/internal pages, and tabs whose group status cannot be established are additionally protected.
- Activity means tab activation or navigation, plus the time a tab leaves the active state. Reading an active tab cannot cause it to close. Protected tabs are also refreshed during checks. Removing a pin/group starts a fresh activity period when Firefox emits the corresponding update.
- Existing tabs receive a full 24-hour grace period on first installation. Activity timestamps use Firefox's per-tab session storage; native restored-tab timestamps do not override a saved activity timestamp.
- Checks run approximately every five minutes **while Firefox is running**. They resume when Firefox runs again. The threshold uses the computer's clock; changing that clock can change when a tab becomes eligible. Browser scheduling can delay checks.
- Pause and preview are available from the toolbar popup. There is no remote control, website injection, website-content access, or network request.
- Immediately before removal the add-on re-reads native pin/group/selection status. Removal requires a successful recovery backup first. Browser APIs cannot make the final check and removal a single atomic operation.

## Undo and data

The popup restores the last automatic close through Firefox's native recently closed session when available, otherwise by opening the saved URL. **Unsaved forms, in-page application state, expired sessions and login state cannot be guaranteed.** Up to 200 local recovery entries contain title, URL and closing time. Interrupted closes are reconciled with existing tabs before recovery. No data is sent anywhere.

Permissions: `tabs` reads tab metadata; `sessions` stores activity and accesses native recovery; `storage` retains settings/recovery and the last active tab per window; `alarms` schedules checks. No host permissions, private-window access, or privileged browser-chrome permission is requested.

## Install and signing status

The supplied `packages/ZenFX-Tab-Cleanup-1.0.1-unsigned.zip` in the main package is an **unsigned source package**, not a permanently installable stable-Firefox add-on. It has not been submitted to Mozilla or published. Stable Firefox requires Mozilla signing for permanent installation. Signing an unlisted self-distributed add-on is a separate Mozilla account step; this project has not accessed an account or bypassed signature checks.

For temporary testing in the **test profile only**, open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select this folder's `manifest.json`. This installation is removed when Firefox restarts. Do not install it in another profile without deciding to enable the stated close policy there.

For permanent distribution, submit the unsigned ZIP for unlisted signing, then install the returned **signed XPI** using Firefox's Add-ons Manager. Do not rename an unsigned ZIP to XPI and assume it is signed. Remove/pause the add-on independently of the CSS theme.

References: [Mozilla signing overview](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/), [temporary installation](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/).

## Validation

20 automated policy, recovery, event-page, and popup tests pass. Live Firefox 158 testing used disposable localhost tabs with test-only aged session timestamps: the stale ordinary tab closed; pinned, grouped, selected and recent tabs stayed; Undo restored the closed page. The production popup was rendered and inspected with both toolbars hidden. A real 24-hour unattended run, crash/restart recovery and every possible browser-event race have not been certified. Test-only fixtures and age injection are not shipped in the add-on package.
