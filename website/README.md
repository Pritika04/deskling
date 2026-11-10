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

The site uses Vercel's production hostname automatically. To use a custom canonical domain, set `NEXT_PUBLIC_SITE_URL` to its full HTTPS URL and redeploy. Downloads come from the published Windows installer on GitHub Releases.
