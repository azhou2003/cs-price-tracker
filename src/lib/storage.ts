import type { LocalState, PriceSnapshot, WatchlistEntry } from "@/lib/types";

const STORAGE_KEY = "cs-price-tracker:v1";

const DEFAULT_STATE: LocalState = {
  watchlist: [],
  historyByItem: {},
  settings: {
    refreshIntervalMinutes: 10,
    currency: "USD",
    notificationsEnabled: false,
  },
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
    return {
      ...DEFAULT_STATE,
      ...parsed,
      settings: {
        ...DEFAULT_STATE.settings,
        ...parsed.settings,
      },
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export function saveLocalState(state: LocalState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function isTracked(state: LocalState, marketHashName: string) {
  return state.watchlist.some((item) => item.marketHashName === marketHashName);
}

export function addToWatchlist(
  state: LocalState,
  entry: Pick<WatchlistEntry, "marketHashName" | "displayName">,
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
  return {
    ...state,
    watchlist: state.watchlist.filter((item) => item.marketHashName !== marketHashName),
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

export { DEFAULT_STATE, STORAGE_KEY };
