"use client";

import Image from "next/image";
import { useMemo, useRef } from "react";

import type { PriceSnapshot, WatchlistEntry } from "@/lib/types";

type WatchlistTargetShowcaseProps = {
  watchlist: WatchlistEntry[];
  historyByItem: Record<string, PriceSnapshot[]>;
};

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatDeltaText(delta: number, targetType: "low" | "high") {
  if (Math.abs(delta) < 0.005) {
    return "At target";
  }

  const amountText = formatUsd(Math.abs(delta));
  const direction = delta > 0 ? "above" : "below";
  const label = targetType === "low" ? "low target" : "high target";
  return `${amountText} ${direction} ${label}`;
}

function shuffleItems<T>(items: T[]) {
  const next = [...items];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = next[index];
    next[index] = next[swapIndex] as T;
    next[swapIndex] = current as T;
  }

  return next;
}

function uniqueByMarketHash(items: WatchlistEntry[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    if (seen.has(item.marketHashName)) {
      return false;
    }

    seen.add(item.marketHashName);
    return true;
  });
}

function getAlertStatus(item: WatchlistEntry, latestAmount: number): "buy" | "sell" | "both" | "none" {
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

function getStatusLabel(status: "buy" | "sell" | "both") {
  if (status === "buy") {
    return "Buy Trigger";
  }

  if (status === "sell") {
    return "Sell Trigger";
  }

  return "Buy + Sell";
}

function getBeltItemClass(status: "buy" | "sell" | "both" | "neutral") {
  if (status === "neutral") {
    return "border-[var(--line)] bg-[linear-gradient(180deg,rgba(30,38,47,0.96)_0%,rgba(21,28,35,0.96)_100%)]";
  }

  if (status === "buy") {
    return "border-[#78b351] bg-[linear-gradient(180deg,#354f28_0%,#243a1c_100%)] shadow-[inset_0_0_0_1px_rgba(149,205,95,0.28)]";
  }

  if (status === "sell") {
    return "border-[#d39a43] bg-[linear-gradient(180deg,#503e24_0%,#3b2d19_100%)] shadow-[inset_0_0_0_1px_rgba(220,165,76,0.28)]";
  }

  return "border-[#bf627b] bg-[linear-gradient(180deg,#4f2a35_0%,#392028_100%)] shadow-[inset_0_0_0_1px_rgba(205,106,132,0.28)]";
}

function getStatusLabelClass(status: "buy" | "sell" | "both" | "neutral") {
  if (status === "neutral") {
    return "text-[#b6c0cb]";
  }

  if (status === "buy") {
    return "text-[#d0edb4]";
  }

  if (status === "sell") {
    return "text-[#f4d8a5]";
  }

  return "text-[#f4c5d3]";
}

function getItemTitleClass(status: "buy" | "sell" | "both" | "neutral") {
  if (status === "neutral") {
    return "text-[#dde2e8]";
  }

  if (status === "buy") {
    return "text-[#e3f3d0]";
  }

  if (status === "sell") {
    return "text-[#f5e3bf]";
  }

  return "text-[#f4d7df]";
}

function getMetaTextClass(status: "buy" | "sell" | "both" | "neutral") {
  if (status === "neutral") {
    return "text-[var(--text-dim)]";
  }

  if (status === "buy") {
    return "text-[#bed8a5]";
  }

  if (status === "sell") {
    return "text-[#d8be96]";
  }

  return "text-[#d7adba]";
}

function getDeltaTextClass(status: "buy" | "sell" | "both" | "neutral") {
  if (status === "neutral") {
    return "text-[var(--text-muted)]";
  }

  if (status === "buy") {
    return "text-[#aaca8f]";
  }

  if (status === "sell") {
    return "text-[#d2b584]";
  }

  return "text-[#cc9baa]";
}

function getIconFrameClass(status: "buy" | "sell" | "both" | "neutral") {
  if (status === "neutral") {
    return "border-[#455160] bg-[#0f141a]";
  }

  if (status === "buy") {
    return "border-[#6b9250] bg-[#192114]";
  }

  if (status === "sell") {
    return "border-[#9a7442] bg-[#231c14]";
  }

  return "border-[#965768] bg-[#22161a]";
}

export function WatchlistTargetShowcase({
  watchlist,
  historyByItem,
}: WatchlistTargetShowcaseProps) {
  const orderedHashesRef = useRef<string[]>([]);
  const previousVisibleHashesRef = useRef<Set<string>>(new Set());
  const hasInitializedRef = useRef(false);
  const uniqueWatchlist = useMemo(() => uniqueByMarketHash(watchlist), [watchlist]);

  const triggeredItems = useMemo(() => {
    return uniqueWatchlist
      .map((item) => {
        const latest = historyByItem[item.marketHashName]?.at(-1) ?? null;
        if (!latest) {
          return null;
        }

        const distances: Array<{
          targetType: "low" | "high";
          absoluteDistance: number;
          delta: number;
          target: number;
        }> = [];

        if (item.lowAlert != null && item.lowAlert > 0) {
          const delta = latest.amount - item.lowAlert;
          distances.push({
            targetType: "low",
            absoluteDistance: Math.abs(delta),
            delta,
            target: item.lowAlert,
          });
        }

        if (item.highAlert != null && item.highAlert > 0) {
          const delta = latest.amount - item.highAlert;
          distances.push({
            targetType: "high",
            absoluteDistance: Math.abs(delta),
            delta,
            target: item.highAlert,
          });
        }

        if (distances.length === 0) {
          return null;
        }

        const status = getAlertStatus(item, latest.amount);
        if (status === "none") {
          return null;
        }

        const nearest = distances.sort(
          (left, right) => left.absoluteDistance - right.absoluteDistance,
        )[0];

        return {
          item,
          latest,
          nearest,
          status,
        };
      })
      .filter(
        (
          entry,
        ): entry is {
          item: WatchlistEntry;
          latest: PriceSnapshot;
          nearest: {
            targetType: "low" | "high";
            absoluteDistance: number;
            delta: number;
            target: number;
          };
          status: "buy" | "sell" | "both";
        } => entry !== null,
      );
  }, [historyByItem, uniqueWatchlist]);

  const fallbackItems = useMemo(() => {
    if (triggeredItems.length > 0) {
      return [] as Array<{
        item: WatchlistEntry;
        latest: PriceSnapshot | null;
        status: "neutral";
      }>;
    }

    return shuffleItems(uniqueWatchlist).slice(0, 5).map((item) => ({
      item,
      latest: historyByItem[item.marketHashName]?.at(-1) ?? null,
      status: "neutral" as const,
    }));
  }, [historyByItem, triggeredItems.length, uniqueWatchlist]);

  const beltItems = triggeredItems.length > 0 ? triggeredItems : fallbackItems;

  const { orderedBeltItems, enteringHashes } = useMemo(() => {
    const itemByHash = new Map(
      beltItems.map((entry) => [entry.item.marketHashName, entry] as const),
    );
    const currentHashes = beltItems.map((entry) => entry.item.marketHashName);
    const hashSet = new Set(currentHashes);

    const kept = orderedHashesRef.current.filter((hash) => hashSet.has(hash));
    const keptSet = new Set(kept);
    const incoming = currentHashes.filter((hash) => !keptSet.has(hash));
    const nextOrder = [...incoming, ...kept];

    orderedHashesRef.current = nextOrder;

    const ordered = nextOrder
      .map((hash) => itemByHash.get(hash))
      .filter((entry): entry is (typeof beltItems)[number] => Boolean(entry));

    const entering = hasInitializedRef.current
      ? new Set(
          incoming.filter((hash) => !previousVisibleHashesRef.current.has(hash)),
        )
      : new Set<string>();

    previousVisibleHashesRef.current = hashSet;
    hasInitializedRef.current = true;

    return {
      orderedBeltItems: ordered,
      enteringHashes: entering,
    };
  }, [beltItems]);

  if (orderedBeltItems.length === 0) {
    return null;
  }

  const shouldLoop = orderedBeltItems.length >= 3;
  const loopItems = shouldLoop
    ? [...orderedBeltItems, ...orderedBeltItems]
    : orderedBeltItems;

  return (
    <div className="watchlist-belt-wrap overflow-hidden">
      <ul
        className={`${shouldLoop ? "watchlist-belt-track" : ""} flex w-max items-stretch gap-2 py-1`}
      >
        {loopItems.map((entry, index) => (
          <li
            className={`panel-inset min-w-[260px] px-3 py-2 ${getBeltItemClass(entry.status)} ${enteringHashes.has(entry.item.marketHashName) ? "watchlist-belt-item-enter" : ""}`}
            key={
              shouldLoop && index >= orderedBeltItems.length
                ? `${entry.item.marketHashName}-clone`
                : entry.item.marketHashName
            }
          >
            <div className="flex items-start gap-3">
              {entry.item.iconUrl ? (
                <Image
                  alt={entry.item.displayName}
                  className={`rounded-[2px] border ${getIconFrameClass(entry.status)}`}
                  height={36}
                  src={entry.item.iconUrl}
                  width={36}
                />
              ) : (
                <span className={`h-9 w-9 rounded-[2px] border ${getIconFrameClass(entry.status)}`} />
              )}
              <div className="min-w-0">
                <p className={`truncate text-sm font-semibold ${getItemTitleClass(entry.status)}`}>
                  {entry.item.displayName}
                </p>
                <p
                  className={`mt-1 text-[11px] uppercase tracking-[0.08em] ${getStatusLabelClass(entry.status)}`}
                >
                  {entry.status === "neutral" ? "Tracking" : getStatusLabel(entry.status)}
                </p>
                <p className={`mt-1 text-xs ${getDeltaTextClass(entry.status)}`}>
                  {entry.status === "neutral"
                    ? entry.latest
                      ? `Latest ${entry.latest.lowestPriceText ?? formatUsd(entry.latest.amount)}`
                      : "No local price snapshots yet"
                    : `${formatDeltaText(entry.nearest.delta, entry.nearest.targetType)} (${formatUsd(entry.latest.amount)})`}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
