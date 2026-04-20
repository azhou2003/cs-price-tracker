import type { NextRequest } from "next/server";

import { fetchSteamItemByHash } from "@/lib/steam";

const ITEM_CACHE = new Map<
  string,
  { expiresAt: number; item: Awaited<ReturnType<typeof fetchSteamItemByHash>> }
>();
const CACHE_TTL_MS = 5 * 60_000;

function readCache(marketHashName: string) {
  const cached = ITEM_CACHE.get(marketHashName);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    ITEM_CACHE.delete(marketHashName);
    return null;
  }

  return cached.item;
}

function writeCache(
  marketHashName: string,
  item: Awaited<ReturnType<typeof fetchSteamItemByHash>>,
) {
  ITEM_CACHE.set(marketHashName, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    item,
  });
}

export async function GET(request: NextRequest) {
  const marketHashName =
    request.nextUrl.searchParams.get("marketHashName")?.trim() ?? "";

  if (!marketHashName) {
    return Response.json(
      {
        error: "Missing required query parameter: marketHashName",
      },
      { status: 400 },
    );
  }

  const cached = readCache(marketHashName);
  if (cached) {
    return Response.json({ cached: true, item: cached });
  }

  try {
    const item = await fetchSteamItemByHash(marketHashName);
    if (!item) {
      return Response.json({ error: "Item metadata not found" }, { status: 404 });
    }

    writeCache(marketHashName, item);
    return Response.json({ cached: false, item });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "TimeoutError";

    return Response.json(
      {
        error: isTimeout
          ? "Steam item metadata request timed out"
          : "Unable to fetch item metadata from Steam",
      },
      { status: isTimeout ? 504 : 502 },
    );
  }
}
