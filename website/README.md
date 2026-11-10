# Deskling website

The landing page for Deskling, a desktop pet and habit tracker.

From this directory, run `npm ci` and `npm run dev`. Run `npm run build` to check the production build.

On Vercel, import `Pritika04/deskling` and set **Root Directory** to `website` and **Framework Preset** to `Next.js`. Leave Output Directory at its default. The build is `npm run build`; installation is `npm ci`.

The site uses Vercel's production hostname automatically. To use a custom canonical domain, set `NEXT_PUBLIC_SITE_URL` to its full HTTPS URL and redeploy. Downloads come from the published Windows installer on GitHub Releases.
