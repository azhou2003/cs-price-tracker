import type {
  DailyGameMode,
  DailyGameStatsState,
  LocalState,
  PriceSnapshot,
  WatchlistEntry,
} from "@/lib/types";

const STORAGE_KEY = "cs-price-tracker:v1";
const DAILY_GAME_STATE_KEY = "cs-price-tracker:daily-game:v1";
const DAILY_PRICE_GUESS_STATE_KEY = "cs-price-tracker:daily-price-guess:v1";
const DAILY_GAME_STATS_KEY = "cs-price-tracker:daily-game-stats:v1";

const DEFAULT_STATE: LocalState = {
  watchlist: [],
  historyByItem: {},
  settings: {
    refreshIntervalMinutes: 10,
    currency: "USD",
    notificationsEnabled: false,
  },
};

const DEFAULT_DAILY_GAME_STATS: DailyGameStatsState = {
  orderByPrice: {
    played: 0,
    wins: 0,
    currentStreak: 0,
    bestStreak: 0,
  },
  priceGuess: {
    played: 0,
    wins: 0,
    currentStreak: 0,
    bestStreak: 0,
  },
};

function normalizeState(state: LocalState, maxPoints = 120): LocalState {
  const tracked = new Set(state.watchlist.map((item) => item.marketHashName));
  const historyByItem: LocalState["historyByItem"] = {};

  for (const [marketHashName, snapshots] of Object.entries(state.historyByItem)) {
    if (!tracked.has(marketHashName) || !Array.isArray(snapshots)) {
      continue;
    }

    historyByItem[marketHashName] = snapshots.slice(-maxPoints);
  }

  return {
    ...state,
    historyByItem,
  };
}

