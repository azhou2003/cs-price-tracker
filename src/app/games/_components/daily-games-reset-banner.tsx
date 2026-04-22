"use client";

import { useEffect, useState } from "react";

import { DailyResetCountdown } from "@/app/games/_components/daily-reset-countdown";
import { fetchDailyOrderByPriceGame, fetchDailyPriceGuessGame } from "@/lib/api-client";

export function DailyGamesResetBanner() {
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadExpiresAt() {
      try {
        const dailyOrderByPriceGame = await fetchDailyOrderByPriceGame();
        if (!cancelled) {
          setExpiresAt(dailyOrderByPriceGame.expiresAt);
        }
        return;
      } catch {
        // Try the second daily games endpoint if the first one fails.
      }

      try {
        const priceGuess = await fetchDailyPriceGuessGame();
        if (!cancelled) {
          setExpiresAt(priceGuess.expiresAt);
        }
      } catch {
        if (!cancelled) {
          setExpiresAt(null);
        }
      }
    }

    void loadExpiresAt();

    return () => {
      cancelled = true;
    };
  }, []);

  if (expiresAt) {
    return <DailyResetCountdown expiresAt={expiresAt} />;
  }

  return <p className="text-sm text-[var(--text-dim)]">Loading reset timer...</p>;
}
