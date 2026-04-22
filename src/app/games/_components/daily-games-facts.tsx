"use client";

import { useEffect, useMemo, useState } from "react";

import { loadDailyGameStats } from "@/lib/storage";
import type { DailyGameStatsEntry, DailyGameStatsState } from "@/lib/types";

const EMPTY_STATS: DailyGameStatsState = {
  orderByPrice: { played: 0, wins: 0, currentStreak: 0, bestStreak: 0 },
  priceGuess: { played: 0, wins: 0, currentStreak: 0, bestStreak: 0 },
};

function modeLabel(mode: "orderByPrice" | "priceGuess") {
  return mode === "orderByPrice" ? "Order By Price" : "Price Guess";
}

const TIE_BREAKER_MODE: "orderByPrice" | "priceGuess" = "orderByPrice";

function pickLeader(
  orderValue: number,
  priceValue: number,
) {
  const winnerMode =
    orderValue === priceValue
      ? TIE_BREAKER_MODE
      : orderValue > priceValue
        ? "orderByPrice"
        : "priceGuess";

  if (orderValue === priceValue) {
    return {
      label: modeLabel(winnerMode),
      value: orderValue,
    };
  }

  return {
    label: modeLabel(winnerMode),
    value: winnerMode === "orderByPrice" ? orderValue : priceValue,
  };
}

function totalWins(entry: DailyGameStatsEntry, other: DailyGameStatsEntry) {
  return entry.wins + other.wins;
}

export function DailyGamesFacts() {
  const [stats, setStats] = useState<DailyGameStatsState>(EMPTY_STATS);

  useEffect(() => {
    setStats(loadDailyGameStats());
  }, []);

  const facts = useMemo(() => {
    const highestStreak = pickLeader(
      stats.orderByPrice.bestStreak,
      stats.priceGuess.bestStreak,
    );
    const mostWins = pickLeader(stats.orderByPrice.wins, stats.priceGuess.wins);
    const mostPlayed = pickLeader(
      stats.orderByPrice.played,
      stats.priceGuess.played,
    );
    const winsTotal = totalWins(stats.orderByPrice, stats.priceGuess);

    return {
      highestStreak,
      mostWins,
      mostPlayed,
      winsTotal,
    };
  }, [stats]);

  return (
    <section className="panel p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="label-caps">Daily Games Summary</p>
        </div>
        <span className="chip chip-neutral">Local profile</span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="panel-inset px-3 py-2.5">
          <p className="label-caps">Highest Streak</p>
          <p className="mt-1 text-lg font-semibold text-[#dbe2e9]">{facts.highestStreak.value}</p>
          <p className="mt-0.5 text-xs text-[var(--text-dim)]">{facts.highestStreak.label}</p>
        </div>

        <div className="panel-inset px-3 py-2.5">
          <p className="label-caps">Most Wins</p>
          <p className="mt-1 text-lg font-semibold text-[#dbe2e9]">{facts.mostWins.value}</p>
          <p className="mt-0.5 text-xs text-[var(--text-dim)]">{facts.mostWins.label}</p>
        </div>

        <div className="panel-inset px-3 py-2.5">
          <p className="label-caps">Most Played</p>
          <p className="mt-1 text-lg font-semibold text-[#dbe2e9]">{facts.mostPlayed.value}</p>
          <p className="mt-0.5 text-xs text-[var(--text-dim)]">{facts.mostPlayed.label}</p>
        </div>

        <div className="panel-inset px-3 py-2.5">
          <p className="label-caps">Total Wins</p>
          <p className="mt-1 text-lg font-semibold text-[#dbe2e9]">{facts.winsTotal}</p>
          <p className="mt-0.5 text-xs text-[var(--text-dim)]">Across all game modes</p>
        </div>
      </div>
    </section>
  );
}
