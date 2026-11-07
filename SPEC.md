# Habit Buddy: Project Spec

A tiny, minimalist desktop habit tracker. It lives as a small animated avatar in the corner of the screen. The user never has to "open an app" to stay on track. It reminds them gently, reacts to progress, and rewards them at the end of the day.

Originally conceived for a friend who isn't feeling his best and needs gentle help remembering to eat, drink water, rest, and so on. The tone throughout should be **warm, soft, and never guilt-inducing.**

## Platforms

- **Windows and macOS** (both required for v1)
- Developed on Windows. The Mac build is produced by GitHub Actions, so the developer doesn't need a Mac.
- Linux is out of scope.

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
- While awake and idle, a very subtle breathing animation and occasional tiny wobble or bounce (every random 20–45 seconds) add life without moving its window or opening messages. Fidgets pause for hover affection, sleep, reactions, dragging/resizing, and reduced motion; they never keep it awake.
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
- Separate `content/random.json` holds jokes, riddles, kindness prompts, and playful thoughts. The first thought waits a random 30–60 minutes; later thoughts wait 75–120 minutes. Thoughts can appear during late-night work too; they wait while the computer has had no input for ten minutes, or while the buddy is busy. Deadlines persist across restarts and midnight. On upgrade, distant old deadlines move closer without postponing an earlier or overdue thought. Pause reminders also pauses these thoughts. Each pool has independent repeat protection, saved across restarts.

### 9. Themes
- A few ready-made palettes plus a custom accent color picker.
- The heat map, progress bars, avatar tint, and buttons all follow the palette (use CSS variables so one change restyles everything).

### 10. Coins, little shop, and wardrobe
- Earn one coin for the first time all current habits are complete each day. Added habits, corrections, repeated reward openings, and restarts never duplicate that daily coin.
- Award five bonus coins at 3-, 10-, and 30-day milestones, once per milestone within each streak. A new streak can earn those bonuses again.
- Award one monthly hello coin on the first visit each calendar month, including the first month. Missed days never remove coins or purchases.
- A bag icon beside the gear opens a separate shop view. Ten original SVG accessories span hats, glasses, scarves/bows, and umbrellas, with prices from 3 to 12 coins.
- Try-on previews do not change the desktop pet. Buying an affordable item saves the purchase and equips it immediately; buying an already owned item never charges again.
- The My buddy tab is a wardrobe: preview and combine one owned item per slot, remove items, then save with Wear this outfit. Outfits work on all three buddies and stay attached through their animations.
- Coins, reward ledgers, owned items, and outfits are stored locally. Purchases and reward credits are saved atomically.

### 11. Install and launch
- Manual app launch for now; launch at login is deferred.
- One-line install per OS, pulling the right build from GitHub Releases:
  - macOS: a `curl ... | sh` script (or Homebrew cask later)
  - Windows: a PowerShell one-liner (or winget later)
- Builds produced by **GitHub Actions** on tagged releases (Windows + macOS artifacts).
- Code signing is out of scope for now. Terminal-based install avoids most Gatekeeper and SmartScreen friction.

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
9. Install scripts and GitHub Actions release builds (manual app launch)

## Out of scope for v1 (future ideas)

- **Voice logging** via hotkey ("I ate 2 oranges"), with local speech-to-text and a small AI step to match the sentence to a habit. This is deferred, and the `logProgress` design keeps it easy to add.
- **Phone notifications** (e.g. via ntfy or Telegram)
- **Smart reminders** that only nudge when behind pace
- **Rough-day mode** and grace days for streaks
- **Friend mode**, where a trusted person sees a summary and can send notes into the mystery box
- Auto-update, code signing, Linux support
- New buddy species as larger collectible rewards

## Tone guide

- Friendly, soft, a little playful. Short messages.
- Celebrate small wins. Never shame.
- Notifications should feel like a friendly nudge, e.g. "Time for some water 💧", not "You missed your goal."
