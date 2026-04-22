import type {
  DailyGameItemType,
  DailyOrderByPriceChallengeResponse,
  DailyPriceGuessChallengeResponse,
  MarketItem,
  PriceSnapshot,
} from "@/lib/types";
import { toDailyGameItemTypesParam } from "@/lib/daily-game-item-types";

type SearchResponse = {
  results: MarketItem[];
};

type PriceResponse = {
  price: PriceSnapshot | null;
};

type ItemResponse = {
  item: MarketItem | null;
};

type ErrorResponse = {
  error?: string;
};

async function toError(response: Response, fallback: string) {
  let message = fallback;
  try {
    const data = (await response.json()) as ErrorResponse;
    if (data.error) {
      message = data.error;
    }
  } catch {
    // Ignore JSON parse errors and keep fallback.
  }

  return new Error(message);
}

export async function searchItems(query: string): Promise<MarketItem[]> {
  const params = new URLSearchParams({ q: query });
  const response = await fetch(`/api/search?${params.toString()}`);

  if (!response.ok) {
    throw await toError(response, "Failed to search items");
  }

  const data = (await response.json()) as SearchResponse;
  return data.results;
}

export async function fetchItemPrice(
  marketHashName: string,
): Promise<PriceSnapshot | null> {
  const params = new URLSearchParams({ marketHashName });
  const response = await fetch(`/api/price?${params.toString()}`);

  if (!response.ok) {
    throw await toError(response, "Failed to fetch item price");
  }

  const data = (await response.json()) as PriceResponse;
  return data.price;
}

export async function fetchItemMeta(
  marketHashName: string,
): Promise<MarketItem | null> {
  const params = new URLSearchParams({ marketHashName });
  const response = await fetch(`/api/item?${params.toString()}`);

  if (!response.ok) {
    throw await toError(response, "Failed to fetch item metadata");
  }

  const data = (await response.json()) as ItemResponse;
  return data.item;
}

export async function fetchDailyOrderByPriceGame(
  includedTypes?: readonly DailyGameItemType[],
): Promise<DailyOrderByPriceChallengeResponse> {
  const params = new URLSearchParams();
  if (includedTypes && includedTypes.length > 0) {
    params.set("types", toDailyGameItemTypesParam(includedTypes));
  }

  const response = await fetch(
    `/api/daily-order-by-price${params.size > 0 ? `?${params.toString()}` : ""}`,
  );

  if (!response.ok) {
    throw await toError(response, "Failed to fetch daily order by price game");
  }

  return (await response.json()) as DailyOrderByPriceChallengeResponse;
}

export async function fetchDailyPriceGuessGame(
  includedTypes?: readonly DailyGameItemType[],
): Promise<DailyPriceGuessChallengeResponse> {
  const params = new URLSearchParams();
  if (includedTypes && includedTypes.length > 0) {
    params.set("types", toDailyGameItemTypesParam(includedTypes));
  }

  const response = await fetch(
    `/api/daily-price-guess${params.size > 0 ? `?${params.toString()}` : ""}`,
  );

  if (!response.ok) {
    throw await toError(response, "Failed to fetch daily price guess game");
  }

  return (await response.json()) as DailyPriceGuessChallengeResponse;
}
