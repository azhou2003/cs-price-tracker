import type { NextRequest } from "next/server";

import type { HistoryPoint } from "@/lib/types";

type SteamHistoryResponse = {
  success?: boolean;
  prices?: Array<[string, string, string]>;
};

function parseAmount(value: string) {
  const normalized = value.replace(/[^0-9.,-]/g, "").replace(/,/g, "").trim();
  const amount = Number.parseFloat(normalized);
  return Number.isNaN(amount) ? undefined : amount;
}

function parseVolume(value: string) {
  const normalized = value.replace(/,/g, "").trim();
  const volume = Number.parseInt(normalized, 10);
  return Number.isNaN(volume) ? undefined : volume;
}

function parseSteamDate(value: string) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return undefined;
  }

  return timestamp.toISOString();
}

function normalizeHistory(data: SteamHistoryResponse): HistoryPoint[] {
  if (!data.success || !Array.isArray(data.prices)) {
    return [];
  }

  return data.prices
    .map((entry): HistoryPoint | null => {
      const timestamp = parseSteamDate(entry[0]);
      const amount = parseAmount(entry[1]);
      if (!timestamp || typeof amount !== "number") {
        return null;
      }

      return {
        timestamp,
        amount,
        volume: parseVolume(entry[2]),
      };
    })
    .filter((point): point is HistoryPoint => point !== null);
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

  const steamLoginSecure = request.headers.get("x-steam-login-secure")?.trim() ?? "";
  const steamSessionId = request.headers.get("x-steam-sessionid")?.trim() ?? "";
  const steamCountry = request.headers.get("x-steam-country")?.trim() ?? "";
  const steamExtraCookies = request.headers.get("x-steam-extra-cookies")?.trim() ?? "";

  if (!steamLoginSecure || !steamSessionId) {
    return Response.json(
      {
        error: "Missing Steam auth fields. Add steamLoginSecure and sessionid in Settings.",
      },
      { status: 400 },
    );
  }

  const cookieHeader = [
    `steamLoginSecure=${steamLoginSecure}`,
    `sessionid=${steamSessionId}`,
    steamCountry ? `steamCountry=${steamCountry}` : "",
    steamExtraCookies,
  ]
    .filter(Boolean)
    .join("; ");

  try {
    const endpoint = new URL("https://steamcommunity.com/market/pricehistory/");
    endpoint.searchParams.set("appid", "730");
    endpoint.searchParams.set("currency", "1");
    endpoint.searchParams.set("market_hash_name", marketHashName);

    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(10_000),
      headers: {
        accept: "application/json",
        "accept-language": "en-US,en;q=0.9",
        cookie: cookieHeader,
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "x-requested-with": "XMLHttpRequest",
        referer: `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketHashName)}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const upstreamText = await response.text();
      return Response.json(
        {
          error:
            "Steam rejected history request. Verify steamLoginSecure/sessionid and include extra cookie pairs from the same browser session.",
          details: `Upstream status ${response.status}. ${upstreamText.slice(0, 160)}`,
        },
        { status: response.status === 400 ? 401 : 502 },
      );
    }

    const raw = (await response.json()) as SteamHistoryResponse;
    const points = normalizeHistory(raw);

    if (points.length === 0) {
      return Response.json(
        {
          error: "Steam returned no history data for this item.",
        },
        { status: 404 },
      );
    }

    return Response.json({
      source: "steam-history",
      points,
    });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "TimeoutError";

    return Response.json(
      {
        error: isTimeout
          ? "Steam history request timed out"
          : "Unable to fetch Steam history",
      },
      { status: isTimeout ? 504 : 502 },
    );
  }
}
