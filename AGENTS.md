<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Fast start

- Use npm scripts from `package.json`: `npm run dev`, `npm run lint`, `npm run build`, `npm run start`.
- Before considering a coding task complete, run `npm run build` and fix any failures.
- There is no test script/config in this repo; do not invent Vitest/Jest/Playwright commands.
- TypeScript path alias is configured: `@/* -> src/*` (`tsconfig.json`).

## App shape (single Next.js app)

- Routes live in `src/app`; UI is mostly client components in `src/components`.
- `src/app/page.tsx` is the real dashboard entrypoint (`DashboardClient`); `src/app/search/page.tsx` just redirects to `/`.
- Steam integration logic is centralized in `src/lib/steam.ts`; browser-facing fetch wrappers are in `src/lib/api-client.ts`.

## State and data constraints

- App is local-first: user watchlist/history/settings are stored only in browser `localStorage` key `cs-price-tracker:v1` (`src/lib/storage.ts`).
- Any code touching storage must stay client-side (`"use client"` + `typeof window` guards).
- `DEFAULT_STATE.settings.currency` is fixed to `"USD"`; server price routes also hardcode Steam currency `1` (USD).

## API route quirks to preserve

- Proxy routes are in `src/app/api/*`; they use in-memory `Map` caches with short TTLs (search 30s, price 20s, item 5m).
- `/api/history` is authenticated via request headers, not env vars: `x-steam-login-secure`, `x-steam-sessionid`, optional `x-steam-country`, `x-steam-extra-cookies`.
- `/api/history` returns detailed upstream failure hints; avoid removing that diagnostics payload unless asked.
