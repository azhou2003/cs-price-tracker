"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import { GameShareOverlay } from "@/components/game-share-overlay";
import {
  dailyGameItemTypesKey,
  normalizeDailyGameItemTypes,
} from "@/lib/daily-game-item-types";
import {
  fetchDailyPriceGuessGame,
} from "@/lib/api-client";
import {
  DAILY_PRICE_GUESS_STATE_KEY,
  loadDailyGameStats,
  loadLocalState,
  recordDailyGameResult,
} from "@/lib/storage";
import type {
  DailyGameStatsState,
  DailyPriceGuessAttemptResponse,
  DailyPriceGuessChallengeResponse,
} from "@/lib/types";

const EMPTY_STATS: DailyGameStatsState = {
  orderByPrice: { played: 0, wins: 0, currentStreak: 0, bestStreak: 0 },
  priceGuess: { played: 0, wins: 0, currentStreak: 0, bestStreak: 0 },
};

type SavedDailyPriceGuessState = {
  dayKey: string;
  includedTypesKey?: string;
  attempts: DailyPriceGuessAttemptResponse[];
  challenge?: DailyPriceGuessChallengeResponse;
};

type SavedDailyPriceGuessChallengeCache = {
  dayKey: string;
  includedTypesKey?: string;
  challenge: DailyPriceGuessChallengeResponse;
};

const DAILY_PRICE_GUESS_CHALLENGE_CACHE_KEY =
  "cs-price-tracker:daily-price-guess-challenge:v1";
const SHARE_BASE_URL = "https://www.cspricetracker.com";
const PRICE_GUESS_ENDPOINT = "/games#price-guess";

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

function getIncludedTypesKey(challenge?: DailyPriceGuessChallengeResponse) {
  if (!challenge) {
    return null;
  }

  return dailyGameItemTypesKey(normalizeDailyGameItemTypes(challenge.includedTypes));
}

function loadSavedState(dayKey: string, includedTypesKey: string) {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(DAILY_PRICE_GUESS_STATE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as SavedDailyPriceGuessState;
    const parsedIncludedTypesKey = parsed.includedTypesKey ?? getIncludedTypesKey(parsed.challenge);
    if (
      parsed.dayKey !== dayKey ||
      parsedIncludedTypesKey !== includedTypesKey ||
      !Array.isArray(parsed.attempts)
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function saveState(
  dayKey: string,
  includedTypesKey: string,
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
      includedTypesKey,
      attempts,
      challenge,
    } satisfies SavedDailyPriceGuessState),
  );
}

function loadCachedChallenge(dayKey: string, includedTypesKey: string) {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(DAILY_PRICE_GUESS_CHALLENGE_CACHE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as SavedDailyPriceGuessChallengeCache;
    const parsedIncludedTypesKey =
      parsed.includedTypesKey ?? getIncludedTypesKey(parsed.challenge);
    if (parsed.dayKey !== dayKey || parsedIncludedTypesKey !== includedTypesKey || !parsed.challenge) {
      return null;
    }

    return parsed.challenge;
  } catch {
    return null;
  }
}

function saveCachedChallenge(challenge: DailyPriceGuessChallengeResponse) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    DAILY_PRICE_GUESS_CHALLENGE_CACHE_KEY,
    JSON.stringify({
      dayKey: challenge.dayKey,
      includedTypesKey: dailyGameItemTypesKey(challenge.includedTypes),
      challenge,
    } satisfies SavedDailyPriceGuessChallengeCache),
  );
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
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
    return "var(--buy)";
  }

  const base = Math.max(attempt.actualAmount, 0.01);
  const distancePercent = Math.abs(attempt.guess - attempt.actualAmount) / base;
  const normalized = Math.max(0, Math.min(1, distancePercent));
  const hue = Math.round(48 - normalized * 48);
  const lightness = Math.round(58 - normalized * 18);
  return `hsl(${hue} 88% ${lightness}%)`;
}

