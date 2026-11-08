# Deskling: Project Spec

The public app and repository name is Deskling. Keep the original `habit-buddy` data directory, `habit-buddy.json` save file, and `com.habitbuddy.desktop` OS identifier so existing users retain their buddy and progress across the rename. Smoke tests always use isolated temporary profiles.

A tiny, minimalist desktop habit tracker. It lives as a small animated avatar in the corner of the screen. The user never has to "open an app" to stay on track. It reminds them gently, reacts to progress, and rewards them at the end of the day.

Originally conceived for a friend who isn't feeling his best and needs gentle help remembering to eat, drink water, rest, and so on. The tone throughout should be **warm, soft, and never guilt-inducing.**

## Platforms

- **Windows and macOS** are the primary v1 targets; Linux x64 builds are experimental and require X11/XWayland.
- Developed and tested locally on Windows. macOS Apple Silicon/Intel and Linux builds run on native GitHub Actions runners and still need real-machine installation checks before claiming support.

## Tech stack

- **Electron**, plain HTML/CSS/JS or a light framework (keep it small)
- All data stored **locally** (JSON file in the app's user-data directory). No accounts, no server, no network calls.
- Must work fully offline.
- No voice and no AI/API calls in v1 (see "Future" below).

## Core principles

1. **Minimal.** It should never feel like a to-do list sitting in your face.
2. **Zero setup friction.** Installs easily and opens as a normal desktop app.
3. **No presets.** The user creates every habit themselves. The first launch is an empty state.
4. **One-tap logging.** No typing needed to log progress.
5. **Gentle by design.** No red, no "you failed" messaging, and a missed day never feels punishing.
6. **Private.** Habit data never leaves the machine.

## Features (v1)

### 1. Floating avatar
- A small, transparent, frameless, always-on-top window, no taskbar or dock presence.
- Default position: **bottom-left** of the primary display, placed using the screen's *work area* so it sits above the Windows taskbar or macOS dock.
- Draggable to any position, with the position remembered.
- A fresh install starts at the largest size (160). Once resized, the user's chosen size is saved across launches. Earned presents temporarily grow by 20% (up to 192), then restore the saved size when the reward is closed.
- Click to open or close the popup window.
- Tray icon (Windows system tray and macOS menu bar) with: Open, Pause reminders, Launch at login (toggle), Quit.

### 2. Avatars
- Choices: **pineapple, star, plant** (more can be added later).
- A one-time welcome starts as a small egg. Clicking makes it wobble and crack, reveals the buddy, and opens a dedicated naming view. A saved name completes the welcome; closing early lets the user resume later. Existing habits and history stay intact. Names can be changed in settings.
- Hover briefly to pet the buddy, including while the habit menu is open; double-click for a random boop, cuddle, or wiggle. Single-click continues to open habits. Hover affection waits during celebrations or rewards. These interactions never log progress. The habit menu shows the buddy's name and is placed above, below, or beside the buddy without covering it.
- While awake and idle, the eyes make a tiny, smooth glance toward a nearby cursor, easing back to centre outside a small radius. Gaze pauses for sleep, reactions, dragging, resizing, presents, and reduced-motion preferences. It never counts as user activity or resets the nap timer.
- Opening the app or returning from sleep/unlock gives the first daily welcome after 5 AM, once per day across restarts. The buddy wakes, does a short happy dance across part of the desktop, returns to its spot, then shares a randomized hello. Later first visits use time-appropriate wording. After an hour asleep or locked, it gives a random desktop dance, small bounce, or wiggle and a welcome-back message. Greetings mix simple hellos with playful questions and stay visible for eight seconds. Questions are conversational prompts, with no reply form. Quick unlocks stay quiet. Morning welcomes take priority, and overlapping resume/unlock events never duplicate greetings. Welcome bubbles wait for an open menu or celebration to finish, never steal focus, and respect reduced motion. The initial hatch counts as the first hello.
- Drawn as **SVG animated with CSS**, original artwork with no external licensing.
- All avatars share one **face rig** (eyes, mouth, cheeks) so each reaction is built once and works on every avatar.
- Intermediate habit completions earn a tiny automatic treat once per habit per day. Immediately after confetti or rolling, the buddy munches for five seconds with a soft glow and a randomized thank-you bubble, then the menu returns. Several completions merge into one slightly bigger snack. The last habit clears waiting treats and uses the daily present instead. No feeding controls or care meter are needed.
- Treats shuffle through 124 foods with small food emoji and 60 playful reactions, including food-specific wording. Each food and reaction appears once per shuffle cycle during a session, with no immediate repeats between cycles. The editable catalog lives in `content/treats.json`.
- The plant avatar may optionally have growth stages tied to daily progress (seed, sprout, sapling, tree, tree with fruit).

### 3. Avatar reactions
| State | Trigger |
|---|---|
| Idle | Slow blinks, occasional glance around |
| Smile | Progress logged |
| Halfway encouragement | First reaching halfway through a habit that day; rotate short phrases such as “Keep it going!” and “Way to go!” without repeating the previous phrase |
| Laugh + confetti | A habit completed |
| Wink | Streak milestone |
| Sleepy | Computer inactivity for 45 minutes during 6 AM–10 PM, or 10 minutes overnight |
| Mystery box | All habits done for the day |

### 4. Popup window
- The buddy stays awake while the computer is actively used, including work in other apps. It naps after 45 minutes of computer inactivity during 6 AM–10 PM, or 10 minutes during 10 PM–6 AM, using local time without any working-hours setup. Using the computer or interacting directly with the buddy wakes it. Reminders and random thoughts briefly wake its expression, then let it resume its nap without inventing user activity. The timer starts fresh on launch and does not change habit data.
- While awake and idle, the buddy continuously floats a few pixels, drifts side to side, and softly sways. Its grounded shadow gently changes with the float. Occasional small wobbles or bounces (every random 12–24 seconds) add variety without moving its window, changing its saved size, or opening messages. Fidgets pause for hover affection, sleep, reactions, dragging/resizing, and reduced motion; idle floating pauses during dragging/resizing and stops for sleep or reactions. Motion never keeps it awake.
- Small and calm. Shows today's habits, today's progress, the streak, and the heat map.
- A gear icon for settings (palette, avatar choice, reminders), hidden by default.

### 5. Habits
- **Empty state on first launch:** a friendly message and one big "Add your first habit" button.
- Creating a habit: name, type, goal, optional reminder times.
- Habit types:
  - **Count / progress bar** (e.g. water: 3 of 8 bottles), with a +1 button
  - **Checkbox** (e.g. eat 2 oranges, or meditate yes/no)
  - **Minutes** (e.g. meditate 15 min)
  - **Percent**
- Add, edit, and remove habits at any time.
- Removing a habit keeps its past history in the heat map.

### 6. Reminders
- Gentle speech bubbles from the floating buddy, with cute wording and occasional emoji. They do not open the habit menu or steal focus.
- Keep bubble text clear of the pet and visible habit menu, including at the largest pet/present sizes and near monitor edges. Use a short eight-pixel triangle aimed toward the mouth with a visible gap from the pet. Choose a nearby position by the distance to the mouth; the triangle must not cross the menu. Reposition when the menu resizes; wrap into a narrower bubble or shorten the menu into a scrolling view when needed to keep speech nearby. Brief reactions dismiss after three seconds, daytime thoughts get 6–12 seconds based on text length, and wake-up greetings get eight seconds. Leave room for the tail and shadow.
- Per habit, either at fixed times (e.g. 11:00) or repeating (e.g. every 2 hours between set hours).
- Global "Pause reminders" option.
- Never notify for a habit that is already complete for the day.
- Show one bubble at a time. Queue simultaneous reminders locally, preserve pending reminders across restarts, and discard stale or no-longer-relevant reminders.

### 7. Streak and heat map
- GitHub-style contribution heat map, themed by the palette.
- Intensity is based on the **fraction of habits completed that day**: any progress gives a light shade, and all habits gives the darkest.
- Current streak and best streak shown. A day counts toward the streak if the user completed all habits.
- Be forgiving: wording should be encouraging, and a broken streak should never be displayed harshly.

### 8. Mystery box
- When all habits are complete, the avatar transforms into a gift/mystery box.
- Finish the final habit without reopening the habit menu. A golden, gently bouncing present invites a click. Opening it shows a dedicated reward view with no habits or settings competing for attention.
- Each earned box opens once, with the claim remembered across restarts. The present stays while the reward is open; closing the reward brings the chosen buddy back as a desktop pet.
- After closing a reward, the buddy shares a randomized morning, afternoon, evening, or sleepy-night message based on the computer's local time, avoiding the previous message.
- Adding a new habit after opening a box allows another box once all current habits, including the new one, are complete. Editing, correcting, or removing an already rewarded habit does not reopen a claimed box.
- A new day starts fresh: completing that day's habits can earn a new box.
- Reward content lives in `content/mystery.json`: quotes, motivation, and encouraging end-of-day notes, bundled offline.
- Don't repeat the same content type two days in a row, and avoid repeating the same item until the pool is exhausted.
- Separate `content/random.json` holds only jokes. The first thought waits a random 30–60 minutes; later thoughts wait 75–120 minutes. Thoughts can appear during late-night work too; they wait while the computer has had no input for ten minutes, or while the buddy is busy. Deadlines persist across restarts and midnight. On upgrade, distant old deadlines move closer without postponing an earlier or overdue thought. Pause reminders also pauses these thoughts. Each pool has independent repeat protection, saved across restarts.
- Jokes and riddles with a separate answer first show their question with three softly animated thinking dots. After three seconds, the answer replaces the question with a laughing emoji and remains readable for 6–12 seconds. Other thoughts keep their normal presentation. Reduced motion keeps the dots still. Opening the menu, moving the buddy, suspending the computer, or replacing the bubble cancels any pending punchline.

### 9. Themes
- A few ready-made palettes plus a custom accent color picker.
- The heat map, progress bars, avatar tint, and buttons all follow the palette (use CSS variables so one change restyles everything).

### 10. Coins, little shop, and wardrobe
- Earn one coin for the first time all current habits are complete each day. Added habits, corrections, repeated reward openings, and restarts never duplicate that daily coin.
- Streak bonuses: +1 at 3 completed days, +2 at 5, +4 at 10, +15 at 30, +30 at 50, then +50 at 100, 150, 200, and every 50 completed days thereafter. Each milestone pays once per streak. A new streak can earn those bonuses again.
- Monthly hello coins are retired. Preserve all existing balances and purchases; migrate reward receipts to the current tier amounts and remove retired monthly receipts. Upgrading marks already reached milestones without issuing backpay. Reward calculation, validation, receipts, and next-milestone displays share the same current tier table.
- One missed day freezes the streak automatically, without adding a completed day or coins. Two consecutive missed days reset it. A single gentle bubble explains a grace day when the user is next active and the buddy is available; never interrupt another bubble or reopen a menu.
- Streak Repair costs 6 coins and restores the most recently broken streak within seven calendar days of the break, including after logging new progress. Limit purchases to once per local calendar month based on the purchase date, persisted across restarts. Unused repairs do not carry over; a new month never extends an expired seven-day window. Show “Used this month” and the next month's first date in the shop. Automatic grace days remain available. Repair is an immediate purchase with an explicit count/price preview, not an inventory item. It never fills the heatmap, rewards missed days, or issues backdated milestone bonuses when joining streaks. Purchases save atomically.
- The present and shop explain today's credits separately, with the total earned and current balance. Dated receipts persist without re-crediting older rewards. The shop shows the next milestone and completed days remaining.
- Returning focus to the app never opens the habit menu. A delayed return after a celebration or treat only restores it if the user has not resumed computer activity.
- A bag icon beside the gear opens a separate shop view. Treasures sort by increasing price, with All, Accessories and Streak care filters. Owned treasures remain visible with a Yours label, including the nerdy round glasses; they also appear in the wardrobe.
- Pricing tiers: simple accessories at 2–3 coins; Streak Repair at 6; berry beret at 7; detailed accessories at 15–20; special keepsakes at 50; a moonlight crown at 100 with a pearl circlet, crescent, swaying star charms, twinkles and a soft aura. Bonnets have soft shapes, ruffles and ribbon ties. Existing owners keep repriced items without any charge. Respect reduced motion.
- Little companions are retired: remove the category and garden from the shop, wardrobe, and desktop rendering while retaining old ownership and outfit data so existing profiles still load.
- Explain daily rewards in plain sentences on separate lines, e.g. “You earned 2 coins today. 1 coin for completing all your habits. 1 coin as a bonus for your 3-day streak.” Never display retired bonus amounts or monthly bonuses.
- Try-on previews do not change the desktop pet. Buying an affordable item saves the purchase and equips it immediately; buying an already owned item never charges again.
- The My buddy tab is a wardrobe: preview and combine one owned item per slot (hat, glasses, neck, umbrella), remove items, then save with Wear this outfit. Outfits work on all three buddies and stay attached through their animations.
- Coins, reward ledgers, owned items, and outfits are stored locally. Purchases and reward credits are saved atomically.

### 11. Install and launch
- Manual app launch for now; launch at login is deferred.
- The Windows installer has Run Deskling checked by default on its final page, opening the buddy when the user clicks Finish.
- Quit directly through the buddy's right-click menu or the Quit Deskling button in Settings, as well as the tray menu. Use recognizable Deskling artwork for the Windows tray icon; exiting must not depend on the tray being visible.
- Build a per-user Windows x64 NSIS installer, macOS DMG/ZIP for Apple Silicon and Intel, and Linux x64 AppImage/tarball. `npm run dist:win`, `dist:mac`, and `dist:linux` build on their native OS and produce SHA-256 manifests in `dist/`.
- Generate platform icons from the original SVG with `npm run icons`. Keep personal data, screenshots, tests, and development dependencies out of the packaged app.
- GitHub Actions builds and checks all four variants on manual dispatch or matching version tags, and uploads downloadable artifacts. Publishing a GitHub Release is a separate manual step; one-line remote installers and public download links wait for tested published release assets.
- Beta builds are unsigned on Windows and ad-hoc signed on macOS without notarization. Signing and notarization remain public-launch work; terminal scripts do not bypass platform trust requirements.
- Linux currently requires X11/XWayland for window placement and cursor tracking. Validate tray support and Chromium sandbox prerequisites on target distributions. Native Wayland support is deferred.
- Packaged smoke checks use disposable profiles and writable temporary capture directories. Preserve the original data folder through installs and upgrades; the Windows uninstaller retains saved data. See `RELEASING.md` for build and verification steps.
- Installed Windows builds quietly check published stable GitHub Releases after thirty seconds and every twelve hours, with manual checking in Settings. A small gear badge announces an available update. Users explicitly choose Download update and Update and restart, or Later. Downloads are verified, position is saved before installation, and ordinary quit never installs an update. Offline and unpublished-release states stay within Settings. Development runs and other platforms do not contact the update feed.

## Architecture notes

- **Single entry point for logging:** every way of recording progress calls one function, `logProgress(habitId, amount)`. Buttons call it now, and voice or anything else can call it later. Avatar reactions, confetti, streak updates, and the mystery-box check all hang off this function.
- Keep **state, storage, and UI separate** (a small store module with load/save, plus pure functions for streak and heat-map calculations that are easy to test).
- Day boundary: define "today" using local time. Consider letting the day roll over at a configurable hour (e.g. 4 AM) so late-night logging counts toward the right day.
- Reminder scheduling lives in the main process and should survive restarts.

## Suggested build order

1. Electron scaffold: transparent floating avatar window plus popup window, tray icon
2. Data store and `logProgress`
3. Add-habit flow and habit list with the four habit types
4. Avatar SVGs, face rig, and reactions
5. Heat map, streak, and theming
6. Reminders (buddy speech bubbles)
7. Mystery box and content pool
8. Coin shop and mix-and-match wardrobe
9. Platform installers, checksums, and GitHub Actions build artifacts (manual app launch and release publication)

## Out of scope for v1 (future ideas)

- **Voice logging** via hotkey ("I ate 2 oranges"), with local speech-to-text and a small AI step to match the sentence to a habit. This is deferred, and the `logProgress` design keeps it easy to add.
- **Phone notifications** (e.g. via ntfy or Telegram)
- **Smart reminders** that only nudge when behind pace
- **Rough-day mode** and grace days for streaks
- **Friend mode**, where a trusted person sees a summary and can send notes into the mystery box
- macOS/Linux auto-update, code signing/notarization, native Wayland support, and additional Linux architectures
- New buddy species as larger collectible rewards

## Tone guide

- Friendly, soft, a little playful. Short messages.
- Celebrate small wins. Never shame.
- Notifications should feel like a friendly nudge, e.g. "Time for some water 💧", not "You missed your goal."
