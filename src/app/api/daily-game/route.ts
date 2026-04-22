import {
  getOrCreateDailyChallenge,
  getUtcDayKeyNow,
} from "@/lib/daily-game";

export async function GET() {
  const dayKey = getUtcDayKeyNow();

  try {
    const challenge = await getOrCreateDailyChallenge(dayKey);

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
        error: "Unable to generate today’s game right now. Please try again.",
      },
      { status: 502 },
    );
  }
}
