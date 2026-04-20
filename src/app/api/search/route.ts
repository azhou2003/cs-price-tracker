import type { NextRequest } from "next/server";

import { searchSteamItems } from "@/lib/steam";

const QUERY_CACHE = new Map<string, { expiresAt: number; results: Awaited<ReturnType<typeof searchSteamItems>> }>();
const CACHE_TTL_MS = 30_000;

function readCache(query: string) {
  const cached = QUERY_CACHE.get(query);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    QUERY_CACHE.delete(query);
    return null;
  }

  return cached.results;
}

function writeCache(
  query: string,
  results: Awaited<ReturnType<typeof searchSteamItems>>,
) {
  QUERY_CACHE.set(query, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    results,
  });
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (query.length < 2) {
    return Response.json(
      {
        error: "Query must be at least 2 characters",
      },
      { status: 400 },
    );
  }

  if (query.length > 80) {
    return Response.json(
      {
        error: "Query must be 80 characters or fewer",
      },
      { status: 400 },
    );
  }

  const cachedResults = readCache(query.toLowerCase());
  if (cachedResults) {
    return Response.json({
      query,
      cached: true,
      results: cachedResults,
    });
  }

  try {
    const results = await searchSteamItems(query);
    writeCache(query.toLowerCase(), results);

    return Response.json(
      {
        query,
        cached: false,
        results,
      },
      { status: 200 },
    );
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "TimeoutError";

    return Response.json(
      {
        error: isTimeout
          ? "Steam search request timed out"
          : "Unable to fetch search results from Steam",
      },
      { status: isTimeout ? 504 : 502 },
    );
  }
}
