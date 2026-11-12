# Deskling website

The landing page for Deskling, a desktop pet and habit tracker.

Use Node.js 22.13+ (22.x) and npm. From this directory:

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`. Run `npm run build` to check the production build, then `npm start` to serve it.

For Vercel, import `Pritika04/deskling` and use these project settings:

| Setting | Value |
| --- | --- |
| Root Directory | `website` |
| Framework Preset | Next.js |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | Default |

Vercel must build `website/`, which contains the Next.js package. After saving the settings, deploy the latest `main` commit.

The site uses Vercel's production hostname automatically. To use a custom canonical domain, set `NEXT_PUBLIC_SITE_URL` to its full HTTPS URL and redeploy. The download cards use published GitHub Release assets for Windows x64, Apple Silicon and Intel macOS, and Linux x64. URLs and version are centralized in `lib/downloads.ts`. Mac/Linux downloads are labeled early beta; installation notes explain notarization, X11/XWayland, and manual updates.

## Feedback inbox

The site's own feedback form delivers private notes through Formspree. No visitor account, name, or email is required; visitors can optionally provide an email for a reply. Formspree also keeps submissions in the owner's dashboard according to the selected plan.

The form uses `https://formspree.io/f/xkjrwjnp` by default, so no Vercel environment variable is needed. Submissions appear in the Formspree account that owns this form and are delivered to its configured inbox. Keep the receiving email verified in Formspree. To switch forms, optionally set `NEXT_PUBLIC_FORMSPREE_FORM_ID` in Vercel and redeploy (or in `website/.env.local` for local development). This ID is public; no API key belongs in the frontend.

Only the message is required. Do not enable a required-email rule on the Formspree form. If you enable CAPTCHA in Formspree, use a compatible AJAX CAPTCHA integration before accepting submissions. The UI shows success only when the delivery service accepts a submission, keeps drafts after errors, and pauses sending while no inbox is configured. Verify one anonymous note and one note with a reply email in your inbox after configuration.

## Acquisition analytics

Optional Google Analytics uses `G-C89ZESKC7R` and loads after the visitor allows analytics. No Vercel environment variable is needed; `NEXT_PUBLIC_GA_MEASUREMENT_ID` is an optional override. Both footers offer Analytics preferences. Actual installer links emit `download_click` and a browser-deduplicated `first_download_click`; these measure click intent, not completed downloads or installations. The existing Vercel Analytics and Speed Insights remain separate. See [METRICS.md](../METRICS.md) for GA4 report setup, event dimensions, limitations, and the secondary GitHub file-count report.
