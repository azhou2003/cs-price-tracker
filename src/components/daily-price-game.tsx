"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import { fetchDailyGame, submitDailyGameGuess } from "@/lib/api-client";
import {
  DAILY_GAME_STATE_KEY,
  loadDailyGameStats,
  recordDailyGameResult,
} from "@/lib/storage";
import type {
  DailyGameChallengeResponse,
  DailyGameGuessResponse,
  DailyGameItem,
  DailyGameResultItem,
  DailyGameStatsState,
} from "@/lib/types";

type SavedDailyResult = {
  dayKey: string;
  orderedMarketHashNames?: string[];
  result: DailyGameGuessResponse;
  challenge?: DailyGameChallengeResponse;
};

function getUtcDayKeyNow() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function loadSavedResult(dayKey: string) {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(DAILY_GAME_STATE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as SavedDailyResult;
    if (parsed.dayKey !== dayKey) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function saveResult(
  dayKey: string,
  orderedMarketHashNames: string[],
  result: DailyGameGuessResponse,
  challenge: DailyGameChallengeResponse,
) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    DAILY_GAME_STATE_KEY,
    JSON.stringify({
      dayKey,
      orderedMarketHashNames,
      result,
      challenge,
    } satisfies SavedDailyResult),
  );
}

function moveItem(items: DailyGameItem[], from: number, to: number) {
  const next = [...items];
  const [picked] = next.splice(from, 1);
  if (!picked) {
    return items;
  }

  next.splice(to, 0, picked);
  return next;
}

