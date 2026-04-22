import {
  classifyDailyGameItemType,
  dailyGameItemTypesKey,
  DEFAULT_DAILY_GAME_ITEM_TYPES,
  normalizeDailyGameItemTypes,
} from "@/lib/daily-game-item-types";
import { fetchSteamMarketSlice, fetchSteamPrice } from "@/lib/steam";
import type { DailyGameItemType } from "@/lib/types";

type DailyGamePriceEntry = {
  marketHashName: string;
  displayName: string;
  iconUrl?: string;
  marketType?: string;
  amount: number;
  lowestPriceText?: string;
};

export type DailyOrderByPriceChallenge = {
  dayKey: string;
  generatedAt: string;
  expiresAt: string;
  includedTypes: DailyGameItemType[];
  items: DailyGamePriceEntry[];
};

export type DailyPriceGuessChallenge = {
  dayKey: string;
  generatedAt: string;
  expiresAt: string;
  includedTypes: DailyGameItemType[];
  item: DailyGamePriceEntry;
};

const DAILY_ITEM_COUNT = 5;
const STEAM_MARKET_PAGE_SIZE = 10;
const MAX_MARKET_OFFSETS_TO_SCAN = 1400;

type DailyGameSelectionOptions = {
  includedTypes: DailyGameItemType[];
};

const DAILY_ORDER_BY_PRICE_CACHE = new Map<string, DailyOrderByPriceChallenge>();
const DAILY_PRICE_GUESS_CACHE = new Map<string, DailyPriceGuessChallenge>();

function toSelectionOptions(
  options?: Partial<DailyGameSelectionOptions>,
): DailyGameSelectionOptions {
  return {
    includedTypes: normalizeDailyGameItemTypes(
      options?.includedTypes ?? DEFAULT_DAILY_GAME_ITEM_TYPES,
    ),
  };
}

function createChallengeCacheKey(dayKey: string, options: DailyGameSelectionOptions) {
  return `${dayKey}|${dailyGameItemTypesKey(options.includedTypes)}`;
}

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

function gcd(left: number, right: number) {
  let a = Math.abs(left);
  let b = Math.abs(right);

  while (b !== 0) {
    const next = a % b;
    a = b;
    b = next;
  }

  return a;
}

function buildDeterministicMarketOffsets(dayKey: string, totalCount: number, limit: number) {
  if (totalCount <= 0) {
    return [];
  }

  if (totalCount === 1) {
    return [0];
  }

  const start = seedFromText(`${dayKey}:market:start`) % totalCount;
  let step = (seedFromText(`${dayKey}:market:step`) % (totalCount - 1)) + 1;

  while (gcd(step, totalCount) !== 1) {
    step = (step + 1) % totalCount;
    if (step === 0) {
      step = 1;
    }
  }

  const max = Math.min(totalCount, limit);
  const offsets: number[] = [];

  for (let index = 0; index < max; index += 1) {
    offsets.push((start + index * step) % totalCount);
  }

  return offsets;
}

