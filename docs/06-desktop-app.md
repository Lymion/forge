# 06 — A real desktop app: installer, Start menu, updates

FORGE is installed like any Windows program and never runs in a browser tab. The user changes
the app often (by asking Sonnet to edit it), so getting a change into the installed app must be
one command, and the installed app must pick it up by itself.

## It must feel native

- Its own window with a custom title bar (drag region, minimise / maximise / close), app icon in
  the taskbar and Alt+Tab, correct name "FORGE" in Task Manager and in Windows' "Apps" list.
- `app.setAppUserModelId('com.forge.app')` so the taskbar groups it and notifications carry its name.
- **Single instance** (`app.requestSingleInstanceLock()`): launching it again focuses the open window.
- Remembers window size, position, maximised state and which monitor, per `config.json`.
- No browser chrome and no browser behaviour: no address bar, no page zoom on Ctrl+scroll, no
  text-selection of UI labels, no context menu except the app's own, no drag-and-drop navigating
  the window away, `Ctrl+R`/`F5` do not reload in production builds, external links open in the
  system browser.
- Shows a window within about a second: paint the dark background immediately
  (`backgroundColor`), reveal on `ready-to-show`.
- Closing the window quits the app (after stopping running `claude` processes and terminals; if a
  build is running, ask first). No tray icon in v1.
- Native notifications when a long build finishes or pauses while the window is not focused.
- Jump list (right-click the taskbar icon): the five most recent projects.

## Installer (setup wizard)

Built with **electron-builder**, target **NSIS**, assisted mode (a real wizard, not one-click):

```jsonc
// electron-builder config (in package.json "build" or electron-builder.yml)
{
  "appId": "com.forge.app",
  "productName": "FORGE",
  "directories": { "output": "release" },
  "win": { "target": "nsis", "icon": "build/icon.ico" },
  "nsis": {
    "oneClick": false,
    "perMachine": false,                       // installs for the current user; no admin prompt
    "allowToChangeInstallationDirectory": true,
    "createStartMenuShortcut": true,
    "createDesktopShortcut": true,             // a checkbox on the wizard's last page
    "shortcutName": "FORGE",
    "runAfterFinish": true,
    "deleteAppDataOnUninstall": false,         // keep projects list, settings, usage history
    "installerIcon": "build/icon.ico",
    "uninstallerIcon": "build/icon.ico",
    "uninstallDisplayName": "FORGE"
  },
  "asarUnpack": ["**/node_modules/@lydell/node-pty*/**"],
  "extraResources": [{ "from": "resources", "to": "resources" }]
}
```

Confirm each option name against the electron-builder version installed; do not ship an option
the installed version rejects.

What the user gets:

- `release/FORGE-Setup-<version>.exe`. Running it shows: welcome → choose folder → install →
  finish (with "Launch FORGE" and "Create desktop shortcut" ticked).
- A **Start menu** entry "FORGE" (searchable from the Start menu), an optional desktop shortcut,
  and an entry in Settings → Apps with a working **Uninstall**.
- Uninstall removes the program files and shortcuts and leaves user data in place; the
  uninstaller offers a checkbox "Also remove my FORGE settings and history".
- The installer is **not code-signed** (signing needs a paid certificate). On first run Windows
  SmartScreen shows "Windows protected your PC"; the user clicks More info → Run anyway. Say this
  in the README. Do not attempt to bypass or suppress SmartScreen.

