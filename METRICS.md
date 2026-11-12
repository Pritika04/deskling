# Deskling metrics

## Website discovery → first download click

Google Analytics 4 property `G-C89ZESKC7R` is the primary acquisition measurement. The Google tag loads only after a visitor allows optional analytics; visitors can change that choice from **Analytics preferences** in either footer. Vercel's existing cookie-free page analytics remains separate. No Tag Manager container is installed, so this site initializes the Google tag only once.

Events:

| Event | Meaning |
| --- | --- |
| `first_visit` | Google's first recognized visit for that browser, using its analytics cookies. |
| `download_click` | A click on an actual installer download link, including repeat clicks. Header buttons that only scroll to Downloads do not count. |
| `first_download_click` | The first observed installer click in that consenting browser, across every platform and release. A local browser marker prevents repeats. |

Download events include `download_platform`, `download_architecture`, `release_version`, `file_name`, and the fixed GitHub `link_url`. No habit data, feedback text, email, custom user ID, or fingerprint is attached by our code. Advertising consent stays denied, Google Signals and ad personalization are disabled. Withdrawing consent stops site events, clears the first-click marker and Google Analytics cookies, and disables measurement for this property.

### View the funnel in Google Analytics

1. Visit [Google Analytics](https://analytics.google.com/) and select Deskling Website.
2. Use **Realtime** while testing after allowing analytics. The custom events should appear when an installer link is clicked. Standard reports can take time to populate.
3. In **Admin → Custom definitions**, create event-scoped dimensions for `download_platform`, `download_architecture`, and `release_version` to use those breakdowns in reports.
4. In **Explore → Funnel exploration**, create a closed funnel with `first_visit` followed by `first_download_click`. This measures recognized new visitors who go on to click a download. Use the same date range and funnel window when comparing results.
5. Use **Total users** for `download_click` to see recognized unique download clickers, rather than counting every click. Use first-user source/medium or channel grouping to understand discovery sources.
6. Optionally mark `first_download_click` as a key event. Keep enhanced page-view measurement and browser-history changes enabled for navigation between Home and Upcoming. Our code uses a single Google tag configuration and lets GA4 handle those page views.

Use GA4 visitors for this funnel's denominator, not Vercel's visitor total: Google measures consenting recognized browsers, while Vercel uses its own cookie-free identification. Automatically collected `file_download` events are separate; use the named custom events above for this funnel.

These are consenting, recognized browsers, not verified new people, completed file transfers, or installations. Existing app users can visit from a new browser. Different devices, cleared cookies/storage, consent changes, blockers, and denied consent affect counts. Tracking begins when deployed; historical GitHub downloads cannot be backfilled as unique website users. If persistent browser storage is unavailable, ordinary clicks can still be measured after consent, but our code omits the first-click event rather than claiming reliable first-time recognition.

The Measurement ID is public and defaults to the supplied ID. Optionally override `NEXT_PUBLIC_GA_MEASUREMENT_ID` in Vercel and redeploy. No secret or new dependency is required. Google Analytics data is viewed privately in the owner's Google account; no public counter is displayed.

## Website visits

Open [Vercel → Deskling → Analytics](https://vercel.com/pritikas-projects-1f00deee/deskling-bjwf/analytics) for website visitor and page-view metrics. Speed Insights shows website performance separately. Both integrations are already on the website.

Vercel download-button custom events require Pro or Enterprise. This implementation uses the supplied Google Analytics property for those events instead, so Vercel Pro is not needed. See [Vercel's custom-event availability](https://vercel.com/docs/analytics/custom-events).

## App-file downloads

From the repository root, run:

```sh
npm run metrics:downloads
```

This reads GitHub's public release API and writes a local report to `.npm/download-metrics.html`, plus `.npm/download-metrics.json` for the underlying data. Open the HTML file in your browser. Run the command again to refresh it; no account, API key, new app release, or paid service is needed. Generated reports stay out of Git.

The report shows cumulative app-file downloads by operating system, release, and individual file. It includes EXE, Mac DMG/ZIP, Linux AppImage/tar.gz, and excludes drafts, prereleases, update metadata, blockmaps, and checksum files.

These counts are **not unique users or confirmed installations**. Re-downloads, automatic updates, automated requests, and our own testing can count. GitHub does not supply a historical daily breakdown in these totals; we do not infer one. Source: [GitHub release-assets API](https://docs.github.com/en/rest/releases/assets).

Active users, retention, and habit completion are not measured. Deskling's local habit data is not sent anywhere by this reporting tool.
