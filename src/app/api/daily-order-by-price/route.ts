import type { NextRequest } from "next/server";

import { parseDailyGameItemTypesParam } from "@/lib/daily-game-item-types";
import {
  getOrCreateDailyOrderByPriceChallenge,
  getUtcDayKeyNow,
} from "@/lib/daily-games";

export async function GET(request: NextRequest) {
  const dayKey = getUtcDayKeyNow();
  const includedTypes = parseDailyGameItemTypesParam(
    request.nextUrl.searchParams.get("types"),
  );

  try {
    const challenge = await getOrCreateDailyOrderByPriceChallenge(dayKey, {
      includedTypes,
    });

    return Response.json(
      {
        dayKey: challenge.dayKey,
        generatedAt: challenge.generatedAt,
        expiresAt: challenge.expiresAt,
        includedTypes: challenge.includedTypes,
        instruction: "Order the 5 items from lowest to highest price.",
        items: challenge.items.map((item) => ({
          marketHashName: item.marketHashName,
          displayName: item.displayName,
          iconUrl: item.iconUrl,
          amount: item.amount,
          lowestPriceText: item.lowestPriceText,
        })),
      },
      { status: 200 },
    );
  } catch {
    return Response.json(
      {
        error: "Unable to generate today's daily order by price game right now. Please try again.",
      },
      { status: 502 },
    );
  }
}
