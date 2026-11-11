# Building and sharing Deskling

The first builds are for beta testing. Windows is built and checked locally; the GitHub Actions workflow builds Windows, Apple Silicon macOS, Intel macOS, and Linux x64 on their own operating systems. Test on real target machines before advertising support.

## Build

Use Node.js 22.12 or newer, then run `npm ci`.

| Build host | Command | Files in `dist/` |
| --- | --- | --- |
| Windows x64 | `npm run dist:win` | `.exe` installer |
| Apple Silicon Mac | `npm run dist:mac` | arm64 `.dmg` and `.zip` |
| Intel Mac | `npm run dist:mac` | x64 `.dmg` and `.zip` |
| Linux x64 | `npm run dist:linux` | `.AppImage` and `.tar.gz` |

`npm run pack` creates an unpacked app for the current platform. `npm run smoke:packaged` launches the built app with a disposable profile and checks startup, content, shop, outfits, and persistence. On headless Linux, use `xvfb-run -a npm run smoke:packaged`. Pass an installed executable directly with `npm run smoke:packaged -- "path/to/Deskling.exe"` to check an installation.

Intel macOS GitHub Actions smoke runs use Electron's software compositor because the hosted runner cannot initialize EGL for screenshot capture. The same UI and capture assertions still run. Local app launches and other platforms keep their normal graphics settings; this CI check does not replace testing on a physical Intel Mac.

The app icon comes from `build/icon.svg`. `npm run icons` generates PNG, ICO, and ICNS files. Build output and generated icons are excluded from Git. Build scripts include only app code, bundled content, the runtime icon, package metadata, and README; personal saves, test screenshots, and development tools are excluded.

On a Windows account without an existing Deskling installation, `npm run smoke:installer` silently installs into a temporary workspace folder, checks the installed app with an isolated profile, reinstalls it, then uninstalls and removes that temporary installation. This exercises Windows installer registration and shortcuts, so use a clean test account for repeated release checks. It does not launch or alter your real buddy profile.

## Installation

- Windows: open `Deskling-<version>-win-x64.exe`. The installer works per user without administrator elevation. Leave **Run Deskling** checked on the final page to open your buddy when you click Finish. You can also launch Deskling from the Start menu or desktop shortcut. Quit through the tray icon before upgrading.
- macOS: open the matching DMG and drag Deskling into Applications. The ZIP is an alternative. These beta builds are ad-hoc signed, without Developer ID signing or Apple notarization; Gatekeeper may block an internet download. Do not advertise a frictionless Mac installation until signing and notarization are configured and tested.
- Linux: mark the AppImage executable and launch it. If the distribution cannot run AppImages, extract the tarball and run `deskling` from its folder. Deskling currently uses X11/XWayland for its floating windows and cursor tracking; native Wayland is not supported. Desktop tray integration varies by desktop environment. Keep Chromium's sandbox enabled; distribution sandbox or AppImage/FUSE prerequisites may need setup on a test machine.

Windows builds are not Authenticode signed yet, so Windows may show an unknown-publisher warning. Installation scripts cannot bypass platform trust requirements. Signing is a separate public-launch step.

Users do not need Node.js or npm to run these packaged builds. Installation and updates keep the existing `habit-buddy/habit-buddy.json` data location and OS identifier, even though the public app name is Deskling. The Windows uninstaller retains user data.

To exit, right-click the buddy and choose **Quit Deskling**, or open Settings and click **Quit Deskling**. The tray menu also offers Quit; Windows may place that icon in its hidden-icon area.

## Automated builds and publishing

1. Commit the intended release changes and set the version in `package.json` and `package-lock.json`.
2. Run `npm test`, `npm run check`, build, and check the packaged app.
3. After pushing, choose **Actions → Build Deskling installers → Run workflow** to build all four variants. A `v<version>` tag also starts builds; the tag must match `package.json`.
4. Download the artifacts from the workflow. Each includes a SHA-256 manifest. Compare the checksum before distributing or installing a copied file.
5. Test clean installation, reopening, and an upgrade that retains a named buddy, habits, history, coins, and outfits. Include a multi-monitor check on each supported OS.
6. When ready to share, create a draft GitHub Release and attach the installation files and checksum manifests. For Windows updates, also attach `latest.yml` and the `.exe.blockmap` with their original filenames. Review its notes and downloads before publishing. Stable in-app updates use published releases, not drafts or prereleases.

The workflow only uploads build artifacts; it never publishes a release. Remote download/install scripts and landing-page download links should point to published, tested release assets once those exist. Launch at login remains deferred.

### Published 0.1.6 platform beta files

The macOS arm64, macOS x64, and Linux x64 files come from successful workflow run `42520627857` at `9f1ca6a731d0d1b9478a0efc22837afa87e9fd90`. Relative to the release tag, the only runtime source change enables software rendering during Intel macOS CI smoke checks; normal launches are unchanged. Each platform passed the packaged startup, UI, shop, persistence, and quit checks. These are early betas, pending physical-device installation, upgrade, and multi-monitor checks. Windows release files and updater metadata remain unchanged.

Linux AppImages use `x86_64` in their filename while tarballs use `x64`. The per-platform checksum generator includes both. Reverify every artifact's SHA-256 after download before attaching it to a release. The website's `website/lib/downloads.ts` lists the actual asset filenames; update it only after those assets are published.

## Windows in-app updates

Installed Windows builds check the public `Pritika04/deskling` GitHub Releases feed thirty seconds after startup and every twelve hours. Settings also offers a manual check. The gear gets a small badge for a newer stable version; the user chooses Download update, Update and restart, or Later. Downloads show progress, verify their checksums, and do not install on ordinary quit. Latest changes and position are saved before an explicit restart. Core habit tracking remains usable offline, and there are no update popups.

No release is required to use the beta app: before the first publication, Settings simply says no updates have been published. A version that was distributed before updater support needs one manual installer upgrade. macOS and Linux keep manual updates for now.

This beta uses HTTPS GitHub release metadata and updater checksum validation. The Windows installers are still unsigned; Authenticode signing remains necessary public-launch work. Do not disable signature verification when adding a signing certificate; test the transition to signed builds and their publisher identity before distributing them.

Run `npm run test:updates:download` on Windows to exercise the real updater against a loopback-only server, including altered-download rejection without running an installer. `npm run test:updates:install` builds two separate fixture apps and performs an actual 0.0.1 → 0.0.2 update and restart, verifying the existing Store's buddy, habits, progress, coins, outfit, size, and position. It uses its own app identity, cache, and profile and removes its temporary installation. These fixtures do not replace the user's Deskling installation.
