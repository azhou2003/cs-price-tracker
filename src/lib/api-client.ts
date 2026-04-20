import type { MarketItem, PriceSnapshot } from "@/lib/types";

type SearchResponse = {
  results: MarketItem[];
};

type PriceResponse = {
  price: PriceSnapshot | null;
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
