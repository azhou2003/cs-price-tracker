import type { LocalState } from "@/lib/types";

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

export { DEFAULT_STATE, STORAGE_KEY };
