# Deskling

**[🌱 Visit the Deskling website →](https://deskling-bjwf.vercel.app/)**

A tiny desktop companion that keeps you company and helps you build gentle habits. Name your buddy, choose its colors, and enjoy reminders, little jokes, snack celebrations, and daily surprises. Earn coins for cute accessories as you make progress. Your habits and buddy data stay on your device and work offline; Windows update checks use an internet connection.

## Run

Requires Node.js 22.12 or newer and npm.

```sh
git clone https://github.com/Pritika04/deskling.git
cd deskling
npm install
npm start
```

To build an installer on your own operating system, run `npm run dist:win` (Windows), `npm run dist:mac` (macOS), or `npm run dist:linux` (Linux). Open the resulting installer or app in `dist/`. These are beta builds; signing and platform testing details are in [RELEASING.md](RELEASING.md).

## Website

The landing page is a separate Next.js project in `website/`. From the repository root:

```sh
cd website
npm ci
npm run dev
```

Open `http://localhost:3000`. Use Node.js 22.13+ (22.x); run `npm run build` to check the production build.

For Vercel, set **Root Directory** to **`website`**, **Framework Preset** to **Next.js**, and leave **Output Directory** at its default. Save the settings and deploy the latest `main` commit. See [website/README.md](website/README.md) for the full build settings.
