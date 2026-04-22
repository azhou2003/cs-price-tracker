import {
  getOrCreateDailyOrderByPriceChallenge,
  getUtcDayKeyNow,
} from "@/lib/daily-games";

export async function GET() {
  const dayKey = getUtcDayKeyNow();

  try {
    const challenge = await getOrCreateDailyOrderByPriceChallenge(dayKey);

    return Response.json(
      {
        dayKey: challenge.dayKey,
        generatedAt: challenge.generatedAt,
        expiresAt: challenge.expiresAt,
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
