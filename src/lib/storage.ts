import type {
  DailyGameMode,
  DailyGameStatsState,
  LocalState,
  PriceSnapshot,
  WatchlistEntry,
} from "@/lib/types";
import {
  DEFAULT_DAILY_GAME_ITEM_TYPES,
  normalizeDailyGameItemTypes,
} from "@/lib/daily-game-item-types";

const STORAGE_KEY = "cs-price-tracker:v1";
const APP_STORAGE_KEY_PREFIX = "cs-price-tracker:";
const GAME_STORAGE_KEY_PREFIX = "cs-price-tracker:daily-";
const DAILY_ORDER_BY_PRICE_STATE_KEY = "cs-price-tracker:daily-order-by-price:v1";
const LEGACY_DAILY_GAME_STATE_KEY = "cs-price-tracker:daily-game:v1";
const DAILY_PRICE_GUESS_STATE_KEY = "cs-price-tracker:daily-price-guess:v1";
const DAILY_GAMES_STATS_KEY = "cs-price-tracker:daily-games-stats:v1";
const LEGACY_DAILY_GAME_STATS_KEY = "cs-price-tracker:daily-game-stats:v1";
const BACKUP_VERSION = 1;

const DEFAULT_STATE: LocalState = {
  watchlist: [],
  historyByItem: {},
  settings: {
    autoRefreshEnabled: true,
    refreshIntervalMinutes: 10,
    currency: "USD",
    dailyGameIncludedTypes: [...DEFAULT_DAILY_GAME_ITEM_TYPES],
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function clearAppStorageKeys() {
  if (typeof window === "undefined") {
    return;
  }

  const keys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(APP_STORAGE_KEY_PREFIX)) {
      keys.push(key);
    }
  }

  for (const key of keys) {
    window.localStorage.removeItem(key);
  }
}

function loadAppStorageSnapshot() {
  if (typeof window === "undefined") {
    return {};
  }

  const snapshot: Record<string, string> = {};
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !key.startsWith(APP_STORAGE_KEY_PREFIX)) {
      continue;
    }

    const value = window.localStorage.getItem(key);
    if (typeof value === "string") {
      snapshot[key] = value;
    }
  }

  return snapshot;
}

function toImportableAppStorageSnapshot(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const snapshot: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!key.startsWith(APP_STORAGE_KEY_PREFIX) || typeof entry !== "string") {
      continue;
    }

    snapshot[key] = entry;
  }

  return snapshot;
}

function applyAppStorageSnapshot(snapshot: Record<string, string>) {
  if (typeof window === "undefined") {
    return;
  }

  clearAppStorageKeys();

  for (const [key, value] of Object.entries(snapshot)) {
    window.localStorage.setItem(key, value);
  }
}

function toImportableLocalState(value: unknown): LocalState {
  if (!isRecord(value)) {
    return DEFAULT_STATE;
  }

  const parsedSettings = isRecord(value.settings) ? value.settings : {};
  const parsedWatchlist = Array.isArray(value.watchlist) ? value.watchlist : [];
  const parsedHistoryByItem = isRecord(value.historyByItem)
    ? (value.historyByItem as LocalState["historyByItem"])
    : {};

  return normalizeState({
    ...DEFAULT_STATE,
    ...value,
    watchlist: parsedWatchlist as LocalState["watchlist"],
    historyByItem: parsedHistoryByItem,
      settings: {
        ...DEFAULT_STATE.settings,
        ...parsedSettings,
        dailyGameIncludedTypes: normalizeDailyGameItemTypes(
          parsedSettings.dailyGameIncludedTypes,
        ),
      },
  });
}

function toImportableDailyStats(value: unknown): DailyGameStatsState {
  if (!isRecord(value)) {
    return DEFAULT_DAILY_GAME_STATS;
  }

  return {
    orderByPrice: {
      ...DEFAULT_DAILY_GAME_STATS.orderByPrice,
      ...(isRecord(value.orderByPrice) ? value.orderByPrice : {}),
    },
    priceGuess: {
      ...DEFAULT_DAILY_GAME_STATS.priceGuess,
      ...(isRecord(value.priceGuess) ? value.priceGuess : {}),
    },
  };
}

type ExportPayload = {
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  data: {
    localState: LocalState;
    dailyGameStats: DailyGameStatsState;
    appStorage: Record<string, string>;
  };
};

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
        dailyGameIncludedTypes: normalizeDailyGameItemTypes(
          parsed.settings?.dailyGameIncludedTypes,
        ),
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

  const gameKeys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(GAME_STORAGE_KEY_PREFIX)) {
      gameKeys.push(key);
    }
  }

  for (const key of gameKeys) {
    window.localStorage.removeItem(key);
  }
}

export function loadDailyGameStats(): DailyGameStatsState {
  if (typeof window === "undefined") {
    return DEFAULT_DAILY_GAME_STATS;
  }

  const raw =
    window.localStorage.getItem(DAILY_GAMES_STATS_KEY) ??
    window.localStorage.getItem(LEGACY_DAILY_GAME_STATS_KEY);
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

  window.localStorage.setItem(DAILY_GAMES_STATS_KEY, JSON.stringify(stats));
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

export function exportBackupPayload(): ExportPayload {
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      localState: loadLocalState(),
      dailyGameStats: loadDailyGameStats(),
      appStorage: loadAppStorageSnapshot(),
    },
  };
}

export function importBackupPayload(payload: unknown) {
  if (typeof window === "undefined") {
    return {
      ok: false as const,
      error: "Import is available only in the browser.",
    };
  }

  if (!isRecord(payload)) {
    return {
      ok: false as const,
      error: "Invalid backup file format.",
    };
  }

  if (payload.version !== BACKUP_VERSION) {
    return {
      ok: false as const,
      error: "Unsupported backup version.",
    };
  }

  if (!isRecord(payload.data)) {
    return {
      ok: false as const,
      error: "Backup data is missing.",
    };
  }

  const appStorageSnapshot = toImportableAppStorageSnapshot(payload.data.appStorage);
  if (appStorageSnapshot) {
    applyAppStorageSnapshot(appStorageSnapshot);

    return {
      ok: true as const,
    };
  }

  const nextLocalState = toImportableLocalState(payload.data.localState);
  const nextStats = toImportableDailyStats(payload.data.dailyGameStats);

  saveLocalState(nextLocalState);
  saveDailyGameStats(nextStats);

  return {
    ok: true as const,
  };
}

export {
  DAILY_GAMES_STATS_KEY,
  DAILY_ORDER_BY_PRICE_STATE_KEY,
  DAILY_PRICE_GUESS_STATE_KEY,
  DEFAULT_STATE,
  LEGACY_DAILY_GAME_STATE_KEY,
  STORAGE_KEY,
};
