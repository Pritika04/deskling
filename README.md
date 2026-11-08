# Deskling

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