function parseUtcDay(dayKey: string) {
  const date = new Date(`${dayKey}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isPreviousUtcDay(previousDay: string | undefined, nextDay: string) {
  if (!previousDay) {
    return false;
  }

  const previous = parseUtcDay(previousDay);
  const next = parseUtcDay(nextDay);
  if (!previous || !next) {
    return false;
  }

  const diffMs = next.getTime() - previous.getTime();
  return diffMs === 24 * 60 * 60 * 1000;
}

function toStatsEntryKey(mode: DailyGameMode) {
  return mode === "order-by-price" ? "orderByPrice" : "priceGuess";
}

export function loadLocalState(): LocalState {
  if (typeof window === "undefined") {
    return DEFAULT_STATE;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return DEFAULT_STATE;
  }

  try {
    const parsed = JSON.parse(raw) as LocalState;
    return normalizeState({
      ...DEFAULT_STATE,
      ...parsed,
      settings: {
        ...DEFAULT_STATE.settings,
        ...parsed.settings,
      },
    });
  } catch {
    return DEFAULT_STATE;
  }
}

export function saveLocalState(state: LocalState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state)));
}

export function clearLocalState() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem(DAILY_GAME_STATE_KEY);
  window.localStorage.removeItem(DAILY_PRICE_GUESS_STATE_KEY);
  window.localStorage.removeItem(DAILY_GAME_STATS_KEY);
}

export function loadDailyGameStats(): DailyGameStatsState {
  if (typeof window === "undefined") {
    return DEFAULT_DAILY_GAME_STATS;
  }

  const raw = window.localStorage.getItem(DAILY_GAME_STATS_KEY);
  if (!raw) {
    return DEFAULT_DAILY_GAME_STATS;
  }

  try {
    const parsed = JSON.parse(raw) as DailyGameStatsState;
    return {
      orderByPrice: {
        ...DEFAULT_DAILY_GAME_STATS.orderByPrice,
        ...parsed.orderByPrice,
      },
      priceGuess: {
        ...DEFAULT_DAILY_GAME_STATS.priceGuess,
        ...parsed.priceGuess,
      },
    };
  } catch {
    return DEFAULT_DAILY_GAME_STATS;
  }
}

export function saveDailyGameStats(stats: DailyGameStatsState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(DAILY_GAME_STATS_KEY, JSON.stringify(stats));
}

export function recordDailyGameResult(
  mode: DailyGameMode,
  dayKey: string,
  won: boolean,
) {
  const stats = loadDailyGameStats();
  const key = toStatsEntryKey(mode);
  const current = stats[key];

  if (current.lastPlayedDay === dayKey) {
    return stats;
  }

  const nextEntry = {
    ...current,
    played: current.played + 1,
    lastPlayedDay: dayKey,
  };

  if (won) {
    const nextStreak = isPreviousUtcDay(current.lastWinDay, dayKey)
      ? current.currentStreak + 1
      : 1;

    nextEntry.wins = current.wins + 1;
    nextEntry.currentStreak = nextStreak;
    nextEntry.bestStreak = Math.max(current.bestStreak, nextStreak);
    nextEntry.lastWinDay = dayKey;
  } else {
    nextEntry.currentStreak = 0;
  }

  const nextStats: DailyGameStatsState = {
    ...stats,
    [key]: nextEntry,
  };

  saveDailyGameStats(nextStats);
  return nextStats;
}

export function isTracked(state: LocalState, marketHashName: string) {
  return state.watchlist.some((item) => item.marketHashName === marketHashName);
}

export function addToWatchlist(
  state: LocalState,
  entry: Pick<WatchlistEntry, "marketHashName" | "displayName" | "iconUrl">,
): LocalState {
  if (isTracked(state, entry.marketHashName)) {
    return state;
  }

  return {
    ...state,
    watchlist: [
      ...state.watchlist,
      {
        ...entry,
        addedAt: new Date().toISOString(),
      },
    ],
  };
}

export function removeFromWatchlist(
  state: LocalState,
  marketHashName: string,
): LocalState {
  const nextHistoryByItem = { ...state.historyByItem };
  delete nextHistoryByItem[marketHashName];

  return {
    ...state,
    watchlist: state.watchlist.filter((item) => item.marketHashName !== marketHashName),
    historyByItem: nextHistoryByItem,
  };
}

export function setWatchlistIcon(
  state: LocalState,
  marketHashName: string,
  iconUrl: string,
): LocalState {
  return {
    ...state,
    watchlist: state.watchlist.map((item) =>
      item.marketHashName === marketHashName
        ? {
            ...item,
            iconUrl,
          }
        : item,
    ),
  };
}

export function updateWatchlistAlerts(
  state: LocalState,
  marketHashName: string,
  alerts: Pick<WatchlistEntry, "lowAlert" | "highAlert">,
): LocalState {
  return {
    ...state,
    watchlist: state.watchlist.map((item) =>
      item.marketHashName === marketHashName
        ? {
            ...item,
            lowAlert: alerts.lowAlert,
            highAlert: alerts.highAlert,
          }
        : item,
    ),
  };
}

export function appendPriceSnapshot(
  state: LocalState,
  snapshot: PriceSnapshot,
  maxPoints = 120,
): LocalState {
  const current = state.historyByItem[snapshot.marketHashName] ?? [];
  const last = current.at(-1);

  if (last && last.amount === snapshot.amount) {
    return state;
  }

  const nextHistory = [...current, snapshot].slice(-maxPoints);

  return {
    ...state,
    historyByItem: {
      ...state.historyByItem,
      [snapshot.marketHashName]: nextHistory,
    },
  };
}

export function updateSettings(
  state: LocalState,
  settings: Partial<LocalState["settings"]>,
): LocalState {
  return {
    ...state,
    settings: {
      ...state.settings,
      ...settings,
    },
  };
}

export {
  DAILY_GAME_STATE_KEY,
  DAILY_GAME_STATS_KEY,
  DAILY_PRICE_GUESS_STATE_KEY,
  DEFAULT_STATE,
  STORAGE_KEY,
};
