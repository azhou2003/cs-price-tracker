import type {
  DailyGameChallengeResponse,
  DailyGameGuessResponse,
  DailyPriceGuessAttemptResponse,
  DailyPriceGuessChallengeResponse,
  MarketItem,
  PriceSnapshot,
} from "@/lib/types";

type SearchResponse = {
  results: MarketItem[];
};

type PriceResponse = {
  price: PriceSnapshot | null;
};

type ItemResponse = {
  item: MarketItem | null;
};

type DailyGameGuessPayload = {
  dayKey: string;
  orderedMarketHashNames: string[];
};

type DailyPriceGuessPayload = {
  dayKey: string;
  guess: number;
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

export async function fetchDailyGame(): Promise<DailyGameChallengeResponse> {
  const response = await fetch("/api/daily-game");

  if (!response.ok) {
    throw await toError(response, "Failed to fetch daily game");
  }

  return (await response.json()) as DailyGameChallengeResponse;
}

export async function submitDailyGameGuess(
  payload: DailyGameGuessPayload,
): Promise<DailyGameGuessResponse> {
  const response = await fetch("/api/daily-game/guess", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await toError(response, "Failed to submit daily game guess");
  }

  return (await response.json()) as DailyGameGuessResponse;
}

export async function fetchDailyPriceGuessGame(): Promise<DailyPriceGuessChallengeResponse> {
  const response = await fetch("/api/daily-price-guess");

  if (!response.ok) {
    throw await toError(response, "Failed to fetch daily price guess game");
  }

  return (await response.json()) as DailyPriceGuessChallengeResponse;
}

export async function submitDailyPriceGuess(
  payload: DailyPriceGuessPayload,
): Promise<DailyPriceGuessAttemptResponse> {
  const response = await fetch("/api/daily-price-guess/guess", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await toError(response, "Failed to submit daily price guess");
  }

  return (await response.json()) as DailyPriceGuessAttemptResponse;
}
