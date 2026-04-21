import {
  getOrCreateDailyPriceGuessChallenge,
  getUtcDayKeyNow,
} from "@/lib/daily-game";

const TOLERANCE_USD = 0.5;

type GuessRequest = {
  dayKey?: string;
  guess?: number;
};

function getProximityScore(guess: number, target: number) {
  const diff = Math.abs(target - guess);
  const scale = Math.max(target * 0.25, 1);
  const normalized = Math.min(diff / scale, 1);
  return 1 - normalized;
}

export async function POST(request: Request) {
  let body: GuessRequest;

  try {
    body = (await request.json()) as GuessRequest;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const requestedDay = body.dayKey?.trim() ?? "";
  const guess = typeof body.guess === "number" ? body.guess : Number.NaN;

  if (!requestedDay) {
    return Response.json({ error: "Missing dayKey" }, { status: 400 });
  }

  if (!Number.isFinite(guess) || guess < 0) {
    return Response.json(
      {
        error: "Guess must be a valid non-negative number",
      },
      { status: 400 },
    );
  }

  const today = getUtcDayKeyNow();
  if (requestedDay !== today) {
    return Response.json(
      {
        error: "This daily game is no longer active.",
        currentDayKey: today,
      },
      { status: 409 },
    );
  }

  try {
    const challenge = await getOrCreateDailyPriceGuessChallenge(requestedDay);
    const target = challenge.item.amount;
    const difference = Math.abs(target - guess);
    const isCorrect = difference <= TOLERANCE_USD;

    return Response.json(
      {
        dayKey: challenge.dayKey,
        guess,
        toleranceUsd: TOLERANCE_USD,
        difference,
        isCorrect,
        direction: isCorrect ? "exact" : guess < target ? "higher" : "lower",
        proximityScore: getProximityScore(guess, target),
        actualAmount: target,
        actualPriceText: challenge.item.lowestPriceText,
      },
      { status: 200 },
    );
  } catch {
    return Response.json(
      {
        error: "Unable to score today’s price game right now. Please try again.",
      },
      { status: 502 },
    );
  }
}
