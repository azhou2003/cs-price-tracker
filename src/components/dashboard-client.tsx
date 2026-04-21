"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import { WatchlistTargetShowcase } from "@/components/watchlist-target-showcase";
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
  updateWatchlistAlerts,
} from "@/lib/storage";
import type { LocalState, MarketItem, PriceSnapshot, WatchlistEntry } from "@/lib/types";

type WatchlistFilter = "all" | "triggered" | "below" | "above";
type AlertStatus = "none" | "below" | "above" | "both";

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

function toAlertValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

function getAlertStatus(item: WatchlistEntry, latestAmount: number | null): AlertStatus {
  if (latestAmount == null) {
    return "none";
  }

  const isBelow = item.lowAlert != null && latestAmount <= item.lowAlert;
  const isAbove = item.highAlert != null && latestAmount >= item.highAlert;

  if (isBelow && isAbove) {
    return "both";
  }

  if (isBelow) {
    return "below";
  }

  if (isAbove) {
    return "above";
  }

  return "none";
}

function getStatusBadge(status: AlertStatus) {
  if (status === "below") {
    return {
      label: "Below lower target",
      className:
        "border-[#3d5f2f] bg-gradient-to-b from-[#2d4723] to-[#243a1d] text-[#b7d88d]",
    };
  }

  if (status === "above") {
    return {
      label: "Above upper target",
      className:
        "border-[#6a5330] bg-gradient-to-b from-[#4f3e24] to-[#3f311d] text-[#e8c78d]",
    };
  }

  if (status === "both") {
    return {
      label: "Outside both targets",
      className:
        "border-[#6b4040] bg-gradient-to-b from-[#4f2c2c] to-[#3f2424] text-[#e9b0b0]",
    };
  }

  return {
    label: "In range",
    className: "border-[#3a4f64] bg-gradient-to-b from-[#233346] to-[#1a2838] text-[#a9bdd0]",
  };
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
  const [watchlistQuery, setWatchlistQuery] = useState("");
  const [watchlistFilter, setWatchlistFilter] = useState<WatchlistFilter>("all");
  const [lowAlertDraft, setLowAlertDraft] = useState("");
  const [highAlertDraft, setHighAlertDraft] = useState("");

  const watchlist = state.watchlist;
  const resolvedActiveItem = activeItem
    ? watchlist.find((item) => item.marketHashName === activeItem.marketHashName) ?? null
    : null;
  const activeHistory = activeItem
    ? state.historyByItem[activeItem.marketHashName] ?? []
    : [];

  const filteredWatchlist = useMemo(() => {
    const loweredQuery = watchlistQuery.trim().toLowerCase();

    return watchlist.filter((item) => {
      if (loweredQuery && !item.displayName.toLowerCase().includes(loweredQuery)) {
        return false;
      }

      const latest = state.historyByItem[item.marketHashName]?.at(-1) ?? null;
      const status = getAlertStatus(item, latest?.amount ?? null);

      if (watchlistFilter === "triggered") {
        return status !== "none";
      }

      if (watchlistFilter === "below") {
        return status === "below" || status === "both";
      }

      if (watchlistFilter === "above") {
        return status === "above" || status === "both";
      }

      return true;
    });
  }, [watchlistFilter, watchlistQuery, state.historyByItem, watchlist]);

  const triggeredCount = useMemo(() => {
    return watchlist.filter((item) => {
      const latest = state.historyByItem[item.marketHashName]?.at(-1) ?? null;
      return getAlertStatus(item, latest?.amount ?? null) !== "none";
    }).length;
  }, [state.historyByItem, watchlist]);

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

  const selectSearchItem = (item: MarketItem) => {
    if (!isTracked(state, item.marketHashName)) {
      addItem(item);
    }

    setQuery("");
    setSearchResults([]);
    setSearchError(null);
    setIsSearching(false);
  };

  const openItemModal = (item: WatchlistEntry) => {
    setActiveItem(item);
    setActiveError(null);
    setActivePrice(state.historyByItem[item.marketHashName]?.at(-1) ?? null);
    setLowAlertDraft(item.lowAlert != null ? String(item.lowAlert) : "");
    setHighAlertDraft(item.highAlert != null ? String(item.highAlert) : "");
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
    setLowAlertDraft("");
    setHighAlertDraft("");
  };

  const saveActiveAlerts = () => {
    if (!resolvedActiveItem) {
      return;
    }

    const lowAlert = toAlertValue(lowAlertDraft);
    const highAlert = toAlertValue(highAlertDraft);

    if (lowAlert != null && highAlert != null && lowAlert >= highAlert) {
      setActiveError("Lower target must be less than upper target.");
      return;
    }

    const nextState = updateWatchlistAlerts(loadLocalState(), resolvedActiveItem.marketHashName, {
      lowAlert,
      highAlert,
    });

    saveLocalState(nextState);
    setState(nextState);
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
    <section className="space-y-5 pb-4">
      <WatchlistTargetShowcase historyByItem={state.historyByItem} watchlist={watchlist} />

      <article className="rounded-xl border border-[#2b3b4b] bg-gradient-to-b from-[#1a2735]/95 to-[#111925]/95 p-6 shadow-[0_12px_26px_rgba(0,0,0,0.34)]">
        <h2 className="text-xl font-semibold text-[#d9e7f5]">Add items</h2>
        <p className="mt-2 text-sm text-[#9fb5ca]">Search Steam and click an item to add it.</p>

        <div className="relative mt-4">
          <input
            className="w-full rounded-md border border-[#31465d] bg-[#0d141d] px-4 py-3 text-[#d9e7f5] outline-none focus:border-[#66c0f4] focus:shadow-[0_0_0_2px_rgba(102,192,244,0.18)]"
            onChange={(event) => {
              const nextQuery = event.target.value;
              setQuery(nextQuery);

              if (nextQuery.trim().length < 3) {
                setSearchResults([]);
                setSearchError(null);
                setIsSearching(false);
              }
            }}
            placeholder="Search for CS items (e.g. AK-47 Redline)"
            value={query}
          />

          {query.trim().length >= 3 ? (
            <div className="absolute left-0 right-0 z-20 mt-2 overflow-hidden rounded-md border border-[#2f4256] bg-[#0f1721] shadow-[0_18px_34px_rgba(0,0,0,0.42)]">
              {isSearching ? <p className="px-4 py-3 text-sm text-[#9fb5ca]">Searching...</p> : null}
              {searchError ? <p className="px-4 py-3 text-sm text-rose-300">{searchError}</p> : null}

              {!isSearching && !searchError ? (
                searchResults.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-slate-300">No items found.</p>
                ) : (
                  <ul>
                    {searchResults.map((item) => {
                      const alreadyTracked = isTracked(state, item.marketHashName);

                      return (
                        <li className="border-b border-[#1d2b39] last:border-b-0" key={item.marketHashName}>
                          <button
                            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[#162536]"
                            onClick={() => {
                              selectSearchItem(item);
                            }}
                            type="button"
                          >
                            <span className="flex min-w-0 items-start gap-3">
                              {item.iconUrl ? (
                                <Image
                                  alt={item.displayName}
                                  className="rounded-md border border-slate-700 bg-slate-900"
                                  height={40}
                                  src={item.iconUrl}
                                  width={40}
                                />
                              ) : (
                                <span className="h-10 w-10 rounded-md border border-slate-700 bg-slate-900" />
                              )}
                              <span className="min-w-0">
                                <span className="block truncate text-sm text-slate-50">{item.displayName}</span>
                                <span className="mt-1 block text-xs text-slate-400">
                                  {item.startingPriceText ?? "N/A"}
                                </span>
                              </span>
                            </span>
                            <span
                              className={`rounded-md border px-2 py-1 text-xs font-medium ${
                                alreadyTracked
                                  ? "border-[#3a4f64] bg-[#203142] text-[#a9bdd0]"
                                  : "border-[#3d5f2f] bg-[#243a1d] text-[#b7d88d]"
                              }`}
                            >
                              {alreadyTracked ? "Added" : "Add"}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )
              ) : null}
            </div>
          ) : null}
        </div>
      </article>

      <article className="rounded-xl border border-[#2b3b4b] bg-gradient-to-b from-[#1a2735]/95 to-[#111925]/95 p-6 shadow-[0_12px_26px_rgba(0,0,0,0.34)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-[#d9e7f5]">Watchlist</h2>
            <p className="mt-1 text-xs text-[#89a9c3]">
              {triggeredCount} triggered {triggeredCount === 1 ? "item" : "items"}
            </p>
          </div>
          <button
            className="cursor-pointer rounded-md border border-[#3e5a76] bg-gradient-to-b from-[#5ba6db] to-[#3d6f94] px-4 py-2 text-sm font-semibold text-[#eaf5ff] hover:from-[#6ab6ec] hover:to-[#4680a9]"
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
          <>
            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
              <input
                className="w-full rounded-md border border-[#31465d] bg-[#0d141d] px-4 py-2.5 text-sm text-[#d9e7f5] outline-none focus:border-[#66c0f4] focus:shadow-[0_0_0_2px_rgba(102,192,244,0.18)]"
                onChange={(event) => {
                  setWatchlistQuery(event.target.value);
                }}
                placeholder="Search watchlist items"
                value={watchlistQuery}
              />
              <div className="flex flex-wrap gap-2">
                {([
                  { key: "all", label: "All" },
                  { key: "triggered", label: "Triggered" },
                  { key: "below", label: "Below lower" },
                  { key: "above", label: "Above upper" },
                ] as const).map((option) => {
                  const isActive = watchlistFilter === option.key;
                  const isTriggeredFilter = option.key === "triggered";

                  return (
                    <button
                      className={`cursor-pointer rounded-md border px-3 py-1.5 text-xs font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition ${
                        isActive
                          ? isTriggeredFilter
                            ? "border-[#7a5f37] bg-gradient-to-b from-[#6a4f2d] to-[#514024] text-[#f2d8aa]"
                            : "border-[#4b6b8a] bg-gradient-to-b from-[#43739a] to-[#355e7f] text-[#d8ecfc]"
                          : "border-[#2f4256] bg-gradient-to-b from-[#203142] to-[#1a2837] text-[#b8ccdd] hover:from-[#29425a] hover:to-[#22364a]"
                      }`}
                      key={option.key}
                      onClick={() => {
                        setWatchlistFilter(option.key);
                      }}
                      type="button"
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {filteredWatchlist.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">No watchlist items match this filter.</p>
            ) : null}

            <div className="mt-4 overflow-x-auto rounded-md border border-[#2b3b4b] bg-[#101923]/80">
              <table className="min-w-full text-sm">
                <thead className="border-b border-[#2f4256] bg-[#162230] text-xs uppercase tracking-wide text-[#8dadc7]">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Item</th>
                    <th className="px-4 py-3 text-left font-medium">Current price</th>
                    <th className="px-4 py-3 text-left font-medium">Target(s)</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWatchlist.map((item) => {
                    const latest = state.historyByItem[item.marketHashName]?.at(-1) ?? null;
                    const status = getAlertStatus(item, latest?.amount ?? null);
                    const statusBadge = getStatusBadge(status);

                    return (
                      <tr
                        className="cursor-pointer border-b border-[#1d2b39] last:border-b-0 hover:bg-[#162536]"
                        key={item.marketHashName}
                        onClick={() => {
                          openItemModal(item);
                        }}
                      >
                        <td className="px-4 py-3 align-top">
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
                              <span className="block text-sm font-medium text-[#d9e7f5]">{item.displayName}</span>
                              <span className="mt-1 block text-xs text-[#8ba8c1]">
                                Added {formatTimestamp(item.addedAt)}
                              </span>
                            </span>
                          </span>
                        </td>
                      <td className="px-4 py-3 align-top text-[#c7d5e0]">
                          {latest ? latest.lowestPriceText ?? formatUsd(latest.amount) : "No price yet"}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex flex-wrap gap-1.5">
                            {item.lowAlert != null ? (
                              <span className="rounded-md border border-[#3d5f2f] bg-gradient-to-b from-[#2d4723] to-[#243a1d] px-2 py-1 text-xs font-medium text-[#b7d88d]">
                                Lower {formatUsd(item.lowAlert)}
                              </span>
                            ) : null}
                            {item.highAlert != null ? (
                              <span className="rounded-md border border-[#6a5330] bg-gradient-to-b from-[#4f3e24] to-[#3f311d] px-2 py-1 text-xs font-medium text-[#e8c78d]">
                                Upper {formatUsd(item.highAlert)}
                              </span>
                            ) : null}
                            {item.lowAlert == null && item.highAlert == null ? (
                              <span className="rounded-md border border-[#3a4f64] bg-gradient-to-b from-[#223345] to-[#1a2838] px-2 py-1 text-xs font-medium text-[#a9bdd0]">
                                No targets set
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span
                            className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] ${statusBadge.className}`}
                          >
                            {statusBadge.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </article>

      {resolvedActiveItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#05090f]/80 p-4 backdrop-blur-[2px]">
          <article className="w-full max-w-4xl rounded-xl border border-[#2f4256] bg-gradient-to-b from-[#1a2735] to-[#101923] p-6 shadow-[0_26px_54px_rgba(0,0,0,0.58)]">
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
                  <h3 className="text-lg font-semibold text-[#d9e7f5]">{resolvedActiveItem.displayName}</h3>
                  <p className="mt-1 text-xs text-[#89a9c3]">
                    Added {formatTimestamp(resolvedActiveItem.addedAt)}
                  </p>
                </div>
              </div>

              <button
                className="cursor-pointer rounded-md border border-[#2f4256] bg-[#162230] px-3 py-1.5 text-xs text-[#c7d5e0] hover:bg-[#1f3245]"
                onClick={() => {
                  setActiveItem(null);
                  setActivePrice(null);
                  setActiveError(null);
                  setLowAlertDraft("");
                  setHighAlertDraft("");
                }}
                type="button"
              >
                Close
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className="cursor-pointer rounded-md border border-[#3e5a76] bg-gradient-to-b from-[#5ba6db] to-[#3d6f94] px-4 py-2 text-sm font-semibold text-[#eaf5ff] hover:from-[#6ab6ec] hover:to-[#4680a9]"
                onClick={() => {
                  void refreshActiveItem();
                }}
                type="button"
              >
                {isRefreshingActive ? "Refreshing..." : "Refresh Price"}
              </button>
              <button
                className="cursor-pointer rounded-md border border-[#6a3f3f] bg-gradient-to-b from-[#7e4040] to-[#5a2f2f] px-4 py-2 text-sm font-semibold text-[#ffe8e8] hover:from-[#965050] hover:to-[#6b3939]"
                onClick={removeActiveItem}
                type="button"
              >
                Remove from Watchlist
              </button>
            </div>

            {activeError ? <p className="mt-3 text-sm text-rose-300">{activeError}</p> : null}

            <div className="mt-4 rounded-md border border-[#2f4256] bg-[#0f1721] p-4">
              <p className="text-sm text-[#9fb5ca]">Latest local snapshot</p>
              <p className="mt-1 text-2xl font-semibold text-[#d9e7f5]">
                {activePrice
                  ? activePrice.lowestPriceText ?? formatUsd(activePrice.amount)
                  : "No price yet"}
              </p>
            </div>

            <div className="mt-4 rounded-md border border-[#2f4256] bg-[#0f1721] p-4">
              <p className="text-sm font-medium text-[#c7d5e0]">Target prices</p>
              <p className="mt-1 text-xs text-[#89a9c3]">
                Set lower and upper targets to flag items that move outside your preferred range.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-sm text-[#9fb5ca]" htmlFor="low-alert-input">
                  Lower target (USD)
                  <input
                    className="mt-1 w-full rounded-md border border-[#31465d] bg-[#0d141d] px-3 py-2 text-[#d9e7f5] outline-none focus:border-[#8bc53f]"
                    id="low-alert-input"
                    inputMode="decimal"
                    min="0"
                    onChange={(event) => {
                      setLowAlertDraft(event.target.value);
                    }}
                    placeholder="e.g. 12.50"
                    type="number"
                    value={lowAlertDraft}
                  />
                </label>
                <label className="text-sm text-[#9fb5ca]" htmlFor="high-alert-input">
                  Upper target (USD)
                  <input
                    className="mt-1 w-full rounded-md border border-[#31465d] bg-[#0d141d] px-3 py-2 text-[#d9e7f5] outline-none focus:border-[#f0ad4e]"
                    id="high-alert-input"
                    inputMode="decimal"
                    min="0"
                    onChange={(event) => {
                      setHighAlertDraft(event.target.value);
                    }}
                    placeholder="e.g. 27.50"
                    type="number"
                    value={highAlertDraft}
                  />
                </label>
              </div>
              <button
                className="mt-3 cursor-pointer rounded-md border border-[#3e5a76] bg-gradient-to-b from-[#5ba6db] to-[#3d6f94] px-4 py-2 text-sm font-semibold text-[#eaf5ff] hover:from-[#6ab6ec] hover:to-[#4680a9]"
                onClick={saveActiveAlerts}
                type="button"
              >
                Save Targets
              </button>
            </div>

            <div className="mt-4 rounded-md border border-[#2f4256] bg-[#0f1721] p-4">
              <p className="text-sm text-[#9fb5ca]">Local price graph</p>
              {activeHistory.length < 2 ? (
                  <p className="mt-2 text-sm text-[#89a9c3]">
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
                  <p className="mt-2 text-xs text-[#89a9c3]">
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
