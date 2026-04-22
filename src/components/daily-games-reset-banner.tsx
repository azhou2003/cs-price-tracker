"use client";

import { useEffect, useState } from "react";

import { DailyResetCountdown } from "@/components/daily-reset-countdown";
import { fetchDailyGame, fetchDailyPriceGuessGame } from "@/lib/api-client";

export function DailyGamesResetBanner() {
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadExpiresAt() {
      try {
        const dailyGame = await fetchDailyGame();
        if (!cancelled) {
          setExpiresAt(dailyGame.expiresAt);
        }
        return;
      } catch {
        // Try the second daily game endpoint if the first one fails.
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

  return <p className="text-sm text-[#9fb5ca]">Loading reset timer...</p>;
}
