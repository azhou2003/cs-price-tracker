import type { MarketItem, PriceSnapshot } from "@/lib/types";

const SEARCH_ENDPOINT = "https://steamcommunity.com/market/search/render/";
const PRICE_ENDPOINT = "https://steamcommunity.com/market/priceoverview/";

type SearchApiResult = {
  hash_name?: string;
  name?: string;
  sell_listings?: number;
  sell_price?: number;
  sell_price_text?: string;
  asset_description?: {
    icon_url?: string;
  };
};

type SearchApiResponse = {
  success?: boolean;
  results?: SearchApiResult[];
};

type PriceApiResponse = {
  success?: boolean;
  lowest_price?: string;
  median_price?: string;
  volume?: string;
};

function parseUsdAmount(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return Number.NaN;
  }

  const cleaned = trimmed.replace(/[^0-9.,-]/g, "").replace(/,/g, "");
  return Number.parseFloat(cleaned);
}

function parseInteger(value: string) {
  const cleaned = value.replace(/,/g, "").trim();
  const parsed = Number.parseInt(cleaned, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function toIconUrl(iconPath?: string) {
  if (!iconPath) {
    return undefined;
  }

  return `https://community.fastly.steamstatic.com/economy/image/${iconPath}/96fx96f`;
}

async function fetchJson<T>(url: URL) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8_000),
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Steam request failed (${response.status})`);
  }

  return (await response.json()) as T;
}

export async function searchSteamItems(query: string, limit = 20) {
  const url = new URL(SEARCH_ENDPOINT);
  url.searchParams.set("query", query);
  url.searchParams.set("start", "0");
  url.searchParams.set("count", String(limit));
  url.searchParams.set("search_descriptions", "0");
  url.searchParams.set("sort_column", "popular");
  url.searchParams.set("sort_dir", "desc");
  url.searchParams.set("appid", "730");
  url.searchParams.set("norender", "1");

  const data = await fetchJson<SearchApiResponse>(url);
  const results = Array.isArray(data.results) ? data.results : [];

  return results
    .map((item): MarketItem | null => {
      const marketHashName = item.hash_name?.trim();
      const displayName = item.name?.trim() ?? marketHashName;

      if (!marketHashName || !displayName) {
        return null;
      }

      return {
        marketHashName,
        displayName,
        iconUrl: toIconUrl(item.asset_description?.icon_url),
        listingCount: item.sell_listings,
        startingPrice:
          typeof item.sell_price === "number" ? item.sell_price / 100 : undefined,
        startingPriceText: item.sell_price_text,
      };
    })
    .filter((item): item is MarketItem => item !== null);
}

export async function fetchSteamItemByHash(marketHashName: string) {
  const results = await searchSteamItems(marketHashName, 100);

  const exact = results.find((item) => item.marketHashName === marketHashName);
  if (exact) {
    return exact;
  }

  const caseInsensitive = results.find(
    (item) => item.marketHashName.toLowerCase() === marketHashName.toLowerCase(),
  );

  return caseInsensitive ?? null;
}

export async function fetchSteamPrice(
  marketHashName: string,
): Promise<PriceSnapshot | null> {
  const url = new URL(PRICE_ENDPOINT);
  url.searchParams.set("appid", "730");
  url.searchParams.set("currency", "1");
  url.searchParams.set("market_hash_name", marketHashName);

  const data = await fetchJson<PriceApiResponse>(url);
  if (!data.success || !data.lowest_price) {
    return null;
  }

  const amount = parseUsdAmount(data.lowest_price);
  if (Number.isNaN(amount)) {
    return null;
  }

  return {
    marketHashName,
    amount,
    currency: "USD",
    timestamp: new Date().toISOString(),
    source: "steam",
    lowestPriceText: data.lowest_price,
    medianPriceText: data.median_price,
    volume: data.volume ? parseInteger(data.volume) : undefined,
  };
}
