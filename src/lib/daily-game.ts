import { fetchSteamPrice, searchSteamItems } from "@/lib/steam";

type DailyGamePriceEntry = {
  marketHashName: string;
  displayName: string;
  iconUrl?: string;
  amount: number;
  lowestPriceText?: string;
};

export type DailyGameChallenge = {
  dayKey: string;
  generatedAt: string;
  expiresAt: string;
  items: DailyGamePriceEntry[];
};

export type DailyPriceGuessChallenge = {
  dayKey: string;
  generatedAt: string;
  expiresAt: string;
  item: DailyGamePriceEntry;
};

const DAILY_ITEM_COUNT = 5;

const QUERY_POOL = [
  "AK-47",
  "AWP",
  "M4A1-S",
  "M4A4",
  "Desert Eagle",
  "USP-S",
  "Glock-18",
  "P250",
  "FAMAS",
  "Galil AR",
  "MAC-10",
  "MP9",
  "UMP-45",
  "P90",
  "Five-SeveN",
  "CZ75-Auto",
  "SSG 08",
  "AUG",
  "SG 553",
  "Nova",
  "XM1014",
];

const DAILY_CACHE = new Map<string, DailyGameChallenge>();
const DAILY_PRICE_GUESS_CACHE = new Map<string, DailyPriceGuessChallenge>();

function getUtcDayKey(value = new Date()) {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dayBounds(dayKey: string) {
  const start = new Date(`${dayKey}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return {
    start,
    end,
  };
}

function seedFromText(value: string) {
  let seed = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    seed ^= value.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }

  return seed >>> 0;
}

function createRng(seed: number) {
  let value = seed || 1;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let temp = Math.imul(value ^ (value >>> 15), 1 | value);
    temp ^= temp + Math.imul(temp ^ (temp >>> 7), 61 | temp);
    return ((temp ^ (temp >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], seedText: string) {
  const next = [...items];
  const rng = createRng(seedFromText(seedText));

  for (let index = next.length - 1; index > 0; index -= 1) {
    const target = Math.floor(rng() * (index + 1));
    [next[index], next[target]] = [next[target], next[index]];
  }

  return next;
}

async function getPricedCandidates(dayKey: string, targetCount: number) {
  const orderedQueries = shuffle(QUERY_POOL, `${dayKey}:queries`);
  const candidates = new Map<
    string,
    { marketHashName: string; displayName: string; iconUrl?: string }
  >();

  for (const query of orderedQueries) {
    const results = await searchSteamItems(query, 24);
    for (const result of shuffle(results, `${dayKey}:result:${query}`)) {
      if (!result.marketHashName || candidates.has(result.marketHashName)) {
        continue;
      }

      candidates.set(result.marketHashName, {
        marketHashName: result.marketHashName,
        displayName: result.displayName,
        iconUrl: result.iconUrl,
      });
    }

    if (candidates.size >= 28) {
      break;
    }
  }

  const picked: DailyGamePriceEntry[] = [];
  const shuffledCandidates = shuffle(
    [...candidates.values()],
    `${dayKey}:candidates`,
  );

  for (const candidate of shuffledCandidates) {
    if (picked.length >= targetCount) {
      break;
    }

    const price = await fetchSteamPrice(candidate.marketHashName);
    if (!price) {
      continue;
    }

    if (picked.some((item) => item.marketHashName === candidate.marketHashName)) {
      continue;
    }

    picked.push({
      marketHashName: candidate.marketHashName,
      displayName: candidate.displayName,
      iconUrl: candidate.iconUrl,
      amount: price.amount,
      lowestPriceText: price.lowestPriceText,
    });
  }

  return picked;
}

async function buildDailyChallenge(dayKey: string): Promise<DailyGameChallenge> {
  const { start, end } = dayBounds(dayKey);
  const picked = await getPricedCandidates(dayKey, DAILY_ITEM_COUNT);

  if (picked.length < DAILY_ITEM_COUNT) {
    throw new Error("Unable to build daily game with five priced items");
  }

  const finalItems = shuffle(picked, `${dayKey}:final-order`);

  return {
    dayKey,
    generatedAt: start.toISOString(),
    expiresAt: end.toISOString(),
    items: finalItems,
  };
}

async function buildDailyPriceGuessChallenge(
  dayKey: string,
): Promise<DailyPriceGuessChallenge> {
  const { start, end } = dayBounds(dayKey);
  const picked = await getPricedCandidates(`${dayKey}:price-guess`, 1);

  if (picked.length === 0) {
    throw new Error("Unable to build daily price guess game");
  }

  return {
    dayKey,
    generatedAt: start.toISOString(),
    expiresAt: end.toISOString(),
    item: picked[0],
  };
}

export async function getOrCreateDailyChallenge(dayKey = getUtcDayKey()) {
  const cached = DAILY_CACHE.get(dayKey);
  if (cached) {
    return cached;
  }

  const challenge = await buildDailyChallenge(dayKey);
  DAILY_CACHE.clear();
  DAILY_CACHE.set(dayKey, challenge);
  return challenge;
}

export function getCorrectOrder(challenge: DailyGameChallenge) {
  return [...challenge.items].sort((left, right) => {
    if (left.amount === right.amount) {
      return left.marketHashName.localeCompare(right.marketHashName);
    }

    return left.amount - right.amount;
  });
}

export async function getOrCreateDailyPriceGuessChallenge(dayKey = getUtcDayKey()) {
  const cached = DAILY_PRICE_GUESS_CACHE.get(dayKey);
  if (cached) {
    return cached;
  }

  const challenge = await buildDailyPriceGuessChallenge(dayKey);
  DAILY_PRICE_GUESS_CACHE.clear();
  DAILY_PRICE_GUESS_CACHE.set(dayKey, challenge);
  return challenge;
}

export function getUtcDayKeyNow() {
  return getUtcDayKey();
}
