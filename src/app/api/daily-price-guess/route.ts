import {
  getOrCreateDailyPriceGuessChallenge,
  getUtcDayKeyNow,
} from "@/lib/daily-games";

const MAX_ATTEMPTS = 5;
const TOLERANCE_PERCENT = 0.05;

export async function GET() {
  const dayKey = getUtcDayKeyNow();

  try {
    const challenge = await getOrCreateDailyPriceGuessChallenge(dayKey);

    return Response.json(
      {
        dayKey: challenge.dayKey,
        generatedAt: challenge.generatedAt,
        expiresAt: challenge.expiresAt,
        maxAttempts: MAX_ATTEMPTS,
        toleranceUsd: challenge.item.amount * TOLERANCE_PERCENT,
        actualAmount: challenge.item.amount,
        actualPriceText: challenge.item.lowestPriceText,
        item: {
          marketHashName: challenge.item.marketHashName,
          displayName: challenge.item.displayName,
          iconUrl: challenge.item.iconUrl,
        },
      },
      { status: 200 },
    );
  } catch {
    return Response.json(
      {
        error: "Unable to generate today's daily price guess game right now. Please try again.",
      },
      { status: 502 },
    );
  }
}
