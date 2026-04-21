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

export type HistoryPoint = {
  timestamp: string;
  amount: number;
  volume?: number;
};

export type WatchlistEntry = {
  marketHashName: string;
  displayName: string;
  iconUrl?: string;
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

export type DailyGameMode = "order-by-price" | "price-guess";

export type DailyGameStatsEntry = {
  played: number;
  wins: number;
  currentStreak: number;
  bestStreak: number;
  lastPlayedDay?: string;
  lastWinDay?: string;
};

export type DailyGameStatsState = {
  orderByPrice: DailyGameStatsEntry;
  priceGuess: DailyGameStatsEntry;
};

export type DailyGameItem = {
  marketHashName: string;
  displayName: string;
  iconUrl?: string;
};

export type DailyGameChallengeResponse = {
  dayKey: string;
  generatedAt: string;
  expiresAt: string;
  instruction: string;
  items: DailyGameItem[];
};

export type DailyGameResultItem = DailyGameItem & {
  rank: number;
  amount: number;
  priceText?: string;
};

export type DailyGameGuessResponse = {
  dayKey: string;
  submittedOrder: string[];
  exactMatches: number;
  allCorrect: boolean;
  correctOrder: DailyGameResultItem[];
};

export type DailyPriceGuessChallengeResponse = {
  dayKey: string;
  generatedAt: string;
  expiresAt: string;
  maxAttempts: number;
  toleranceUsd: number;
  item: DailyGameItem;
};

export type DailyPriceGuessAttemptResponse = {
  dayKey: string;
  guess: number;
  toleranceUsd: number;
  difference: number;
  isCorrect: boolean;
  direction: "higher" | "lower" | "exact";
  proximityScore: number;
  actualAmount: number;
  actualPriceText?: string;
};