async function getPricedCandidates(
  dayKey: string,
  targetCount: number,
  options: DailyGameSelectionOptions,
) {
  const picked: DailyGamePriceEntry[] = [];
  const requestedTypes = new Set(options.includedTypes);
  const seenHashes = new Set<string>();

  const pageCache = new Map<number, Awaited<ReturnType<typeof fetchSteamMarketSlice>>>();
  const firstPage = await fetchSteamMarketSlice(0, STEAM_MARKET_PAGE_SIZE);
  pageCache.set(0, firstPage);

  if (firstPage.totalCount <= 0) {
    return picked;
  }

  const offsets = buildDeterministicMarketOffsets(
    dayKey,
    firstPage.totalCount,
    MAX_MARKET_OFFSETS_TO_SCAN,
  );

  for (const offset of offsets) {
    if (picked.length >= targetCount) {
      break;
    }

    const pageStart =
      Math.floor(offset / STEAM_MARKET_PAGE_SIZE) * STEAM_MARKET_PAGE_SIZE;
    const pageOffset = offset - pageStart;

    let page = pageCache.get(pageStart);
    if (!page) {
      page = await fetchSteamMarketSlice(pageStart, STEAM_MARKET_PAGE_SIZE);
      pageCache.set(pageStart, page);
    }

    const candidate = page.results[pageOffset];
    if (!candidate || !candidate.marketHashName || seenHashes.has(candidate.marketHashName)) {
      continue;
    }
    seenHashes.add(candidate.marketHashName);

    const classifiedType = classifyDailyGameItemType(candidate.marketType);
    if (!requestedTypes.has(classifiedType)) {
      continue;
    }

    const price = await fetchSteamPrice(candidate.marketHashName);
    if (!price) {
      continue;
    }

    picked.push({
      marketHashName: candidate.marketHashName,
      displayName: candidate.displayName,
      iconUrl: candidate.iconUrl,
      marketType: candidate.marketType,
      amount: price.amount,
      lowestPriceText: price.lowestPriceText,
    });
  }

  return picked;
}

async function buildDailyOrderByPriceChallenge(
  dayKey: string,
  options: DailyGameSelectionOptions,
): Promise<DailyOrderByPriceChallenge> {
  const { start, end } = dayBounds(dayKey);
  const picked = await getPricedCandidates(dayKey, DAILY_ITEM_COUNT, options);

  if (picked.length < DAILY_ITEM_COUNT) {
    throw new Error("Unable to build daily order by price game with five priced items");
  }

  const finalItems = shuffle(picked, `${dayKey}:final-order`);

  return {
    dayKey,
    generatedAt: start.toISOString(),
    expiresAt: end.toISOString(),
    includedTypes: options.includedTypes,
    items: finalItems,
  };
}

async function buildDailyPriceGuessChallenge(
  dayKey: string,
  options: DailyGameSelectionOptions,
): Promise<DailyPriceGuessChallenge> {
  const { start, end } = dayBounds(dayKey);
  const picked = await getPricedCandidates(`${dayKey}:price-guess`, 1, options);

  if (picked.length === 0) {
    throw new Error("Unable to build daily price guess game");
  }

  return {
    dayKey,
    generatedAt: start.toISOString(),
    expiresAt: end.toISOString(),
    includedTypes: options.includedTypes,
    item: picked[0],
  };
}

export async function getOrCreateDailyOrderByPriceChallenge(
  dayKey = getUtcDayKey(),
  options?: Partial<DailyGameSelectionOptions>,
) {
  const resolvedOptions = toSelectionOptions(options);
  const cacheKey = createChallengeCacheKey(dayKey, resolvedOptions);

  const cached = DAILY_ORDER_BY_PRICE_CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }

  const challenge = await buildDailyOrderByPriceChallenge(dayKey, resolvedOptions);
  DAILY_ORDER_BY_PRICE_CACHE.clear();
  DAILY_ORDER_BY_PRICE_CACHE.set(cacheKey, challenge);
  return challenge;
}

export function getDailyOrderByPriceCorrectOrder(challenge: DailyOrderByPriceChallenge) {
  return [...challenge.items].sort((left, right) => {
    if (left.amount === right.amount) {
      return left.marketHashName.localeCompare(right.marketHashName);
    }

    return left.amount - right.amount;
  });
}

export async function getOrCreateDailyPriceGuessChallenge(
  dayKey = getUtcDayKey(),
  options?: Partial<DailyGameSelectionOptions>,
) {
  const resolvedOptions = toSelectionOptions(options);
  const cacheKey = createChallengeCacheKey(dayKey, resolvedOptions);

  const cached = DAILY_PRICE_GUESS_CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }

  const challenge = await buildDailyPriceGuessChallenge(dayKey, resolvedOptions);
  DAILY_PRICE_GUESS_CACHE.clear();
  DAILY_PRICE_GUESS_CACHE.set(cacheKey, challenge);
  return challenge;
}

export function getUtcDayKeyNow() {
  return getUtcDayKey();
}
