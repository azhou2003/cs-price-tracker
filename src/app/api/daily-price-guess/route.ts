import {
  getOrCreateDailyPriceGuessChallenge,
  getUtcDayKeyNow,
} from "@/lib/daily-game";

const MAX_ATTEMPTS = 5;
const TOLERANCE_USD = 0.5;

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
        toleranceUsd: TOLERANCE_USD,
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
        error: "Unable to generate today’s price game right now. Please try again.",
      },
      { status: 502 },
    );
  }
}
