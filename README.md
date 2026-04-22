# CS Price Tracker

CS Price Tracker is a local-first Counter-Strike market tracker built with Next.js.
Watchlist data, price history, game progress, and preferences are stored in the browser only.

## Tech Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS v4
- Next.js Route Handlers for Steam proxy endpoints

## App Routes

- `/` - Dashboard for watchlist management, item search, and price refresh
- `/games` - Daily game modes:
  - Order 5 items from lowest to highest price
  - Guess the item price within tolerance
- `/settings` - Local settings (refresh interval, backup export/import, and clear local data)
- `/search` - Redirects to `/`

## API Routes

- `/api/health` - Simple health check
- `/api/search` - Steam market search (30s in-memory cache)
- `/api/price` - Current price for a market item (20s in-memory cache)
- `/api/item` - Item metadata by market hash name (5m in-memory cache)
- `/api/history` - Steam price history proxy (requires Steam auth headers)
- `/api/daily-game` and `/api/daily-game/guess` - Daily order-by-price challenge
- `/api/daily-price-guess` and `/api/daily-price-guess/guess` - Daily price guess challenge

## Local Data Model

- Storage key: `cs-price-tracker:v1`
- Additional game keys:
  - `cs-price-tracker:daily-game:v1`
  - `cs-price-tracker:daily-price-guess:v1`
  - `cs-price-tracker:daily-game-stats:v1`
- Currency is currently fixed to `USD`

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Build and Lint

```bash
npm run lint
npm run build
npm run start
```

## Styling Guide

The app uses a tactical esports visual language inspired by classic CS:GO menus.

- Tone: dark, muted, compact, and information-dense.
- Panels: sharp rectangular cards with subtle borders and restrained depth.
- Typography: clean sans-serif with tight spacing and clear hierarchy.
- Motion: minimal and purposeful (for example, the watchlist conveyor belt).
- Accents: use color sparingly for state emphasis (`buy`, `sell`, `both`) rather than decoration.

### Shared UI tokens and utility classes

Core styling lives in `src/app/globals.css`.

- Color tokens (`:root`): `--background`, `--foreground`, `--surface-*`, `--line`, `--text-*`, `--accent`, `--buy`, `--sell`, `--danger`.
- Shared classes:
  - Layout surfaces: `.panel`, `.panel-inset`
  - Labels and inputs: `.label-caps`, `.field`
  - Buttons: `.btn`, `.btn-primary`, `.btn-muted`, `.btn-danger`, `.btn-warn`
  - Status chips: `.chip`, `.chip-neutral`, `.chip-buy`, `.chip-sell`, `.chip-danger`
  - Tables: `.data-table`

Prefer these shared classes before introducing one-off Tailwind color stacks.

### Watchlist conveyor belt

- Belt styles are defined by `.watchlist-belt-wrap` and `.watchlist-belt-track` in `src/app/globals.css`.
- The belt pauses on hover and disables animation for reduced-motion users.
- Item cards are state-tinted when triggered and neutral when not triggered.

## Notes

- This app does not persist user state on a backend.
- `/api/history` expects Steam auth values via request headers:
  - `x-steam-login-secure`
  - `x-steam-sessionid`
  - optional: `x-steam-country`, `x-steam-extra-cookies`
