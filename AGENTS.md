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

- Routes live in `src/app`; route-specific UI is colocated in each route's `_components` folder, with shared UI in `src/components`.
- `src/app/page.tsx` is the real dashboard entrypoint (`DashboardClient`); `src/app/search/page.tsx` just redirects to `/`.
- Steam integration logic is centralized in `src/lib/steam.ts`; browser-facing fetch wrappers are in `src/lib/api-client.ts`.

## State and data constraints

- App is local-first: user watchlist/history/settings are stored only in browser `localStorage` key `cs-price-tracker:v1` (`src/lib/storage.ts`).
- Any code touching storage must stay client-side (`"use client"` + `typeof window` guards).
- `DEFAULT_STATE.settings.currency` is fixed to `"USD"`; server price routes also hardcode Steam currency `1` (USD).

## API route quirks to preserve

- Proxy routes are in `src/app/api/*`; they use in-memory `Map` caches with short TTLs (search 30s, price 20s, item 5m).

## Styling guide (required)

- UI direction: tactical esports (classic CS:GO menu/inventory feel), not playful or futuristic.
- Keep layouts compact and information-dense.
- Prefer sharp rectangular surfaces over rounded "cardy" styling.
- Use dark muted foundations with subtle borders and restrained glow.
- Use accent colors only for meaningful state emphasis (`buy`, `sell`, `both`, danger), not as broad decoration.

### Reuse shared styles first

- Primary style source is `src/app/globals.css`.
- Reuse shared classes before introducing new one-off class stacks:
  - `.panel`, `.panel-inset`
  - `.label-caps`, `.field`
  - `.btn`, `.btn-primary`, `.btn-muted`, `.btn-danger`, `.btn-warn`
  - `.chip`, `.chip-neutral`, `.chip-buy`, `.chip-sell`, `.chip-danger`
  - `.data-table`

### Motion and accessibility

- Animations must remain subtle and functional.
- Any moving UI (like the watchlist belt) must:
  - pause on hover/focus where appropriate
  - respect `prefers-reduced-motion`

### Watchlist belt behavior

- Triggered items use status accents per-item.
- If there are no triggers, show up to 5 random watchlist items in neutral styling.
- Avoid showing duplicate items simultaneously.