Icon: `build/icon.ico` containing 16, 24, 32, 48, 64, 128 and 256px sizes, generated from one
`build/icon.svg` (a simple mark in the accent amber on the app's dark background). Check it is
legible at 16px in the taskbar.

Things that break only in the installed build (test each on the installed app, not `npm run dev`):
the node-pty native module (must be unpacked from asar), the webview preload path, the Whisper
worker and its model cache path, the bundled `resources/forge-skills` path
(`process.resourcesPath`), and finding the `claude` executable when launched from the Start menu
(the PATH there can differ from a terminal's: resolve it at startup and show a clear screen with
the fix if it is missing).

## Updates

Two requirements: releasing a change is one command, and the installed app updates itself.

### Releasing (what the user, or Sonnet, runs)

```bash
npm run release
```

`scripts/release.mjs` does, in order, stopping on the first failure:

1. Refuse to run if `git status` shows uncommitted changes (print them).
2. `npm run typecheck` and `npm test`.
3. Bump the version in `package.json` (`patch` by default; `npm run release -- minor|major`).
4. Prepend a `CHANGELOG.md` entry: version, date, and the commit subjects since the last tag.
5. `npm run build`, then electron-builder → `release/FORGE-Setup-<version>.exe` plus the update
   metadata file electron-builder writes beside it (`latest.yml`: version, file name, sha512).
6. Commit `package.json` + `CHANGELOG.md` as `release: v<version>`, tag `v<version>`.
7. Publish to the update channel (below). Print the version and where it went.

### How the installed app finds an update

Use **electron-updater**. The channel is chosen in `config.json` → `update.channel`:

| Channel | What it is | When to use |
|---|---|---|
| `local` (default) | A folder on this machine, `update.localDir` (default: the repo's `release/` folder). `npm run release` leaves the files there; nothing is uploaded. | One machine, no hosting, no accounts. This is the user's situation. |
| `github` | GitHub Releases of a repository the user names. `npm run release` uploads with `gh release create`. | The user later wants the app on a second machine. Needs a **public** repo, or a private one plus a token on each machine; never bundle a token in the app. |

`local` channel mechanics (electron-updater's built-in providers expect a URL; verify whether
the installed version accepts a `file://` generic URL, and if it does not, implement this small
custom check instead of fighting it):

1. Read `<localDir>/latest.yml`. If its `version` is greater than `app.getVersion()` (semver
   compare), an update is available.
2. Verify the installer's sha512 against `latest.yml`. If it does not match, report the error and do nothing.
3. Copy the installer to `userData/updates/` (so the build folder can be cleaned safely).
4. Tell the user (below). On their go-ahead, or on quit, run the installer with `/S`
   (silent) and `--force-run`, then quit; the installer relaunches the app.

### What the user sees

- The app checks on launch and every 30 minutes, and immediately when `latest.yml` changes
  (watch the file on the `local` channel). So after `npm run release` finishes, a running FORGE
  notices within a couple of seconds.
- One quiet item appears at the right of the status line: `update 0.4.2 ready · restart`.
  Clicking it shows the changelog entry and **Restart and update**. If the user ignores it, the
  update installs the next time the app quits.
- Never restart by itself while a turn, a build, or a terminal command is running. If one is,
  the button reads "Update when this finishes".
- After updating, the first launch shows a single line in the status area for 10 seconds:
  `updated to 0.4.2`, clickable to open the changelog.
- Settings → About: current version, channel, "Check now", last check time, and the changelog.
- A failed update never leaves the app unusable: the old version stays installed until the new
  installer has finished; on any error the app keeps running and shows what went wrong.

### Data safety across updates

- Everything the user owns lives in `userData` (`%APPDATA%/FORGE`) or in project folders,
  never in the install folder. Updates and reinstalls do not touch it.
- `config.json`, `projects.json` and `skill-templates.json` carry a `schemaVersion`. On launch,
  run migrations in order from the stored version to the current one; before migrating, copy the
  file to `userData/backups/<name>.<oldVersion>.json`. A file from a **newer** version (after a
  downgrade) is opened read-only with a notice rather than rewritten.
- Unit-test every migration with a fixture of the previous shape.

## Developing versus installed

- `npm run dev` runs from source with hot reload, uses a **separate** data folder
  (`%APPDATA%/FORGE-dev`) and a different window title ("FORGE dev") and AppUserModelId, so the
  dev copy and the installed copy can run side by side and never share or corrupt each other's data.
- The dev copy never checks for updates.
