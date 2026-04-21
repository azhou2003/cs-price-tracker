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
  saveLocalState,
  setWatchlistIcon,
} from "@/lib/storage";
import type { LocalState, MarketItem } from "@/lib/types";

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

  const watchlist = state.watchlist;

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
                  <Link
                    className="flex items-start justify-between gap-3 hover:text-sky-300"
                    href={`/item/${encodeURIComponent(item.marketHashName)}`}
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
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </article>
    </section>
  );
}
