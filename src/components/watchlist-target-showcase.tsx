"use client";

import Image from "next/image";
import { useMemo } from "react";

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

export function WatchlistTargetShowcase({
  watchlist,
  historyByItem,
}: WatchlistTargetShowcaseProps) {
  const topTargetProximity = useMemo(() => {
    return watchlist
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

        const nearest = distances.sort(
          (left, right) => left.absoluteDistance - right.absoluteDistance,
        )[0];

        return {
          item,
          latest,
          nearest,
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
        } => entry !== null,
      )
      .sort(
        (left, right) => right.nearest.absoluteDistance - left.nearest.absoluteDistance,
      )
      .slice(0, 3);
  }, [historyByItem, watchlist]);

  if (topTargetProximity.length === 0) {
    return null;
  }

  return (
    <article className="rounded-xl border border-[#2b3b4b] bg-gradient-to-b from-[#1a2735]/95 to-[#111925]/95 p-6 shadow-[0_12px_26px_rgba(0,0,0,0.34)]">
      <p className="text-[11px] uppercase tracking-[0.22em] text-[#89a9c3]">Watchlist Focus</p>
      <ul className="mt-3 grid gap-2 md:grid-cols-3">
        {topTargetProximity.map((entry) => (
          <li
            className="rounded-md border border-[#2d3f52] bg-[#111b27]/85 px-3 py-2"
            key={entry.item.marketHashName}
          >
            <div className="flex items-start gap-3">
              {entry.item.iconUrl ? (
                <Image
                  alt={entry.item.displayName}
                  className="rounded-md border border-slate-700 bg-slate-900"
                  height={36}
                  src={entry.item.iconUrl}
                  width={36}
                />
              ) : (
                <span className="h-9 w-9 rounded-md border border-slate-700 bg-slate-900" />
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[#d9e7f5]">{entry.item.displayName}</p>
                <p className="mt-1 text-xs text-[#9fb5ca]">
                  {entry.nearest.targetType === "low" ? "Low" : "High"} target {formatUsd(entry.nearest.target)}
                </p>
                <p className="mt-1 text-xs text-[#89a9c3]">
                  {formatDeltaText(entry.nearest.delta, entry.nearest.targetType)} ({formatUsd(entry.latest.amount)})
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </article>
  );
}
