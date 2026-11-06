# Habit Buddy

A small, gentle desktop companion for Windows and macOS. This scaffold implements **steps 1 and 2** of [SPEC.md](SPEC.md): the desktop shell and local data layer.

## Try it

Requires Node.js 22.12 or newer and npm.

```sh
npm install
npm start
```

- Look for the little green buddy above the taskbar or dock at the bottom-left of your primary screen.
- Click it to open or close the popup. Drag it to move; its position survives a restart.
- The default buddy size is 68. Hover over the buddy to reveal small grips at the top and bottom; drag either grip vertically to resize. Drag its face to move it. Size is remembered when you release. Double-click a grip to return to 68 (saved custom sizes survive updates). The grips also support arrow keys when focused, and Home resets the size.
- Your buddy blinks every few seconds and occasionally winks. It respects your system's reduced-motion preference.
- Press Escape, click the ×, or click elsewhere to dismiss the popup.
- The tray/menu bar icon offers Open, Pause reminders, and Quit. Windows may place the icon in the tray overflow menu.
- Pause reminders saves a preference for the future scheduler. Launch at login is marked as coming in step 8.

The first launch contains **no habits**. Habit creation and the interactive habit list are step 3. This build uses a placeholder buddy with idle blinks and winks; avatar choices, progress reactions, reminders, rewards, and release packaging come later.

## Local data

The main process owns `habit-buddy.json` in Electron's user-data directory (normally `%APPDATA%/habit-buddy/` on Windows or `~/Library/Application Support/habit-buddy/` on macOS). The app makes no network requests and uses no accounts. Setup downloads Electron once; the Electron CLI may finish downloading its runtime on the first start. After that, normal use works offline.

Writes go through a temporary file and rename before in-memory state changes. Invalid existing data stops startup with its path in the error, so it is never silently replaced. Back up the JSON file before manually editing it, and quit the app first.

`src/store.js` is independent of Electron. It provides `snapshot()`, `updateSettings()`, data-layer `addHabit()` / `archiveHabit()`, and the sole progress entry point `logProgress(habitId, amount)`. Amount is a positive increment, capped at the habit's goal; checkbox goals are 1. The result includes the saved state and completion flags for later reactions. Daily entries snapshot habit names/types/goals so archived habits retain history. Days use local calendar time; the default rollover is midnight, with `dayStartHour` reserved for a future setting.

The sandboxed renderers access the store through a narrow preload/IPC bridge. Future logging buttons can call `window.buddy.logProgress(habitId, amount)`; state changes are broadcast only after a successful save.

## Checks

```sh
npm test
npm run check
```

An optional desktop smoke test opens both Electron windows, checks the preload/IPC connection and tray image, then quits. Quit an existing Habit Buddy instance first. It uses an isolated temporary user-data directory.

```sh
npm run smoke
```