function hasClientCheckData(challenge: DailyPriceGuessChallengeResponse) {
  return Number.isFinite(challenge.actualAmount) && challenge.actualAmount > 0;
}

export function DailyPriceGuessGame() {
  const [challenge, setChallenge] = useState<DailyPriceGuessChallengeResponse | null>(null);
  const [attempts, setAttempts] = useState<DailyPriceGuessAttemptResponse[]>([]);
  const [guessInput, setGuessInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<DailyGameStatsState>(EMPTY_STATS);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [hasAutoOpenedShare, setHasAutoOpenedShare] = useState(false);
  const guessInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setStats(loadDailyGameStats());
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadGame() {
      setIsLoading(true);
      setError(null);

      const todayKey = getUtcDayKeyNow();
      const includedTypes = loadLocalState().settings.dailyGameIncludedTypes;
      const includedTypesKey = dailyGameItemTypesKey(includedTypes);
      const savedToday = loadSavedState(todayKey, includedTypesKey);

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

      const cachedChallenge =
        savedToday?.challenge && savedToday.challenge.dayKey === todayKey
          ? savedToday.challenge
          : loadCachedChallenge(todayKey, includedTypesKey);

      if (cachedChallenge && hasClientCheckData(cachedChallenge)) {
        if (!cancelled) {
          setStats(loadDailyGameStats());
          setChallenge(cachedChallenge);
          setAttempts(
            (savedToday?.attempts ?? []).slice(0, cachedChallenge.maxAttempts),
          );
          setIsLoading(false);
        }

        return;
      }

      try {
        const nextChallenge = await fetchDailyPriceGuessGame(includedTypes);
        if (cancelled) {
          return;
        }

        saveCachedChallenge(nextChallenge);

        const saved = loadSavedState(nextChallenge.dayKey, includedTypesKey);
        setStats(loadDailyGameStats());
        setChallenge(nextChallenge);
        setAttempts(saved?.attempts ?? []);
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Failed to load daily price guess game",
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
  const shareUrl = `${SHARE_BASE_URL}${PRICE_GUESS_ENDPOINT}`;
  const shareText = useMemo(() => {
    if (!challenge) {
      return "Play the Daily Price Guess game on CS Price Tracker.";
    }

    if (solvedAttempt) {
      return `I won Daily Price Guess in ${attempts.length}/${challenge.maxAttempts} guesses (${challenge.dayKey}) on CS Price Tracker. Can you beat me?`;
    }

    if (isComplete) {
      return `I lost Daily Price Guess after ${attempts.length}/${challenge.maxAttempts} guesses (${challenge.dayKey}) on CS Price Tracker. Think you can do better?`;
    }

    return `Can you beat today's Daily Price Guess challenge (${challenge.dayKey}) on CS Price Tracker?`;
  }, [attempts.length, challenge, isComplete, solvedAttempt]);

  useEffect(() => {
    if (!isLoading && isComplete && !hasAutoOpenedShare) {
      setIsShareOpen(true);
      setHasAutoOpenedShare(true);
    }
  }, [hasAutoOpenedShare, isComplete, isLoading]);

  const submitGuess = async () => {
    if (!challenge || isComplete) {
      return;
    }

      const guess = Number(guessInput);
      if (!Number.isFinite(guess) || guess < 0) {
      setError("Enter a valid non-negative number.");
      window.requestAnimationFrame(() => {
        guessInputRef.current?.focus();
      });
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const actualAmount = challenge.actualAmount;
      const toleranceUsd = challenge.toleranceUsd;
      const difference = Math.abs(actualAmount - guess);
      const isCorrect = difference <= toleranceUsd;
      const direction: DailyPriceGuessAttemptResponse["direction"] = isCorrect
        ? "exact"
        : guess < actualAmount
          ? "higher"
          : "lower";
      const scale = Math.max(actualAmount * 0.25, 1);
      const normalized = Math.min(difference / scale, 1);
      const attempt: DailyPriceGuessAttemptResponse = {
        dayKey: challenge.dayKey,
        guess,
        toleranceUsd,
        difference,
        isCorrect,
        direction,
        proximityScore: 1 - normalized,
        actualAmount,
        actualPriceText: challenge.actualPriceText,
      };

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
      saveState(
        challenge.dayKey,
        dailyGameItemTypesKey(challenge.includedTypes),
        nextAttempts,
        challenge,
      );

      if (completed) {
        setIsShareOpen(true);
      }

      if (!completed) {
        window.requestAnimationFrame(() => {
          guessInputRef.current?.focus();
        });
      }
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
    <article className="panel relative flex h-full flex-col p-4 sm:p-5" id="price-guess">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="label-caps">
            Daily Price Guess
          </p>
          <h2 className="mt-1 text-xl font-semibold text-[#e3e7ed]">Price Guess</h2>
        </div>
      </div>

      <p className="mt-2 text-sm text-[var(--text-dim)]">
        Guess today&apos;s item price in up to 5 attempts. You win if you are within
        5%.
      </p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Record {stats.priceGuess.wins}/{stats.priceGuess.played} wins • Streak {stats.priceGuess.currentStreak}
      </p>

      {isLoading ? <p className="mt-4 text-sm text-[var(--text-dim)]">Loading price guess game...</p> : null}
      {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}

      {!isLoading && challenge ? (
        <>
          <div className="panel-inset mt-4 p-3">
            <div className="flex items-start gap-3 sm:items-center">
              {challenge.item.iconUrl ? (
                <Image
                  alt={challenge.item.displayName}
                  className="rounded-[2px] border border-[#465362] bg-[#10151b]"
                  height={48}
                  src={challenge.item.iconUrl}
                  width={48}
                />
              ) : (
                <span className="h-12 w-12 rounded-[2px] border border-[#465362] bg-[#10151b]" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium leading-snug text-[#dde2e8] [overflow-wrap:anywhere]">
                  {challenge.item.displayName}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  Attempts left: {remainingAttempts}/{challenge.maxAttempts}
                </p>
              </div>
            </div>
          </div>

          {!isComplete ? (
            <form
              className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center"
              onSubmit={(event) => {
                event.preventDefault();
                void submitGuess();
              }}
            >
              <input
                className="field no-spinner text-base sm:max-w-xs sm:py-2.5 sm:text-sm"
                inputMode="decimal"
                min="0"
                onChange={(event) => {
                  setGuessInput(event.target.value);
                }}
                placeholder="Enter USD guess, e.g. 34.25"
                ref={guessInputRef}
                type="number"
                value={guessInput}
              />
              <button
                className="btn btn-primary w-full disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting ? "Checking..." : "Submit Guess"}
              </button>
            </form>
          ) : null}

          {isComplete && revealedPrice ? (
            <p className="mt-4 text-sm text-[var(--text-dim)]">
              Final price: <span className="font-semibold text-[#dce2e8]">{revealedPrice.actualPriceText ?? formatUsd(revealedPrice.actualAmount)}</span>
            </p>
          ) : null}

          <ul className="mt-4 space-y-2">
            {attempts.map((attempt, index) => {
              const arrowColor = getArrowColor(attempt);
              return (
                <li
                  className="panel-inset flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                  key={`${attempt.guess}-${index}`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="w-6 text-sm text-[var(--text-dim)]">#{index + 1}</span>
                    <span className="text-sm font-medium text-[#dde2e8]">{formatUsd(attempt.guess)}</span>
                    <span
                      className="text-lg font-bold"
                      style={{ color: arrowColor }}
                    >
                      {getArrow(attempt)}
                    </span>
                  </div>
                  {attempt.isCorrect ? (
                    <span className="text-sm font-semibold text-[#bfda9f]">Correct</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
      <GameShareOverlay
        isOpen={isShareOpen}
        onClose={() => {
          setIsShareOpen(false);
        }}
        title="Daily Price Guess"
        shareText={shareText}
        shareUrl={shareUrl}
        subtitle="Share your guesses and challenge friends."
      />
    </article>
  );
}
