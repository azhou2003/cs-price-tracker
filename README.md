# CS Price Tracker

Local-first web app to track Counter-Strike item prices. User watchlists, history, and
preferences are stored in the browser only.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS v4
- Route Handlers as a stateless proxy layer for market data

## Current Features

- App pages:
  - `/` dashboard with local watchlist overview and refresh-all action
  - `/search` debounced Steam item search
  - `/item/[marketHashName]` item detail with price refresh, watchlist toggle, and local history
  - `/settings` local preferences (refresh interval + notifications toggle)
- API routes:
  - `/api/health`
  - `/api/search`
  - `/api/price`
- Local state modules in `src/lib`:
  - `types.ts`
  - `storage.ts`
  - `api-client.ts`
  - `steam.ts`

## Run Locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Notes

- User data remains browser-local (`localStorage`) with no server persistence.
- Proxy routes add request validation, timeout handling, and short in-memory cache.

## Next Steps

1. Add chart visualization for local price history.
2. Add threshold alerts (`lowAlert`, `highAlert`) and browser notification triggers.
3. Add optional batch price endpoint for faster watchlist refreshes.
