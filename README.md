# CS Price Tracker

Local-first web app to track Counter-Strike item prices. User watchlists, history, and
preferences are stored in the browser only.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS v4
- Route Handlers as a stateless proxy layer for market data

## Current Scaffold

- App pages:
  - `/` dashboard scaffold
  - `/search` search scaffold
  - `/item/[marketHashName]` item detail scaffold
  - `/settings` settings scaffold
- API route stubs:
  - `/api/health`
  - `/api/search`
  - `/api/price`
- Local state modules in `src/lib`:
  - `types.ts`
  - `storage.ts`
  - `api-client.ts`

## Run Locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Next Steps

1. Implement Steam-backed search and price fetch logic in route handlers.
2. Wire `/search` and `/item/[marketHashName]` to typed client functions.
3. Add watchlist and local price snapshot persistence.
4. Add refresh controls, alert thresholds, and notification UX.
