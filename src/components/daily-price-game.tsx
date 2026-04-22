"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

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

type SavedDailyChallengeCache = {
  dayKey: string;
  challenge: DailyGameChallengeResponse;
};

const MOBILE_LONG_PRESS_MS = 90;
const TOUCH_MOVE_CANCEL_PX = 5;
const DAILY_GAME_CHALLENGE_CACHE_KEY = "cs-price-tracker:daily-game-challenge:v1";
const EMPTY_STATS: DailyGameStatsState = {
  orderByPrice: { played: 0, wins: 0, currentStreak: 0, bestStreak: 0 },
  priceGuess: { played: 0, wins: 0, currentStreak: 0, bestStreak: 0 },
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

function loadCachedChallenge(dayKey: string) {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(DAILY_GAME_CHALLENGE_CACHE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as SavedDailyChallengeCache;
    if (parsed.dayKey !== dayKey || !parsed.challenge) {
      return null;
    }

    return parsed.challenge;
  } catch {
    return null;
  }
}

function saveCachedChallenge(challenge: DailyGameChallengeResponse) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    DAILY_GAME_CHALLENGE_CACHE_KEY,
    JSON.stringify({
      dayKey: challenge.dayKey,
      challenge,
    } satisfies SavedDailyChallengeCache),
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
  const [activeDragHash, setActiveDragHash] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<{
    item: DailyGameItem;
    left: number;
    width: number;
    offsetY: number;
    clientY: number;
  } | null>(null);
  const [stats, setStats] = useState<DailyGameStatsState>(EMPTY_STATS);
  const listRef = useRef<HTMLUListElement | null>(null);
  const rowRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const dragHoldTimeoutRef = useRef<number | null>(null);
  const dragPointerIdRef = useRef<number | null>(null);
  const activeDragHashRef = useRef<string | null>(null);
  const pendingTouchRef = useRef<{
    pointerId: number;
    index: number;
    startX: number;
    startY: number;
    latestY: number;
    rowRect: DOMRect;
    listRect: DOMRect;
  } | null>(null);
  const moveRafRef = useRef<number | null>(null);
  const pendingMoveYRef = useRef<number | null>(null);

  const clearDragHoldTimeout = () => {
    if (dragHoldTimeoutRef.current !== null) {
      window.clearTimeout(dragHoldTimeoutRef.current);
      dragHoldTimeoutRef.current = null;
    }
  };

  const clearMoveRaf = () => {
    if (moveRafRef.current !== null) {
      window.cancelAnimationFrame(moveRafRef.current);
      moveRafRef.current = null;
    }
  };

  const clearPendingTouch = () => {
    pendingTouchRef.current = null;
    clearDragHoldTimeout();
  };

  const clearDragState = () => {
    clearPendingTouch();
    clearMoveRaf();
    pendingMoveYRef.current = null;
    setActiveDragHash(null);
    setDragPreview(null);
    dragPointerIdRef.current = null;
    activeDragHashRef.current = null;
  };

  const getInsertIndexForClientY = (
    clientY: number,
    items: DailyGameItem[],
    activeHash: string,
  ) => {
    const withoutActive = items.filter((item) => item.marketHashName !== activeHash);

    for (let index = 0; index < withoutActive.length; index += 1) {
      const item = withoutActive[index];
      const row = rowRefs.current[item.marketHashName];
      if (!row) {
        continue;
      }

      const rect = row.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        return index;
      }
    }

    return withoutActive.length;
  };

  const startDrag = (
    index: number,
    pointerId: number,
    clientY: number,
    rowRect: DOMRect,
    listRect: DOMRect,
  ) => {
    const item = orderedItems[index];
    if (!item) {
      return;
    }

    clearPendingTouch();
    dragPointerIdRef.current = pointerId;
    activeDragHashRef.current = item.marketHashName;
    setActiveDragHash(item.marketHashName);
    setDragPreview({
      item,
      left: listRect.left,
      width: listRect.width,
      offsetY: clientY - rowRect.top,
      clientY,
    });
  };

  useEffect(() => {
    return () => {
      clearPendingTouch();
      clearMoveRaf();
      pendingMoveYRef.current = null;
      dragPointerIdRef.current = null;
      activeDragHashRef.current = null;
    };
  }, []);

  useEffect(() => {
    setStats(loadDailyGameStats());
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadGame() {
      setIsLoading(true);
      setError(null);

      const todayKey = getUtcDayKeyNow();
      const savedToday = loadSavedResult(todayKey);
      const cachedChallenge =
        savedToday?.challenge && savedToday.challenge.dayKey === todayKey
          ? savedToday.challenge
          : loadCachedChallenge(todayKey);

      if (cachedChallenge) {
        const savedResult = isSavedResultCompatible(
          cachedChallenge.items,
          savedToday?.result,
        )
          ? savedToday?.result
          : null;
        const savedOrder =
          savedToday?.orderedMarketHashNames ?? savedResult?.submittedOrder;
        const ordered = savedOrder
          ? savedOrder
              .map((hash) =>
                cachedChallenge.items.find((item) => item.marketHashName === hash),
              )
              .filter((item): item is DailyGameItem => Boolean(item))
          : cachedChallenge.items;

        if (!cancelled) {
          setStats(loadDailyGameStats());
          setChallenge(cachedChallenge);
          setOrderedItems(
            ordered.length === cachedChallenge.items.length
              ? ordered
              : cachedChallenge.items,
          );
          setResult(savedResult ?? null);
          setIsLoading(false);
        }

        return;
      }

      try {
        const nextChallenge = await fetchDailyGame();
        if (cancelled) {
          return;
        }

        saveCachedChallenge(nextChallenge);

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

  const processDragMove = (clientY: number) => {
    const activeHash = activeDragHashRef.current;
    if (!activeHash) {
      return;
    }

    setDragPreview((currentPreview) =>
      currentPreview ? { ...currentPreview, clientY } : currentPreview,
    );
    setOrderedItems((currentItems) => {
      const activeIndex = currentItems.findIndex(
        (item) => item.marketHashName === activeHash,
      );
      if (activeIndex === -1) {
        return currentItems;
      }

      const nextIndex = getInsertIndexForClientY(clientY, currentItems, activeHash);
      if (nextIndex === activeIndex) {
        return currentItems;
      }

      return moveItem(currentItems, activeIndex, nextIndex);
    });
  };

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const pendingTouch = pendingTouchRef.current;
      if (pendingTouch && event.pointerId === pendingTouch.pointerId) {
        const deltaX = event.clientX - pendingTouch.startX;
        const deltaY = event.clientY - pendingTouch.startY;
        const moved = Math.hypot(deltaX, deltaY) > TOUCH_MOVE_CANCEL_PX;
        if (moved) {
          clearPendingTouch();
          return;
        }

        pendingTouch.latestY = event.clientY;
        if (event.pointerType === "touch" && event.cancelable) {
          event.preventDefault();
        }
        return;
      }

      if (dragPointerIdRef.current === null || event.pointerId !== dragPointerIdRef.current) {
        return;
      }

      pendingMoveYRef.current = event.clientY;
      if (moveRafRef.current === null) {
        moveRafRef.current = window.requestAnimationFrame(() => {
          moveRafRef.current = null;
          const nextY = pendingMoveYRef.current;
          if (typeof nextY !== "number") {
            return;
          }

          processDragMove(nextY);
        });
      }

      if (event.pointerType === "touch" && event.cancelable) {
        event.preventDefault();
      }
    };

    const onPointerEnd = (event: PointerEvent) => {
      const pendingTouch = pendingTouchRef.current;
      if (pendingTouch && event.pointerId === pendingTouch.pointerId) {
        clearPendingTouch();
        return;
      }

      if (dragPointerIdRef.current === null || event.pointerId !== dragPointerIdRef.current) {
        return;
      }

      clearDragState();
    };

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
    };
  }, []);

  const isDragging = !result && activeDragHash !== null;

  const renderRow = (
    item: DailyGameItem,
    itemIndex: number,
    displayIndex: number,
  ) => {
    const isCorrect = correctByPosition?.[itemIndex] === item.marketHashName;
    const showResultStyles = Boolean(result);
    const isGhostRow = isDragging && activeDragHash === item.marketHashName;

    let rowClass = "border-[#2d3f52] bg-[#111b27]/85 hover:bg-[#152131]";

    if (showResultStyles && isCorrect) {
      rowClass = "border-[#3f6a33] bg-[#1d3221]";
    }

    if (showResultStyles && !isCorrect) {
      rowClass = "border-[#7b3e3e] bg-[#3a1f24]";
    }

    if (isGhostRow) {
      return (
        <li
          className="relative select-none rounded-lg border border-dashed border-[#66c0f4] bg-[#122739]/70 px-4 py-3 shadow-[inset_0_0_0_1px_rgba(102,192,244,0.18)]"
          key={item.marketHashName}
          ref={(node) => {
            rowRefs.current[item.marketHashName] = node;
          }}
          style={{
            touchAction: "none",
          }}
        >
          <div className="h-10" />
        </li>
      );
    }

    return (
      <li
        className={`relative select-none rounded-lg border px-4 py-3 transition-transform duration-150 ${rowClass}`}
        key={item.marketHashName}
        ref={(node) => {
          rowRefs.current[item.marketHashName] = node;
        }}
        style={{
          touchAction: result ? "auto" : "none",
        }}
        onPointerCancel={() => {
          clearDragHoldTimeout();
        }}
        onPointerDown={(event) => {
          if (result || isDragging) {
            return;
          }

          if (event.pointerType === "mouse" && event.button !== 0) {
            return;
          }

          const rowRect = event.currentTarget.getBoundingClientRect();
          const listRect = listRef.current?.getBoundingClientRect();
          if (!listRect) {
            return;
          }

          const beginDrag = () => {
            startDrag(itemIndex, event.pointerId, event.clientY, rowRect, listRect);
          };

          clearPendingTouch();
          if (event.pointerType === "touch") {
            pendingTouchRef.current = {
              pointerId: event.pointerId,
              index: itemIndex,
              startX: event.clientX,
              startY: event.clientY,
              latestY: event.clientY,
              rowRect,
              listRect,
            };
            dragHoldTimeoutRef.current = window.setTimeout(() => {
              const pendingTouch = pendingTouchRef.current;
              if (!pendingTouch || pendingTouch.pointerId !== event.pointerId) {
                return;
              }

              startDrag(
                pendingTouch.index,
                pendingTouch.pointerId,
                pendingTouch.latestY,
                pendingTouch.rowRect,
                pendingTouch.listRect,
              );
            }, MOBILE_LONG_PRESS_MS);
            return;
          }

          event.preventDefault();
          beginDrag();
        }}
        onPointerLeave={() => {
          clearPendingTouch();
        }}
        onPointerUp={() => {
          clearPendingTouch();
        }}
      >
        <div className="flex items-start justify-between gap-3 sm:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <span className="w-7 text-center text-sm font-semibold text-[#89a9c3]">
              {displayIndex + 1}
            </span>
            {item.iconUrl ? (
              <Image
                alt={item.displayName}
                className="rounded-md border border-slate-700 bg-slate-900"
                height={40}
                src={item.iconUrl}
                width={40}
              />
            ) : (
              <span className="h-10 w-10 rounded-md border border-slate-700 bg-slate-900" />
            )}
            <span className="min-w-0 text-sm leading-snug text-[#d9e7f5] [overflow-wrap:anywhere]">
              {item.displayName}
            </span>
          </div>
          {!result ? (
            <div className="flex items-center justify-end">
              <span
                aria-hidden
                className="ml-1 grid cursor-grab select-none grid-cols-2 gap-0.5 active:cursor-grabbing"
              >
                <span className="h-1 w-1 rounded-full bg-[#89a9c3]" />
                <span className="h-1 w-1 rounded-full bg-[#89a9c3]" />
                <span className="h-1 w-1 rounded-full bg-[#89a9c3]" />
                <span className="h-1 w-1 rounded-full bg-[#89a9c3]" />
                <span className="h-1 w-1 rounded-full bg-[#89a9c3]" />
                <span className="h-1 w-1 rounded-full bg-[#89a9c3]" />
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
  };

  return (
    <section className="h-full">
      <article className="flex h-full flex-col rounded-xl border border-[#2b3b4b] bg-gradient-to-b from-[#1a2735]/95 to-[#111925]/95 p-4 shadow-[0_12px_26px_rgba(0,0,0,0.34)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-[#89a9c3]">
              Daily Game
            </p>
            <h2 className="mt-1 text-xl font-semibold text-[#d9e7f5]">Order By Price</h2>
          </div>
        </div>

        <p className="mt-2 text-sm text-[#9fb5ca]">
          Rank today&apos;s 5 items from lowest to highest Steam market price.
        </p>
        <p className="mt-1 text-xs text-[#89a9c3]">
          Record {stats.orderByPrice.wins}/{stats.orderByPrice.played} wins • Streak {stats.orderByPrice.currentStreak}
        </p>

        {isLoading ? <p className="mt-4 text-sm text-[#9fb5ca]">Loading daily game...</p> : null}
        {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}

        {!isLoading && challenge ? (
          <>
            <ul className="mt-4 space-y-2.5" ref={listRef}>
              {orderedItems.map((item, index) => renderRow(item, index, index))}
            </ul>

            {dragPreview ? (
              <div
                className="pointer-events-none fixed z-40 rounded-lg border border-[#66c0f4] bg-[#142536]/95 px-4 py-3 shadow-[0_16px_32px_rgba(0,0,0,0.42)]"
                style={{
                  left: `${dragPreview.left}px`,
                  top: `${Math.max(8, dragPreview.clientY - dragPreview.offsetY)}px`,
                  width: `${dragPreview.width}px`,
                }}
              >
                <div className="flex items-center gap-3">
                  {dragPreview.item.iconUrl ? (
                    <Image
                      alt={dragPreview.item.displayName}
                      className="rounded-md border border-slate-700 bg-slate-900"
                      height={38}
                      src={dragPreview.item.iconUrl}
                      width={38}
                    />
                  ) : (
                    <span className="h-9 w-9 rounded-md border border-slate-700 bg-slate-900" />
                  )}
                  <span className="text-sm font-medium leading-snug text-[#d9e7f5] [overflow-wrap:anywhere]">
                    {dragPreview.item.displayName}
                  </span>
                </div>
              </div>
            ) : null}

            {!result ? (
              <button
                className="mt-4 w-full cursor-pointer rounded-md border border-[#3e5a76] bg-gradient-to-b from-[#5ba6db] to-[#3d6f94] px-4 py-2.5 text-sm font-semibold text-[#eaf5ff] hover:from-[#6ab6ec] hover:to-[#4680a9] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
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
