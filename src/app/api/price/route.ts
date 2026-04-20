import type { NextRequest } from "next/server";

import { fetchSteamPrice } from "@/lib/steam";

const PRICE_CACHE = new Map<string, { expiresAt: number; price: Awaited<ReturnType<typeof fetchSteamPrice>> }>();
const CACHE_TTL_MS = 20_000;

function readCache(marketHashName: string) {
  const cached = PRICE_CACHE.get(marketHashName);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    PRICE_CACHE.delete(marketHashName);
    return null;
  }

  return cached.price;
}

function writeCache(
  marketHashName: string,
  price: Awaited<ReturnType<typeof fetchSteamPrice>>,
) {
  PRICE_CACHE.set(marketHashName, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    price,
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

  if (marketHashName.length > 180) {
    return Response.json(
      {
        error: "marketHashName must be 180 characters or fewer",
      },
      { status: 400 },
    );
  }

  const cachedPrice = readCache(marketHashName);
  if (cachedPrice) {
    return Response.json({
      cached: true,
      marketHashName,
      price: cachedPrice,
    });
  }

  try {
    const price = await fetchSteamPrice(marketHashName);

    if (!price) {
      return Response.json(
        {
          error: "No price data is available for this item",
        },
        { status: 404 },
      );
    }

    writeCache(marketHashName, price);

    return Response.json(
      {
        cached: false,
        marketHashName,
        price,
      },
      { status: 200 },
    );
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "TimeoutError";

    return Response.json(
      {
        error: isTimeout
          ? "Steam price request timed out"
          : "Unable to fetch price from Steam",
      },
      { status: isTimeout ? 504 : 502 },
    );
  }
}
