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

function formatPercent(value: number) {
  return `${(value * 100).toFixed(value < 0.1 ? 1 : 0)}%`;
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

        const distances: Array<{ targetType: "low" | "high"; relative: number; target: number }> = [];

        if (item.lowAlert != null && item.lowAlert > 0) {
          distances.push({
            targetType: "low",
            relative: Math.abs(latest.amount - item.lowAlert) / item.lowAlert,
            target: item.lowAlert,
          });
        }

        if (item.highAlert != null && item.highAlert > 0) {
          distances.push({
            targetType: "high",
            relative: Math.abs(latest.amount - item.highAlert) / item.highAlert,
            target: item.highAlert,
          });
        }

        if (distances.length === 0) {
          return null;
        }

        const nearest = distances.sort((left, right) => left.relative - right.relative)[0];

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
          nearest: { targetType: "low" | "high"; relative: number; target: number };
        } => entry !== null,
      )
      .sort((left, right) => left.nearest.relative - right.nearest.relative)
      .slice(0, 3);
  }, [historyByItem, watchlist]);

  if (topTargetProximity.length === 0) {
    return null;
  }

  return (
    <article className="rounded-xl border border-[#2b3b4b] bg-gradient-to-b from-[#1a2735]/95 to-[#111925]/95 p-6 shadow-[0_12px_26px_rgba(0,0,0,0.34)]">
      <p className="text-[11px] uppercase tracking-[0.22em] text-[#89a9c3]">Watchlist Focus</p>
      <h2 className="mt-1 text-xl font-semibold text-[#d9e7f5]">Closest To Targets</h2>
      <ul className="mt-4 grid gap-2 md:grid-cols-3">
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
                  {formatPercent(entry.nearest.relative)} away ({formatUsd(entry.latest.amount)})
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </article>
  );
}
