export type CurrencyCode = "USD";

export type MarketItem = {
  marketHashName: string;
  displayName: string;
  iconUrl?: string;
  listingCount?: number;
  startingPrice?: number;
  startingPriceText?: string;
};

export type PriceSnapshot = {
  marketHashName: string;
  amount: number;
  currency: CurrencyCode;
  timestamp: string;
  source: "steam";
  lowestPriceText?: string;
  medianPriceText?: string;
  volume?: number;
};

export type WatchlistEntry = {
  marketHashName: string;
  displayName: string;
  addedAt: string;
  lowAlert?: number;
  highAlert?: number;
};

export type UserSettings = {
  refreshIntervalMinutes: number;
  currency: CurrencyCode;
  notificationsEnabled: boolean;
};

export type LocalState = {
  watchlist: WatchlistEntry[];
  historyByItem: Record<string, PriceSnapshot[]>;
  settings: UserSettings;
};
