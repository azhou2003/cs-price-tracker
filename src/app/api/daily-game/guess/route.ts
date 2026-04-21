import {
  getCorrectOrder,
  getOrCreateDailyChallenge,
  getUtcDayKeyNow,
} from "@/lib/daily-game";

type GuessRequest = {
  dayKey?: string;
  orderedMarketHashNames?: string[];
};

export async function POST(request: Request) {
  let body: GuessRequest;

  try {
    body = (await request.json()) as GuessRequest;
  } catch {
    return Response.json(
      {
        error: "Invalid request body",
      },
      { status: 400 },
    );
  }

  const requestedDay = body.dayKey?.trim() ?? "";
  const ordered = Array.isArray(body.orderedMarketHashNames)
    ? body.orderedMarketHashNames
    : [];

  if (!requestedDay) {
    return Response.json(
      {
        error: "Missing dayKey",
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
    const challenge = await getOrCreateDailyChallenge(requestedDay);
    const challengeSet = new Set(
      challenge.items.map((item) => item.marketHashName),
    );

    if (ordered.length !== challenge.items.length) {
      return Response.json(
        {
          error: "You must submit an order for all daily items.",
        },
        { status: 400 },
      );
    }

    const submittedSet = new Set(ordered);
    if (submittedSet.size !== ordered.length) {
      return Response.json(
        {
          error: "Submitted order contains duplicates.",
        },
        { status: 400 },
      );
    }

    for (const marketHashName of ordered) {
      if (!challengeSet.has(marketHashName)) {
        return Response.json(
          {
            error: "Submitted order has invalid items.",
          },
          { status: 400 },
        );
      }
    }

    const correctOrder = getCorrectOrder(challenge);
    const exactMatches = ordered.reduce((count, marketHashName, index) => {
      return correctOrder[index]?.marketHashName === marketHashName
        ? count + 1
        : count;
    }, 0);

    return Response.json(
      {
        dayKey: challenge.dayKey,
        submittedOrder: ordered,
        exactMatches,
        allCorrect: exactMatches === correctOrder.length,
        correctOrder: correctOrder.map((item, index) => ({
          rank: index + 1,
          marketHashName: item.marketHashName,
          displayName: item.displayName,
          iconUrl: item.iconUrl,
          amount: item.amount,
          priceText: item.lowestPriceText,
        })),
      },
      { status: 200 },
    );
  } catch {
    return Response.json(
      {
        error: "Unable to score today’s game right now. Please try again.",
      },
      { status: 502 },
    );
  }
}
