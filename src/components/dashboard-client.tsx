"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

type WatchlistFilter = "all" | "triggered" | "buy" | "sell";
type AlertStatus = "none" | "buy" | "sell" | "both";
type GraphRange = "24h" | "7d" | "30d" | "all";

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

function toTimestampMs(value: string) {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function formatPercent(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
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
    return "buy";
  }

  if (isAbove) {
    return "sell";
  }

  return "none";
}

function getStatusBadge(status: AlertStatus) {
  if (status === "buy") {
    return {
      label: "Buy",
      className: "chip chip-buy",
    };
  }

  if (status === "sell") {
    return {
      label: "Sell",
      className: "chip chip-sell",
    };
  }

  if (status === "both") {
    return {
      label: "Buy + Sell",
      className: "chip chip-danger",
    };
  }

  return {
    label: "In range",
    className: "chip chip-neutral",
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
  const [refreshingItemHash, setRefreshingItemHash] = useState<string | null>(null);
  const [activeError, setActiveError] = useState<string | null>(null);
  const [watchlistQuery, setWatchlistQuery] = useState("");
  const [watchlistFilter, setWatchlistFilter] = useState<WatchlistFilter>("all");
  const [targetDraft, setTargetDraft] = useState("");
  const [hoveredGraphIndex, setHoveredGraphIndex] = useState<number | null>(null);
  const [graphRange, setGraphRange] = useState<GraphRange>("all");
  const [graphConnectGaps, setGraphConnectGaps] = useState(true);
  const [graphViewportSize, setGraphViewportSize] = useState({ width: 0, height: 0 });
  const isRefreshingRef = useRef(false);
  const graphViewportRef = useRef<HTMLDivElement | null>(null);

  const watchlist = state.watchlist;
  const resolvedActiveItem = activeItem
    ? watchlist.find((item) => item.marketHashName === activeItem.marketHashName) ?? null
    : null;
  const activeHistory = activeItem
    ? state.historyByItem[activeItem.marketHashName] ?? []
    : [];

  const activeTarget = useMemo(() => {
    if (!resolvedActiveItem) {
      return null;
    }

    if (resolvedActiveItem.lowAlert != null) {
      return {
        kind: "low" as const,
        amount: resolvedActiveItem.lowAlert,
      };
    }

    if (resolvedActiveItem.highAlert != null) {
      return {
        kind: "high" as const,
        amount: resolvedActiveItem.highAlert,
      };
    }

    return null;
  }, [resolvedActiveItem]);

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

      if (watchlistFilter === "buy") {
        return status === "buy" || status === "both";
      }

      if (watchlistFilter === "sell") {
        return status === "sell" || status === "both";
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

  const refreshWatchlist = useCallback(async () => {
    if (isRefreshingRef.current) {
      return;
    }

    if (watchlist.length === 0) {
      return;
    }

    isRefreshingRef.current = true;
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
      isRefreshingRef.current = false;
      setIsRefreshing(false);
    }
  }, [watchlist]);

  useEffect(() => {
    if (!state.settings.autoRefreshEnabled || watchlist.length === 0) {
      return;
    }

    const intervalMs = Math.max(state.settings.refreshIntervalMinutes, 1) * 60 * 1000;
    const timer = window.setInterval(() => {
      void refreshWatchlist();
    }, intervalMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [
    refreshWatchlist,
    state.settings.autoRefreshEnabled,
    state.settings.refreshIntervalMinutes,
    watchlist.length,
  ]);

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
    setTargetDraft(
      item.lowAlert != null
        ? String(item.lowAlert)
        : item.highAlert != null
          ? String(item.highAlert)
          : "",
    );
    setHoveredGraphIndex(null);
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
    setTargetDraft("");
    setHoveredGraphIndex(null);
  };

  const removeWatchlistItem = (marketHashName: string) => {
    const nextState = removeFromWatchlist(loadLocalState(), marketHashName);
    saveLocalState(nextState);
    setState(nextState);

    if (activeItem?.marketHashName === marketHashName) {
      setActiveItem(null);
      setActivePrice(null);
      setActiveError(null);
      setTargetDraft("");
      setHoveredGraphIndex(null);
    }
  };

  const refreshWatchlistItem = async (marketHashName: string) => {
    setRefreshingItemHash(marketHashName);
    setError(null);

    try {
      const snapshot = await fetchItemPrice(marketHashName);
      if (!snapshot) {
        setError("No price data available for this item right now.");
        return;
      }

      const nextState = appendPriceSnapshot(loadLocalState(), snapshot);
      saveLocalState(nextState);
      setState(nextState);

      if (activeItem?.marketHashName === marketHashName) {
        setActivePrice(snapshot);
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to refresh this item",
      );
    } finally {
      setRefreshingItemHash((current) =>
        current === marketHashName ? null : current,
      );
    }
  };

  const setActiveTargetValue = (kind: "low" | "high") => {
    if (!resolvedActiveItem) {
      return;
    }

    const target = toAlertValue(targetDraft);
    if (target == null) {
      setActiveError("Enter a valid positive target value.");
      return;
    }

    const nextState = updateWatchlistAlerts(loadLocalState(), resolvedActiveItem.marketHashName, {
      lowAlert: kind === "low" ? target : undefined,
      highAlert: kind === "high" ? target : undefined,
    });

    saveLocalState(nextState);
    setState(nextState);
    setTargetDraft(String(target));
    setActiveError(null);
  };

  const graphData = useMemo(() => {
    if (activeHistory.length === 0) {
      return null;
    }

    const latestMs = toTimestampMs(activeHistory.at(-1)?.timestamp ?? "") ?? Date.now();
    const rangeMsByKey: Record<Exclude<GraphRange, "all">, number> = {
      "24h": 24 * 60 * 60 * 1000,
      "7d": 7 * 24 * 60 * 60 * 1000,
      "30d": 30 * 24 * 60 * 60 * 1000,
    };

    const filteredHistory =
      graphRange === "all"
        ? activeHistory
        : activeHistory.filter((entry) => {
            const ms = toTimestampMs(entry.timestamp);
            if (ms == null) {
              return false;
            }

            return ms >= latestMs - rangeMsByKey[graphRange];
          });

    const sourceHistory = filteredHistory.length > 0 ? filteredHistory : activeHistory;
    const smoothedAmounts = sourceHistory.map((entry) => entry.amount);

    const values = [...smoothedAmounts];
    if (activeTarget) {
      values.push(activeTarget.amount);
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const valueRange = max - min || 1;

    const rawMs = sourceHistory.map((entry) => toTimestampMs(entry.timestamp));
    const hasCompleteTime = rawMs.every((value) => value != null);
    const fallbackMs = sourceHistory.map((_, index) => index);
    const xMs = hasCompleteTime
      ? (rawMs as number[])
      : fallbackMs;
    const minMs = Math.min(...xMs);
    const maxMs = Math.max(...xMs);
    const msRange = maxMs - minMs || 1;

    const points = sourceHistory.map((entry, index) => {
      const amount = smoothedAmounts[index] ?? entry.amount;
      return {
        index,
        x: ((xMs[index] - minMs) / msRange) * 100,
        y: 100 - ((amount - min) / valueRange) * 100,
        amount,
        rawAmount: entry.amount,
        entry,
      };
    });

    const diffs = xMs
      .slice(1)
      .map((value, index) => value - xMs[index])
      .filter((diff) => diff > 0)
      .sort((left, right) => left - right);
    const medianDiff = diffs.length === 0 ? 0 : diffs[Math.floor(diffs.length / 2)] ?? 0;
    const gapThreshold = Math.max(6 * 60 * 60 * 1000, medianDiff * 2.5);

    const segments = graphConnectGaps
      ? [points]
      : points.reduce<Array<typeof points>>((acc, point, index) => {
          const previous = points[index - 1];
          if (!previous) {
            acc.push([point]);
            return acc;
          }

          const prevMs = xMs[index - 1];
          const currentMs = xMs[index];
          const hasGap = currentMs - prevMs > gapThreshold;
          if (hasGap) {
            acc.push([point]);
            return acc;
          }

          const lastSegment = acc.at(-1);
          if (!lastSegment) {
            acc.push([point]);
            return acc;
          }

          lastSegment.push(point);
          return acc;
        }, []);

    const polylineSegments = segments.filter((segment) => segment.length > 0);

    const areaSegments = segments.filter((segment) => segment.length > 1);

    const latestValue = sourceHistory.at(-1)?.amount ?? null;
    const firstValue = sourceHistory[0]?.amount ?? null;
    const trendAmount =
      latestValue == null || firstValue == null ? null : latestValue - firstValue;
    const trendPercent =
      trendAmount == null || !firstValue
        ? null
        : (trendAmount / firstValue) * 100;
    const average =
      sourceHistory.reduce((total, point) => total + point.amount, 0) /
      sourceHistory.length;
    const volatilityPercent = average === 0 ? 0 : ((max - min) / average) * 100;

    return {
      points,
      polylineSegments,
      areaSegments,
      targetY:
        activeTarget == null ? null : 100 - ((activeTarget.amount - min) / valueRange) * 100,
      firstTimestamp: sourceHistory[0]?.timestamp,
      lastTimestamp: sourceHistory.at(-1)?.timestamp,
      min,
      max,
      average,
      latestValue,
      trendAmount,
      trendPercent,
      volatilityPercent,
      count: sourceHistory.length,
    };
  }, [activeHistory, activeTarget, graphConnectGaps, graphRange]);

  const hoveredGraphPoint =
    hoveredGraphIndex == null || !graphData
      ? null
      : graphData.points[hoveredGraphIndex] ?? null;

  const hoveredGraphMeta = useMemo(() => {
    if (!hoveredGraphPoint) {
      return null;
    }

    const previousPoint = graphData?.points[hoveredGraphPoint.index - 1] ?? null;
    const delta = previousPoint
      ? hoveredGraphPoint.rawAmount - previousPoint.rawAmount
      : null;
    const deltaPercent =
      delta == null || previousPoint == null || previousPoint.rawAmount === 0
        ? null
        : (delta / previousPoint.rawAmount) * 100;
    const targetDistance =
      activeTarget == null
        ? null
        : hoveredGraphPoint.rawAmount - activeTarget.amount;

    return {
      delta,
      deltaPercent,
      targetDistance,
      left: Math.min(Math.max(hoveredGraphPoint.x, 6), 94),
      top: Math.min(Math.max(hoveredGraphPoint.y, 8), 94),
      align:
        hoveredGraphPoint.x > 74
          ? "right"
          : hoveredGraphPoint.x < 26
            ? "left"
            : "center",
      placeBelow: hoveredGraphPoint.y < 24,
    };
  }, [activeTarget, graphData, hoveredGraphPoint]);

  useEffect(() => {
    const element = graphViewportRef.current;
    if (!element) {
      return;
    }

    const updateSize = () => {
      const nextWidth = element.clientWidth;
      const nextHeight = element.clientHeight;
      if (nextWidth <= 0 || nextHeight <= 0) {
        return;
      }

      setGraphViewportSize((current) =>
        current.width === nextWidth && current.height === nextHeight
          ? current
          : { width: nextWidth, height: nextHeight },
      );
    };

    updateSize();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateSize);
      return () => {
        window.removeEventListener("resize", updateSize);
      };
    }

    const observer = new ResizeObserver(() => {
      updateSize();
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [resolvedActiveItem?.marketHashName]);

  const chartWidth = graphViewportSize.width > 0 ? graphViewportSize.width : 100;
  const chartHeight = graphViewportSize.height > 0 ? graphViewportSize.height : 176;
  const toChartX = (xPercent: number) => (xPercent / 100) * chartWidth;
  const toChartY = (yPercent: number) => (yPercent / 100) * chartHeight;

  useEffect(() => {
    setHoveredGraphIndex(null);
  }, [activeItem?.marketHashName, graphRange, graphConnectGaps]);

  return (
    <section className="space-y-5 pb-4">
      <WatchlistTargetShowcase historyByItem={state.historyByItem} watchlist={watchlist} />

      <article className="panel p-4 sm:p-5">
        <p className="label-caps">Market Lookup</p>

        <div className="relative mt-3">
          <input
            className="field"
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
            <div className="panel-inset absolute left-0 right-0 z-20 mt-2 overflow-hidden shadow-[0_18px_34px_rgba(0,0,0,0.42)]">
              {isSearching ? <p className="px-4 py-3 text-sm text-[var(--text-dim)]">Searching...</p> : null}
              {searchError ? <p className="px-4 py-3 text-sm text-rose-300">{searchError}</p> : null}

              {!isSearching && !searchError ? (
                searchResults.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-[var(--text-dim)]">No items found.</p>
                ) : (
                  <ul>
                    {searchResults.map((item) => {
                      const alreadyTracked = isTracked(state, item.marketHashName);

                      return (
                        <li className="border-b border-[#28313d] last:border-b-0" key={item.marketHashName}>
                          <button
                            className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-[#212a35]"
                            onClick={() => {
                              selectSearchItem(item);
                            }}
                            type="button"
                          >
                            <span className="flex min-w-0 items-start gap-3">
                              {item.iconUrl ? (
                                <Image
                                  alt={item.displayName}
                                  className="rounded-[2px] border border-[#465362] bg-[#10151b]"
                                  height={40}
                                  src={item.iconUrl}
                                  width={40}
                                />
                              ) : (
                                <span className="h-10 w-10 rounded-[2px] border border-[#465362] bg-[#10151b]" />
                              )}
                              <span className="min-w-0">
                                <span className="block truncate text-sm text-[#e0e5ea]">{item.displayName}</span>
                                <span className="mt-1 block text-xs text-[var(--text-muted)]">
                                  {item.startingPriceText ?? "N/A"}
                                </span>
                              </span>
                            </span>
                            <span
                              className={`chip ${
                                alreadyTracked
                                  ? "chip-neutral"
                                  : "chip-buy"
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

      <article className="panel p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="label-caps">Tracked Inventory</p>
            <h2 className="mt-1 text-lg font-semibold text-[#dee3e8]">Watchlist</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {triggeredCount} triggered {triggeredCount === 1 ? "item" : "items"}
            </p>
          </div>
          <button
            className="btn btn-primary"
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
          <p className="mt-3 text-sm text-[var(--text-dim)]">Your watchlist is empty. Add items above.</p>
        ) : (
          <>
            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
              <input
                className="field"
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
                  { key: "buy", label: "Buy" },
                  { key: "sell", label: "Sell" },
                ] as const).map((option) => {
                  const isActive = watchlistFilter === option.key;
                  const isTriggeredFilter = option.key === "triggered";

                  return (
                    <button
                      className={`btn px-3 py-1.5 text-[11px] ${
                        isActive
                          ? isTriggeredFilter
                            ? "btn-warn"
                            : "btn-primary"
                          : "btn-muted"
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
              <p className="mt-4 text-sm text-[var(--text-muted)]">No watchlist items match this filter.</p>
            ) : null}

            <div className="panel-inset mt-4 overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Item</th>
                    <th className="px-4 py-3 text-left font-medium">Current price</th>
                    <th className="px-4 py-3 text-left font-medium">Target(s)</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWatchlist.map((item) => {
                    const latest = state.historyByItem[item.marketHashName]?.at(-1) ?? null;
                    const status = getAlertStatus(item, latest?.amount ?? null);
                    const statusBadge = getStatusBadge(status);

                    return (
                      <tr
                        className="cursor-pointer hover:bg-[#212a35]"
                        key={item.marketHashName}
                        onClick={() => {
                          openItemModal(item);
                        }}
                      >
                        <td>
                          <span className="flex items-start gap-3">
                            {item.iconUrl ? (
                              <Image
                                alt={item.displayName}
                                className="rounded-[2px] border border-[#455260] bg-[#11161c]"
                                height={44}
                                src={item.iconUrl}
                                width={44}
                              />
                            ) : (
                              <span className="h-11 w-11 rounded-[2px] border border-[#455260] bg-[#11161c]" />
                            )}
                            <span>
                              <span className="block text-sm font-medium text-[#dce1e6]">{item.displayName}</span>
                              <span className="mt-1 block text-xs text-[var(--text-muted)]">
                                Added {formatTimestamp(item.addedAt)}
                              </span>
                            </span>
                          </span>
                        </td>
                      <td className="text-[#c7cfd7]">
                          {latest ? latest.lowestPriceText ?? formatUsd(latest.amount) : "No price yet"}
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1.5">
                            {item.lowAlert != null ? (
                              <span className="chip chip-buy">
                                Lower {formatUsd(item.lowAlert)}
                              </span>
                            ) : null}
                            {item.highAlert != null ? (
                              <span className="chip chip-sell">
                                Upper {formatUsd(item.highAlert)}
                              </span>
                            ) : null}
                            {item.lowAlert == null && item.highAlert == null ? (
                              <span className="chip chip-neutral">
                                No targets set
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td>
                          <span className={statusBadge.className}>
                            {statusBadge.label}
                          </span>
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-2">
                            <button
                              aria-label="Refresh item"
                              className="btn btn-icon btn-primary"
                              onClick={(event) => {
                                event.stopPropagation();
                                void refreshWatchlistItem(item.marketHashName);
                              }}
                              title="Refresh item"
                              type="button"
                            >
                              {refreshingItemHash === item.marketHashName ? (
                                <span className="h-3 w-3 animate-spin rounded-full border border-[#dce7f1] border-t-transparent" />
                              ) : (
                                <svg
                                  aria-hidden="true"
                                  className="h-3.5 w-3.5"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    d="M20 12a8 8 0 1 1-2.34-5.66"
                                    stroke="currentColor"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                  />
                                  <path
                                    d="M20 4v6h-6"
                                    stroke="currentColor"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                  />
                                </svg>
                              )}
                            </button>
                            <button
                              aria-label="Delete item"
                              className="btn btn-icon btn-danger"
                              onClick={(event) => {
                                event.stopPropagation();
                                removeWatchlistItem(item.marketHashName);
                              }}
                              title="Delete item"
                              type="button"
                            >
                              <svg
                                aria-hidden="true"
                                className="h-3.5 w-3.5"
                                fill="none"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  d="M3 6h18"
                                  stroke="currentColor"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                />
                                <path
                                  d="M8 6V4h8v2"
                                  stroke="currentColor"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                />
                                <path
                                  d="M6 6l1 14h10l1-14"
                                  stroke="currentColor"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                />
                                <path
                                  d="M10 10v6"
                                  stroke="currentColor"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                />
                                <path
                                  d="M14 10v6"
                                  stroke="currentColor"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                />
                              </svg>
                            </button>
                          </div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#070b10]/82 p-4">
          <article className="panel w-full max-w-4xl p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                {resolvedActiveItem.iconUrl ? (
                  <Image
                    alt={resolvedActiveItem.displayName}
                    className="rounded-[2px] border border-[#465362] bg-[#10151b]"
                    height={56}
                    src={resolvedActiveItem.iconUrl}
                    width={56}
                  />
                ) : (
                  <span className="h-14 w-14 rounded-[2px] border border-[#465362] bg-[#10151b]" />
                )}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <h3 className="text-lg font-semibold text-[#e0e5ea] [overflow-wrap:anywhere]">
                      {resolvedActiveItem.displayName}
                    </h3>
                    <div className="inline-flex flex-shrink-0 items-center gap-2 rounded-[2px] border border-[#485a6e] bg-[linear-gradient(180deg,#1d2a38_0%,#162230_100%)] px-3 py-1.5 shadow-[inset_0_0_0_1px_rgba(132,162,190,0.14)]">
                      <span className="text-[10px] uppercase tracking-[0.12em] text-[#9eb2c7]">
                        Latest Price
                      </span>
                      <span className="text-sm font-semibold text-[#e7f1fb]">
                        {activePrice
                          ? activePrice.lowestPriceText ?? formatUsd(activePrice.amount)
                          : "No price yet"}
                      </span>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Added {formatTimestamp(resolvedActiveItem.addedAt)}
                  </p>
                </div>
              </div>

              <button
                aria-label="Close"
                className="btn btn-danger"
                onClick={() => {
                  setActiveItem(null);
                  setActivePrice(null);
                  setActiveError(null);
                  setTargetDraft("");
                  setHoveredGraphIndex(null);
                }}
                type="button"
              >
                X
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className="btn btn-primary"
                onClick={() => {
                  void refreshActiveItem();
                }}
                type="button"
              >
                {isRefreshingActive ? "Refreshing..." : "Refresh Price"}
              </button>
              <button
                className="btn btn-danger"
                onClick={removeActiveItem}
                type="button"
              >
                Remove from Watchlist
              </button>
            </div>

            {activeError ? <p className="mt-3 text-sm text-rose-300">{activeError}</p> : null}

            <div className="panel-inset mt-4 p-4">
              <p className="text-sm font-medium text-[#d6dde4]">Target price</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Enter one value, then set it as lower or higher target. Setting either one
                overwrites the previous target.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,260px)_auto] sm:items-end">
                <label className="text-sm text-[var(--text-dim)]" htmlFor="target-input">
                  Target value (USD)
                  <input
                    className="field mt-1"
                    id="target-input"
                    inputMode="decimal"
                    min="0"
                    onChange={(event) => {
                      setTargetDraft(event.target.value);
                    }}
                    placeholder="e.g. 12.50"
                    type="number"
                    value={targetDraft}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      setActiveTargetValue("low");
                    }}
                    type="button"
                  >
                    Set Lower Target
                  </button>
                  <button
                    className="btn btn-warn"
                    onClick={() => {
                      setActiveTargetValue("high");
                    }}
                    type="button"
                  >
                    Set Higher Target
                  </button>
                </div>
              </div>
              <p className="mt-3 text-xs text-[var(--text-muted)]">
                Current target: {activeTarget ? `${activeTarget.kind === "low" ? "Lower" : "Higher"} ${formatUsd(activeTarget.amount)}` : "Not set"}
              </p>
            </div>

            <div className="panel-inset mt-4 p-4">
              <p className="text-sm text-[var(--text-dim)]">Local price graph</p>
              {activeHistory.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  No local snapshots yet. Refresh this item to start tracking a trend.
                </p>
              ) : (
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-2">
                      {([
                        { key: "24h", label: "24H" },
                        { key: "7d", label: "7D" },
                        { key: "30d", label: "30D" },
                        { key: "all", label: "ALL" },
                      ] as const).map((option) => {
                        const isActive = graphRange === option.key;

                        return (
                          <button
                            className={`btn px-2.5 py-1 text-[10px] ${isActive ? "btn-primary" : "btn-muted"}`}
                            key={option.key}
                            onClick={() => {
                              setGraphRange(option.key);
                            }}
                            type="button"
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        className={`btn px-2.5 py-1 text-[10px] ${graphConnectGaps ? "btn-primary" : "btn-muted"}`}
                        onClick={() => {
                          setGraphConnectGaps((current) => !current);
                        }}
                        type="button"
                      >
                        {graphConnectGaps ? "Connect Gaps" : "Break Gaps"}
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded-[2px] border border-[#344252] bg-[#1a232e] px-2.5 py-2 text-xs text-[var(--text-dim)]">
                      Trend <span className={`ml-1 font-semibold ${graphData?.trendAmount != null && graphData.trendAmount >= 0 ? "text-[#bfe2a3]" : "text-[#e4b0aa]"}`}>{graphData?.trendAmount != null ? `${graphData.trendAmount >= 0 ? "+" : ""}${formatUsd(graphData.trendAmount)} (${formatPercent(graphData.trendPercent ?? 0)})` : "N/A"}</span>
                    </div>
                    <div className="rounded-[2px] border border-[#344252] bg-[#1a232e] px-2.5 py-2 text-xs text-[var(--text-dim)]">
                      Range <span className="ml-1 font-semibold text-[#dce4ec]">{graphData ? `${formatUsd(graphData.min)} - ${formatUsd(graphData.max)}` : "N/A"}</span>
                    </div>
                    <div className="rounded-[2px] border border-[#344252] bg-[#1a232e] px-2.5 py-2 text-xs text-[var(--text-dim)]">
                      Avg <span className="ml-1 font-semibold text-[#dce4ec]">{graphData ? formatUsd(graphData.average) : "N/A"}</span>
                    </div>
                    <div className="rounded-[2px] border border-[#344252] bg-[#1a232e] px-2.5 py-2 text-xs text-[var(--text-dim)]">
                      Volatility <span className="ml-1 font-semibold text-[#dce4ec]">{graphData ? formatPercent(graphData.volatilityPercent) : "N/A"}</span>
                    </div>
                    <div className="rounded-[2px] border border-[#344252] bg-[#1a232e] px-2.5 py-2 text-xs text-[var(--text-dim)]">
                      Last Update <span className="ml-1 font-semibold text-[#dce4ec]">{graphData?.lastTimestamp ? formatTimestamp(graphData.lastTimestamp) : "N/A"}</span>
                    </div>
                    <div className="rounded-[2px] border border-[#344252] bg-[#1a232e] px-2.5 py-2 text-xs text-[var(--text-dim)]">
                      Target Distance <span className={`ml-1 font-semibold ${hoveredGraphMeta?.targetDistance == null ? "text-[#dce4ec]" : hoveredGraphMeta.targetDistance <= 0 ? "text-[#bfe2a3]" : "text-[#e7c492]"}`}>{hoveredGraphMeta?.targetDistance == null ? activeTarget ? "Hover point" : "No target" : `${hoveredGraphMeta.targetDistance >= 0 ? "+" : ""}${formatUsd(hoveredGraphMeta.targetDistance)}`}</span>
                    </div>
                  </div>

                  <div
                    className="relative overflow-hidden rounded-[2px] border border-[#344252] bg-[linear-gradient(180deg,#141d27_0%,#0f171f_100%)] p-3"
                    onKeyDown={(event) => {
                      if (!graphData || graphData.points.length === 0) {
                        return;
                      }

                      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
                        return;
                      }

                      event.preventDefault();
                      const direction = event.key === "ArrowRight" ? 1 : -1;

                      setHoveredGraphIndex((current) => {
                        if (current == null) {
                          return direction > 0 ? 0 : graphData.points.length - 1;
                        }

                        const next = Math.min(
                          graphData.points.length - 1,
                          Math.max(0, current + direction),
                        );
                        return next;
                      });
                    }}
                    onMouseLeave={() => {
                      setHoveredGraphIndex(null);
                    }}
                    tabIndex={0}
                  >
                    {hoveredGraphPoint && hoveredGraphMeta ? (
                      <div
                        className="pointer-events-none absolute z-10 rounded-[2px] border border-[#4a5b70] bg-[#111a24]/95 px-2.5 py-2 text-xs text-[#d9e2ea] shadow-[0_10px_24px_rgba(0,0,0,0.45)]"
                        style={{
                          left: `${hoveredGraphMeta.left}%`,
                          top: `${hoveredGraphMeta.top}%`,
                          width: "210px",
                          maxWidth: "calc(100% - 0.75rem)",
                          transform:
                            hoveredGraphMeta.align === "right"
                              ? hoveredGraphMeta.placeBelow
                                ? "translate(-100%, 8px)"
                                : "translate(-100%, -110%)"
                              : hoveredGraphMeta.align === "left"
                                ? hoveredGraphMeta.placeBelow
                                  ? "translate(0, 8px)"
                                  : "translate(0, -110%)"
                                : hoveredGraphMeta.placeBelow
                                  ? "translate(-50%, 8px)"
                                  : "translate(-50%, -110%)",
                        }}
                      >
                        <p className="font-semibold text-[#e7eef6]">{formatTimestamp(hoveredGraphPoint.entry.timestamp)}</p>
                        <p className="mt-1 text-[var(--text-dim)]">Price: <span className="font-semibold text-[#e7eef6]">{formatUsd(hoveredGraphPoint.rawAmount)}</span></p>
                        <p className="mt-1 text-[var(--text-dim)]">Change: <span className={`font-semibold ${hoveredGraphMeta.delta != null && hoveredGraphMeta.delta >= 0 ? "text-[#bfe2a3]" : "text-[#e4b0aa]"}`}>{hoveredGraphMeta.delta == null ? "N/A" : `${hoveredGraphMeta.delta >= 0 ? "+" : ""}${formatUsd(hoveredGraphMeta.delta)} (${formatPercent(hoveredGraphMeta.deltaPercent ?? 0)})`}</span></p>
                        <p className="mt-1 text-[var(--text-dim)]">Target gap: <span className="font-semibold text-[#e7eef6]">{hoveredGraphMeta.targetDistance == null ? "N/A" : `${hoveredGraphMeta.targetDistance >= 0 ? "+" : ""}${formatUsd(hoveredGraphMeta.targetDistance)}`}</span></p>
                      </div>
                    ) : null}

                    <div className="relative h-44 w-full" ref={graphViewportRef}>
                      <svg className="h-full w-full" viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
                        {[0, 25, 50, 75, 100].map((yPercent) => (
                          <line
                            key={yPercent}
                            stroke="rgb(72 86 102 / 0.55)"
                            strokeWidth="1"
                            x1={0}
                            x2={chartWidth}
                            y1={toChartY(yPercent)}
                            y2={toChartY(yPercent)}
                          />
                        ))}

                        {graphData?.targetY != null && activeTarget?.kind === "low" ? (
                          <rect
                            fill="rgb(130 176 88 / 0.13)"
                            height={chartHeight - toChartY(graphData.targetY)}
                            width={chartWidth}
                            x={0}
                            y={toChartY(graphData.targetY)}
                          />
                        ) : null}
                        {graphData?.targetY != null && activeTarget?.kind === "high" ? (
                          <rect
                            fill="rgb(212 154 75 / 0.13)"
                            height={toChartY(graphData.targetY)}
                            width={chartWidth}
                            x={0}
                            y={0}
                          />
                        ) : null}

                        {graphData?.areaSegments.map((segment, index) => {
                          const first = segment[0];
                          const last = segment.at(-1);
                          if (!first || !last) {
                            return null;
                          }

                          const points = `${toChartX(first.x)},${chartHeight} ${segment
                            .map((point) => `${toChartX(point.x)},${toChartY(point.y)}`)
                            .join(" ")} ${toChartX(last.x)},${chartHeight}`;

                          return (
                            <polygon
                              className="graph-area-enter"
                              fill="rgb(82 154 204 / 0.18)"
                              key={`area-${index}`}
                              points={points}
                            />
                          );
                        })}

                        {graphData?.polylineSegments.map((segment, index) => (
                          <polyline
                            className="graph-line-enter"
                            fill="none"
                            key={`line-${index}`}
                            pathLength={chartWidth}
                            points={segment
                              .map((point) => `${toChartX(point.x)},${toChartY(point.y)}`)
                              .join(" ")}
                            stroke="rgb(92 186 245)"
                            strokeWidth="2"
                          />
                        ))}

                        {hoveredGraphPoint ? (
                          <line
                            stroke="rgb(157 179 201 / 0.75)"
                            strokeDasharray="3 3"
                            strokeWidth="1"
                            x1={toChartX(hoveredGraphPoint.x)}
                            x2={toChartX(hoveredGraphPoint.x)}
                            y1={0}
                            y2={chartHeight}
                          />
                        ) : null}

                        {graphData?.targetY != null ? (
                          <>
                            <line
                              stroke="rgb(236 186 107)"
                              strokeDasharray="4 3"
                              strokeWidth="1"
                              x1={0}
                              x2={chartWidth}
                              y1={toChartY(graphData.targetY)}
                              y2={toChartY(graphData.targetY)}
                            />
                            <text
                              fill="rgb(237 198 135)"
                              fontSize="10"
                              textAnchor="end"
                              x={Math.max(0, chartWidth - 6)}
                              y={Math.max(12, toChartY(graphData.targetY) - 6)}
                            >
                              {activeTarget?.kind === "low" ? "LOWER" : "HIGHER"} TARGET
                            </text>
                          </>
                        ) : null}

                        {graphData?.points.map((point) => {
                          const isActive = hoveredGraphIndex === point.index;

                          return (
                            <circle
                              cx={toChartX(point.x)}
                              cy={toChartY(point.y)}
                              fill={isActive ? "rgb(243 249 255)" : "rgb(130 206 248)"}
                              key={point.entry.timestamp}
                              onBlur={() => {
                                setHoveredGraphIndex(null);
                              }}
                              onFocus={() => {
                                setHoveredGraphIndex(point.index);
                              }}
                              onMouseEnter={() => {
                                setHoveredGraphIndex(point.index);
                              }}
                              r={isActive ? 4.2 : 3.1}
                              stroke="rgb(12 19 27)"
                              strokeWidth="1"
                              tabIndex={0}
                            />
                          );
                        })}
                      </svg>
                    </div>

                    <div className="pointer-events-none absolute right-1 top-2 flex h-[calc(100%-1rem)] flex-col justify-between text-[10px] text-[#96a5b5]">
                      <span>{graphData ? formatUsd(graphData.max) : ""}</span>
                      <span>{graphData ? formatUsd((graphData.max + graphData.min) / 2) : ""}</span>
                      <span>{graphData ? formatUsd(graphData.min) : ""}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
                    <span>{graphData?.firstTimestamp ? formatTimestamp(graphData.firstTimestamp) : ""}</span>
                    <span>{graphData?.lastTimestamp ? formatTimestamp(graphData.lastTimestamp) : ""}</span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)]">
                    {graphData?.count ?? 0} local snapshots shown (UTC)
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