function moveItemToDropIndex(items: DailyGameItem[], from: number, dropIndex: number) {
  const next = [...items];
  const [picked] = next.splice(from, 1);
  if (!picked) {
    return items;
  }

  const normalized = from < dropIndex ? dropIndex - 1 : dropIndex;
  const bounded = Math.max(0, Math.min(normalized, next.length));
  next.splice(bounded, 0, picked);
  return next;
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

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function isSavedResultCompatible(
  items: DailyGameItem[],
  result: DailyGameGuessResponse | undefined,
) {
  if (!result) {
    return false;
  }

  return hasSameHashes(items, result.correctOrder);
}

function hasSameHashes(items: DailyGameItem[], rankedItems: DailyGameResultItem[]) {
  if (items.length !== rankedItems.length) {
    return false;
  }

  const itemHashes = new Set(items.map((item) => item.marketHashName));
  const rankedHashes = new Set(rankedItems.map((item) => item.marketHashName));

  if (itemHashes.size !== rankedHashes.size) {
    return false;
  }

  for (const hash of itemHashes) {
    if (!rankedHashes.has(hash)) {
      return false;
    }
  }

  return true;
}

export function DailyPriceGame() {
  const [challenge, setChallenge] = useState<DailyGameChallengeResponse | null>(null);
  const [orderedItems, setOrderedItems] = useState<DailyGameItem[]>([]);
  const [result, setResult] = useState<DailyGameGuessResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [stats, setStats] = useState<DailyGameStatsState>(() => loadDailyGameStats());

  useEffect(() => {
    let cancelled = false;

    async function loadGame() {
      setIsLoading(true);
      setError(null);

      const todayKey = getUtcDayKeyNow();
      const savedToday = loadSavedResult(todayKey);
      if (savedToday?.challenge && savedToday.challenge.dayKey === todayKey) {
        const savedResult = isSavedResultCompatible(
          savedToday.challenge.items,
          savedToday.result,
        )
          ? savedToday.result
          : null;
        const savedOrder =
          savedToday.orderedMarketHashNames ?? savedResult?.submittedOrder;
        const ordered = savedOrder
          ? savedOrder
              .map((hash) =>
                savedToday.challenge?.items.find(
                  (item) => item.marketHashName === hash,
                ),
              )
              .filter((item): item is DailyGameItem => Boolean(item))
          : savedToday.challenge.items;

        if (!cancelled) {
          setStats(loadDailyGameStats());
          setChallenge(savedToday.challenge);
          setOrderedItems(
            ordered.length === savedToday.challenge.items.length
              ? ordered
              : savedToday.challenge.items,
          );
          setResult(savedResult);
          setIsLoading(false);
        }

        return;
      }

      try {
        const nextChallenge = await fetchDailyGame();
        if (cancelled) {
          return;
        }

        const saved = loadSavedResult(nextChallenge.dayKey);
        const savedResult: DailyGameGuessResponse | null =
          saved && isSavedResultCompatible(nextChallenge.items, saved.result)
            ? saved.result
            : null;
        const savedOrder = saved?.orderedMarketHashNames ?? savedResult?.submittedOrder;
        const ordered = savedOrder
          ? savedOrder
              .map((hash) =>
                nextChallenge.items.find((item) => item.marketHashName === hash),
              )
              .filter((item): item is DailyGameItem => Boolean(item))
          : nextChallenge.items;

        setChallenge(nextChallenge);
        setStats(loadDailyGameStats());
        setOrderedItems(
          ordered.length === nextChallenge.items.length ? ordered : nextChallenge.items,
        );
        setResult(savedResult);
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Failed to load daily game",
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

  const canSubmit = useMemo(() => {
    return Boolean(challenge) && !result && orderedItems.length === 5;
  }, [challenge, orderedItems.length, result]);

  const correctByPosition = useMemo(() => {
    if (!result) {
      return null;
    }

    return result.correctOrder.map((item) => item.marketHashName);
  }, [result]);

  const resultByHash = useMemo(() => {
    if (!result) {
      return null;
    }

    return new Map(
      result.correctOrder.map((item) => [item.marketHashName, item] as const),
    );
  }, [result]);

  const onSubmit = async () => {
    if (!challenge || !canSubmit) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const submittedHashes = orderedItems.map((item) => item.marketHashName);
      const nextResult = await submitDailyGameGuess({
        dayKey: challenge.dayKey,
        orderedMarketHashNames: submittedHashes,
      });

      const nextStats = recordDailyGameResult(
        "order-by-price",
        challenge.dayKey,
        nextResult.allCorrect,
      );
      setResult(nextResult);
      setStats(nextStats);
      saveResult(challenge.dayKey, submittedHashes, nextResult, challenge);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to submit daily game",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="space-y-5 pb-4">
      <article className="rounded-xl border border-[#2b3b4b] bg-gradient-to-b from-[#1a2735]/95 to-[#111925]/95 p-6 shadow-[0_12px_26px_rgba(0,0,0,0.34)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-[#89a9c3]">
              Daily Game
            </p>
            <h2 className="mt-1 text-xl font-semibold text-[#d9e7f5]">Order By Price</h2>
          </div>
          {challenge ? (
            <p className="text-xs text-[#89a9c3]">
              Resets {formatUtcTime(challenge.expiresAt)} (UTC)
            </p>
          ) : null}
        </div>

        <p className="mt-2 text-sm text-[#9fb5ca]">
          Drag to rank today&apos;s 5 items from lowest to highest Steam market price.
        </p>
        <p className="mt-1 text-xs text-[#89a9c3]">
          Record {stats.orderByPrice.wins}/{stats.orderByPrice.played} wins • Streak {stats.orderByPrice.currentStreak}
        </p>

        {isLoading ? <p className="mt-4 text-sm text-[#9fb5ca]">Loading daily game...</p> : null}
        {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}

        {!isLoading && challenge ? (
          <>
            <ul className="mt-4 space-y-2">
              {orderedItems.map((item, index) => {
                const isCorrect =
                  correctByPosition?.[index] === item.marketHashName;
                const showResultStyles = Boolean(result);

                let rowClass =
                  "border-[#2d3f52] bg-[#111b27]/85 hover:bg-[#152131]";

                if (showResultStyles && isCorrect) {
                  rowClass = "border-[#3f6a33] bg-[#1d3221]";
                }

                if (showResultStyles && !isCorrect) {
                  rowClass = "border-[#7b3e3e] bg-[#3a1f24]";
                }

                const showTopDrop = !result && draggingIndex !== null && dropIndex === index;
                const showBottomDrop =
                  !result &&
                  draggingIndex !== null &&
                  dropIndex === index + 1 &&
                  index === orderedItems.length - 1;

                return (
                  <li
                    className={`relative rounded-md border px-3 py-2 transition ${rowClass} ${
                      draggingIndex === index ? "opacity-70" : ""
                    }`}
                    draggable={!result}
                    key={item.marketHashName}
                    onDragEnd={() => {
                      setDraggingIndex(null);
                      setDropIndex(null);
                    }}
                    onDragOver={(event) => {
                      if (result || draggingIndex === null) {
                        return;
                      }

                      event.preventDefault();
                      const rect = event.currentTarget.getBoundingClientRect();
                      const before = event.clientY < rect.top + rect.height / 2;
                      const nextDropIndex = before ? index : index + 1;

                      if (dropIndex !== nextDropIndex) {
                        setDropIndex(nextDropIndex);
                      }
                    }}
                    onDragStart={() => {
                      if (result) {
                        return;
                      }

                      setDraggingIndex(index);
                      setDropIndex(index);
                    }}
                    onDrop={(event) => {
                      if (result || draggingIndex === null) {
                        return;
                      }

                      event.preventDefault();
                      const rect = event.currentTarget.getBoundingClientRect();
                      const before = event.clientY < rect.top + rect.height / 2;
                      const nextDropIndex = before ? index : index + 1;

                      setOrderedItems((current) =>
                        moveItemToDropIndex(current, draggingIndex, nextDropIndex),
                      );
                      setDraggingIndex(null);
                      setDropIndex(null);
                    }}
                  >
                    {showTopDrop ? (
                      <span className="pointer-events-none absolute left-2 right-2 top-0 h-0.5 rounded-full bg-[#66c0f4]" />
                    ) : null}
                    {showBottomDrop ? (
                      <span className="pointer-events-none absolute left-2 right-2 bottom-0 h-0.5 rounded-full bg-[#66c0f4]" />
                    ) : null}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="w-6 text-center text-sm font-semibold text-[#89a9c3]">
                          {index + 1}
                        </span>
                        {item.iconUrl ? (
                          <Image
                            alt={item.displayName}
                            className="rounded-md border border-slate-700 bg-slate-900"
                            height={36}
                            src={item.iconUrl}
                            width={36}
                          />
                        ) : (
                          <span className="h-9 w-9 rounded-md border border-slate-700 bg-slate-900" />
                        )}
                        <span className="truncate text-sm text-[#d9e7f5]">
                          {item.displayName}
                        </span>
                      </div>
                      {!result ? (
                        <div className="flex items-center gap-1">
                          <button
                            className="cursor-pointer rounded-md border border-[#2f4256] bg-[#162230] px-2 py-1 text-xs text-[#c7d5e0] hover:bg-[#1f3245] disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={index === 0}
                            onClick={() => {
                              if (index === 0) {
                                return;
                              }

                              setOrderedItems((current) => moveItem(current, index, index - 1));
                            }}
                            type="button"
                          >
                            Up
                          </button>
                          <button
                            className="cursor-pointer rounded-md border border-[#2f4256] bg-[#162230] px-2 py-1 text-xs text-[#c7d5e0] hover:bg-[#1f3245] disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={index === orderedItems.length - 1}
                            onClick={() => {
                              if (index === orderedItems.length - 1) {
                                return;
                              }

                              setOrderedItems((current) => moveItem(current, index, index + 1));
                            }}
                            type="button"
                          >
                            Down
                          </button>
                          <span className="ml-1 select-none text-xs tracking-[0.06em] text-[#89a9c3]">
                            Drag :::
                          </span>
                        </div>
                      ) : (
                        <div className="text-right">
                          <p
                            className={`text-xs font-semibold ${
                              isCorrect ? "text-[#9fd58f]" : "text-[#f0a5a5]"
                            }`}
                          >
                            {isCorrect ? "Correct" : "Incorrect"}
                          </p>
                          <p className="text-xs text-[#c7d5e0]">
                            {(() => {
                              const priced = resultByHash?.get(item.marketHashName);
                              if (!priced) {
                                return "Price unavailable";
                              }

                              return priced.priceText ?? formatUsd(priced.amount);
                            })()}
                          </p>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            {!result ? (
              <button
                className="mt-4 cursor-pointer rounded-md border border-[#3e5a76] bg-gradient-to-b from-[#5ba6db] to-[#3d6f94] px-4 py-2 text-sm font-semibold text-[#eaf5ff] hover:from-[#6ab6ec] hover:to-[#4680a9] disabled:cursor-not-allowed disabled:opacity-70"
                disabled={!canSubmit || isSubmitting}
                onClick={() => {
                  void onSubmit();
                }}
                type="button"
              >
                {isSubmitting ? "Submitting..." : "Submit Order"}
              </button>
            ) : null}

            {result ? (
              <p className="mt-4 text-sm text-[#9fb5ca]">
                Score: <span className="font-semibold text-[#d9e7f5]">{result.exactMatches}/5 exact</span>
              </p>
            ) : null}
          </>
        ) : null}
      </article>
    </section>
  );
}
