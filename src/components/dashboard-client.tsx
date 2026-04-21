"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { fetchItemMeta, fetchItemPrice, searchItems } from "@/lib/api-client";
import {
  addToWatchlist,
  appendPriceSnapshot,
  DEFAULT_STATE,
  isTracked,
  loadLocalState,
  removeFromWatchlist,
  saveLocalState,
  setWatchlistIcon,
} from "@/lib/storage";
import type { LocalState, MarketItem, PriceSnapshot, WatchlistEntry } from "@/lib/types";

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

export function DashboardClient() {
  const [state, setState] = useState<LocalState>(DEFAULT_STATE);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MarketItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<WatchlistEntry | null>(null);
  const [activePrice, setActivePrice] = useState<PriceSnapshot | null>(null);
  const [isRefreshingActive, setIsRefreshingActive] = useState(false);
  const [activeError, setActiveError] = useState<string | null>(null);

  const watchlist = state.watchlist;
  const resolvedActiveItem = activeItem
    ? watchlist.find((item) => item.marketHashName === activeItem.marketHashName) ?? null
    : null;
  const activeHistory = activeItem
    ? state.historyByItem[activeItem.marketHashName] ?? []
    : [];

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setState(loadLocalState());
    }, 0);

    return () => {
      window.clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 3) {
      return;
    }

    const timeout = window.setTimeout(async () => {
      setIsSearching(true);
      setSearchError(null);

      try {
        const results = await searchItems(value);
        setSearchResults(results);
      } catch (requestError) {
        setSearchError(
          requestError instanceof Error
            ? requestError.message
            : "Failed to search items",
        );
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [query]);

  useEffect(() => {
    const missingIcons = watchlist.filter((item) => !item.iconUrl);
    if (missingIcons.length === 0) {
      return;
    }

    let cancelled = false;

    async function hydrateIcons() {
      let nextState = loadLocalState();
      let changed = false;

      for (const item of missingIcons) {
        try {
          const meta = await fetchItemMeta(item.marketHashName);
          if (!meta?.iconUrl) {
            continue;
          }

          nextState = setWatchlistIcon(nextState, item.marketHashName, meta.iconUrl);
          changed = true;
        } catch {
          // Ignore metadata failures and keep existing placeholder.
        }
      }

      if (!cancelled && changed) {
        saveLocalState(nextState);
        setState(nextState);
      }
    }

    void hydrateIcons();

    return () => {
      cancelled = true;
    };
  }, [watchlist]);

  const refreshWatchlist = async () => {
    if (watchlist.length === 0) {
      return;
    }

    setIsRefreshing(true);
    setError(null);

    try {
      let nextState = loadLocalState();

      for (const item of watchlist) {
        const snapshot = await fetchItemPrice(item.marketHashName);
        if (snapshot) {
          nextState = appendPriceSnapshot(nextState, snapshot);
        }
      }

      saveLocalState(nextState);
      setState(nextState);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to refresh watchlist",
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  const addItem = (item: MarketItem) => {
    const nextState = addToWatchlist(loadLocalState(), {
      marketHashName: item.marketHashName,
      displayName: item.displayName,
      iconUrl: item.iconUrl,
    });

    saveLocalState(nextState);
    setState(nextState);
  };

  const openItemModal = (item: WatchlistEntry) => {
    setActiveItem(item);
    setActiveError(null);
    setActivePrice(state.historyByItem[item.marketHashName]?.at(-1) ?? null);
  };

  const refreshActiveItem = async () => {
    if (!activeItem) {
      return;
    }

    setIsRefreshingActive(true);
    setActiveError(null);

    try {
      const snapshot = await fetchItemPrice(activeItem.marketHashName);
      if (!snapshot) {
        setActiveError("No price data available for this item right now.");
        return;
      }

      const nextState = appendPriceSnapshot(loadLocalState(), snapshot);
      saveLocalState(nextState);
      setState(nextState);
      setActivePrice(snapshot);
    } catch (requestError) {
      setActiveError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to refresh this item",
      );
    } finally {
      setIsRefreshingActive(false);
    }
  };

  const removeActiveItem = () => {
    if (!activeItem) {
      return;
    }

    const nextState = removeFromWatchlist(loadLocalState(), activeItem.marketHashName);
    saveLocalState(nextState);
    setState(nextState);
    setActiveItem(null);
    setActivePrice(null);
    setActiveError(null);
  };

  const graphPoints = (() => {
    if (activeHistory.length < 2) {
      return "";
    }

    const amounts = activeHistory.map((entry) => entry.amount);
    const min = Math.min(...amounts);
    const max = Math.max(...amounts);
    const range = max - min || 1;

    return activeHistory
      .map((entry, index) => {
        const x = (index / (activeHistory.length - 1)) * 100;
        const y = 100 - ((entry.amount - min) / range) * 100;
        return `${x},${y}`;
      })
      .join(" ");
  })();

  return (
    <section className="space-y-4">
      <article className="rounded-2xl border border-sky-300/15 bg-slate-900/70 p-6">
        <h2 className="text-xl font-semibold text-slate-50">Search items</h2>
        <p className="mt-2 text-sm text-slate-300">
          Type 3+ characters to search Steam and add items to your watchlist.
        </p>
        <input
          className="mt-4 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none focus:border-sky-400"
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);

            if (nextQuery.trim().length < 3) {
              setSearchResults([]);
              setSearchError(null);
              setIsSearching(false);
            }
          }}
          placeholder="AK-47 Redline"
          value={query}
        />

        {isSearching ? <p className="mt-3 text-sm text-slate-300">Searching...</p> : null}
        {searchError ? <p className="mt-3 text-sm text-rose-300">{searchError}</p> : null}

        {query.trim().length >= 3 && !isSearching && !searchError ? (
          searchResults.length === 0 ? (
            <p className="mt-3 text-sm text-slate-300">No items found.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {searchResults.map((item) => {
                const alreadyTracked = isTracked(state, item.marketHashName);

                return (
                  <li
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3"
                    key={item.marketHashName}
                  >
                    <Link
                      className="flex items-start gap-3 hover:text-sky-300"
                      href={`/item/${encodeURIComponent(item.marketHashName)}`}
                    >
                      {item.iconUrl ? (
                        <Image
                          alt={item.displayName}
                          className="rounded-md border border-slate-700 bg-slate-900"
                          height={44}
                          src={item.iconUrl}
                          width={44}
                        />
                      ) : (
                        <span className="h-11 w-11 rounded-md border border-slate-700 bg-slate-900" />
                      )}
                      <span>
                        <span className="block text-sm text-slate-50">{item.displayName}</span>
                        <span className="mt-1 block text-xs text-slate-400">
                          {item.startingPriceText ?? "N/A"}
                        </span>
                      </span>
                    </Link>
                    <button
                      className="rounded-full bg-sky-500 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
                      disabled={alreadyTracked}
                      onClick={() => {
                        addItem(item);
                      }}
                      type="button"
                    >
                      {alreadyTracked ? "Added" : "Add"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        ) : null}
      </article>

      <article className="rounded-2xl border border-sky-300/15 bg-slate-900/70 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-slate-50">Watchlist</h2>
          <button
            className="rounded-full bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400"
            onClick={() => {
              void refreshWatchlist();
            }}
            type="button"
          >
            {isRefreshing ? "Refreshing..." : "Refresh All"}
          </button>
        </div>

        {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}

        {watchlist.length === 0 ? (
          <p className="mt-3 text-sm text-slate-300">Your watchlist is empty. Add items above.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {watchlist.map((item) => {
              const latest = state.historyByItem[item.marketHashName]?.at(-1);

              return (
                <li
                  className="rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3"
                  key={item.marketHashName}
                >
                  <button
                    className="flex w-full items-start justify-between gap-3 text-left hover:text-sky-300"
                    onClick={() => {
                      openItemModal(item);
                    }}
                    type="button"
                  >
                    <span className="flex items-start gap-3">
                      {item.iconUrl ? (
                        <Image
                          alt={item.displayName}
                          className="rounded-md border border-slate-700 bg-slate-900"
                          height={44}
                          src={item.iconUrl}
                          width={44}
                        />
                      ) : (
                        <span className="h-11 w-11 rounded-md border border-slate-700 bg-slate-900" />
                      )}

                      <span>
                        <span className="block text-sm text-slate-50">{item.displayName}</span>
                        <span className="mt-1 block text-xs text-slate-400">
                          Added {formatTimestamp(item.addedAt)}
                        </span>
                      </span>
                    </span>
                    <span className="text-sm font-medium text-slate-200">
                      {latest
                        ? latest.lowestPriceText ?? formatUsd(latest.amount)
                        : "No price yet"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </article>

      {resolvedActiveItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4">
          <article className="w-full max-w-2xl rounded-2xl border border-sky-300/20 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                {resolvedActiveItem.iconUrl ? (
                  <Image
                    alt={resolvedActiveItem.displayName}
                    className="rounded-md border border-slate-700 bg-slate-900"
                    height={56}
                    src={resolvedActiveItem.iconUrl}
                    width={56}
                  />
                ) : (
                  <span className="h-14 w-14 rounded-md border border-slate-700 bg-slate-900" />
                )}
                <div>
                  <h3 className="text-lg font-semibold text-slate-50">{resolvedActiveItem.displayName}</h3>
                  <p className="mt-1 text-xs text-slate-400">
                    Added {formatTimestamp(resolvedActiveItem.addedAt)}
                  </p>
                </div>
              </div>

              <button
                className="rounded-full bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
                onClick={() => {
                  setActiveItem(null);
                  setActivePrice(null);
                  setActiveError(null);
                }}
                type="button"
              >
                Close
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className="rounded-full bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400"
                onClick={() => {
                  void refreshActiveItem();
                }}
                type="button"
              >
                {isRefreshingActive ? "Refreshing..." : "Refresh Price"}
              </button>
              <button
                className="rounded-full bg-rose-900/70 px-4 py-2 text-sm font-medium text-rose-100 hover:bg-rose-800"
                onClick={removeActiveItem}
                type="button"
              >
                Remove from Watchlist
              </button>
              <Link
                className="rounded-full bg-slate-800 px-4 py-2 text-sm text-slate-100 hover:bg-slate-700"
                href={`/item/${encodeURIComponent(resolvedActiveItem.marketHashName)}`}
              >
                Open Full Page
              </Link>
            </div>

            {activeError ? <p className="mt-3 text-sm text-rose-300">{activeError}</p> : null}

            <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950/60 p-4">
              <p className="text-sm text-slate-300">Latest local snapshot</p>
              <p className="mt-1 text-2xl font-semibold text-slate-50">
                {activePrice
                  ? activePrice.lowestPriceText ?? formatUsd(activePrice.amount)
                  : "No price yet"}
              </p>
            </div>

            <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950/60 p-4">
              <p className="text-sm text-slate-300">Local price graph</p>
              {activeHistory.length < 2 ? (
                <p className="mt-2 text-sm text-slate-400">
                  Need at least 2 snapshots. Refresh this item a few times to build a trend.
                </p>
              ) : (
                <div className="mt-3">
                  <svg className="h-36 w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                    <polyline
                      fill="none"
                      points={graphPoints}
                      stroke="rgb(56 189 248)"
                      strokeWidth="2"
                    />
                  </svg>
                  <p className="mt-2 text-xs text-slate-400">
                    {activeHistory.length} local snapshots shown (UTC)
                  </p>
                </div>
              )}
            </div>
          </article>
        </div>
      ) : null}
    </section>
  );
}
