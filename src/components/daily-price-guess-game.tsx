"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import {
  fetchDailyPriceGuessGame,
  submitDailyPriceGuess,
} from "@/lib/api-client";
import {
  DAILY_PRICE_GUESS_STATE_KEY,
  loadDailyGameStats,
  recordDailyGameResult,
} from "@/lib/storage";
import type {
  DailyGameStatsState,
  DailyPriceGuessAttemptResponse,
  DailyPriceGuessChallengeResponse,
} from "@/lib/types";

type SavedDailyPriceGuessState = {
  dayKey: string;
  attempts: DailyPriceGuessAttemptResponse[];
  challenge?: DailyPriceGuessChallengeResponse;
};

function getUtcDayKeyNow() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isGameComplete(
  attempts: DailyPriceGuessAttemptResponse[],
  maxAttempts: number,
) {
  return attempts.some((attempt) => attempt.isCorrect) || attempts.length >= maxAttempts;
}

function loadSavedState(dayKey: string) {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(DAILY_PRICE_GUESS_STATE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as SavedDailyPriceGuessState;
    if (parsed.dayKey !== dayKey || !Array.isArray(parsed.attempts)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function saveState(
  dayKey: string,
  attempts: DailyPriceGuessAttemptResponse[],
  challenge: DailyPriceGuessChallengeResponse,
) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    DAILY_PRICE_GUESS_STATE_KEY,
    JSON.stringify({
      dayKey,
      attempts,
      challenge,
    } satisfies SavedDailyPriceGuessState),
  );
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatUtcTime(value: string) {
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

function getArrow(attempt: DailyPriceGuessAttemptResponse) {
  if (attempt.direction === "higher") {
    return "↑";
  }

  if (attempt.direction === "lower") {
    return "↓";
  }

  return "✓";
}

function getArrowColor(attempt: DailyPriceGuessAttemptResponse) {
  if (attempt.isCorrect) {
    return "hsl(120 55% 56%)";
  }

  const closeness = Math.max(0, Math.min(1, attempt.proximityScore));
  const hue = Math.round(5 + closeness * 48);
  const lightness = Math.round(38 + closeness * 24);
  return `hsl(${hue} 86% ${lightness}%)`;
}

export function DailyPriceGuessGame() {
  const [challenge, setChallenge] = useState<DailyPriceGuessChallengeResponse | null>(null);
  const [attempts, setAttempts] = useState<DailyPriceGuessAttemptResponse[]>([]);
  const [guessInput, setGuessInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<DailyGameStatsState>(() => loadDailyGameStats());

  useEffect(() => {
    let cancelled = false;

    async function loadGame() {
      setIsLoading(true);
      setError(null);

      const todayKey = getUtcDayKeyNow();
      const savedToday = loadSavedState(todayKey);
      if (
        savedToday?.challenge &&
        savedToday.challenge.dayKey === todayKey &&
        isGameComplete(savedToday.attempts, savedToday.challenge.maxAttempts)
      ) {
        if (!cancelled) {
          setStats(loadDailyGameStats());
          setChallenge(savedToday.challenge);
          setAttempts(savedToday.attempts.slice(0, savedToday.challenge.maxAttempts));
          setIsLoading(false);
        }

        return;
      }

      try {
        const nextChallenge = await fetchDailyPriceGuessGame();
        if (cancelled) {
          return;
        }

        const saved = loadSavedState(nextChallenge.dayKey);
        setStats(loadDailyGameStats());
        setChallenge(nextChallenge);
        setAttempts(saved?.attempts ?? []);
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Failed to load daily price game",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadGame();

    return () => {
      cancelled = true;
    };
  }, []);

  const solvedAttempt = useMemo(() => {
    return attempts.find((attempt) => attempt.isCorrect) ?? null;
  }, [attempts]);

  const remainingAttempts = useMemo(() => {
    if (!challenge) {
      return 0;
    }

    return Math.max(0, challenge.maxAttempts - attempts.length);
  }, [attempts.length, challenge]);

  const isComplete = Boolean(solvedAttempt) || (challenge ? remainingAttempts === 0 : false);

  const onSubmit = async () => {
    if (!challenge || isComplete) {
      return;
    }

    const guess = Number(guessInput);
    if (!Number.isFinite(guess) || guess < 0) {
      setError("Enter a valid non-negative number.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const attempt = await submitDailyPriceGuess({
        dayKey: challenge.dayKey,
        guess,
      });

      const nextAttempts = [...attempts, attempt].slice(0, challenge.maxAttempts);
      const completed = attempt.isCorrect || nextAttempts.length >= challenge.maxAttempts;

      if (completed) {
        const nextStats = recordDailyGameResult(
          "price-guess",
          challenge.dayKey,
          attempt.isCorrect,
        );
        setStats(nextStats);
      }

      setAttempts(nextAttempts);
      setGuessInput("");
      saveState(challenge.dayKey, nextAttempts, challenge);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to submit guess",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const revealedPrice = solvedAttempt ?? attempts.at(-1) ?? null;

  return (
    <article className="rounded-xl border border-[#2b3b4b] bg-gradient-to-b from-[#1a2735]/95 to-[#111925]/95 p-6 shadow-[0_12px_26px_rgba(0,0,0,0.34)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-[#89a9c3]">
            Daily Game
          </p>
          <h2 className="mt-1 text-xl font-semibold text-[#d9e7f5]">Price Guess</h2>
        </div>
        {challenge ? (
          <p className="text-xs text-[#89a9c3]">
            Resets {formatUtcTime(challenge.expiresAt)} (UTC)
          </p>
        ) : null}
      </div>

      <p className="mt-2 text-sm text-[#9fb5ca]">
        Guess today&apos;s item price in up to 5 attempts. You win if you are within
        $0.50.
      </p>
      <p className="mt-1 text-xs text-[#89a9c3]">
        Record {stats.priceGuess.wins}/{stats.priceGuess.played} wins • Streak {stats.priceGuess.currentStreak}
      </p>

      {isLoading ? <p className="mt-4 text-sm text-[#9fb5ca]">Loading price guess game...</p> : null}
      {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}

      {!isLoading && challenge ? (
        <>
          <div className="mt-4 rounded-md border border-[#2d3f52] bg-[#111b27]/85 p-3">
            <div className="flex items-center gap-3">
              {challenge.item.iconUrl ? (
                <Image
                  alt={challenge.item.displayName}
                  className="rounded-md border border-slate-700 bg-slate-900"
                  height={44}
                  src={challenge.item.iconUrl}
                  width={44}
                />
              ) : (
                <span className="h-11 w-11 rounded-md border border-slate-700 bg-slate-900" />
              )}
              <div>
                <p className="text-sm font-medium text-[#d9e7f5]">{challenge.item.displayName}</p>
                <p className="text-xs text-[#89a9c3]">
                  Attempts left: {remainingAttempts}/{challenge.maxAttempts}
                </p>
              </div>
            </div>
          </div>

          {!isComplete ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <input
                className="w-full max-w-xs rounded-md border border-[#31465d] bg-[#0d141d] px-4 py-2.5 text-sm text-[#d9e7f5] outline-none focus:border-[#66c0f4]"
                inputMode="decimal"
                min="0"
                onChange={(event) => {
                  setGuessInput(event.target.value);
                }}
                placeholder="Enter USD guess, e.g. 34.25"
                type="number"
                value={guessInput}
              />
              <button
                className="cursor-pointer rounded-md border border-[#3e5a76] bg-gradient-to-b from-[#5ba6db] to-[#3d6f94] px-4 py-2 text-sm font-semibold text-[#eaf5ff] hover:from-[#6ab6ec] hover:to-[#4680a9] disabled:cursor-not-allowed disabled:opacity-70"
                disabled={isSubmitting}
                onClick={() => {
                  void onSubmit();
                }}
                type="button"
              >
                {isSubmitting ? "Checking..." : "Submit Guess"}
              </button>
            </div>
          ) : null}

          {isComplete && revealedPrice ? (
            <p className="mt-4 text-sm text-[#9fb5ca]">
              Final price: <span className="font-semibold text-[#d9e7f5]">{revealedPrice.actualPriceText ?? formatUsd(revealedPrice.actualAmount)}</span>
            </p>
          ) : null}

          <ul className="mt-4 space-y-2">
            {attempts.map((attempt, index) => {
              const arrowColor = getArrowColor(attempt);
              return (
                <li
                  className="flex items-center justify-between gap-3 rounded-md border border-[#2d3f52] bg-[#111b27]/85 px-3 py-2"
                  key={`${attempt.guess}-${index}`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="w-5 text-xs text-[#89a9c3]">#{index + 1}</span>
                    <span className="text-sm text-[#d9e7f5]">{formatUsd(attempt.guess)}</span>
                    <span
                      className="text-base font-bold"
                      style={{ color: arrowColor }}
                    >
                      {getArrow(attempt)}
                    </span>
                  </div>
                  <span
                    className={`text-xs font-semibold ${
                      attempt.isCorrect ? "text-[#9fd58f]" : "text-[#f0b37a]"
                    }`}
                  >
                    {attempt.isCorrect ? "Correct" : attempt.direction === "higher" ? "Go higher" : "Go lower"}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </article>
  );
}
