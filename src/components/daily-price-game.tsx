"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import { GameShareOverlay } from "@/components/game-share-overlay";
import { fetchDailyGame } from "@/lib/api-client";
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
const SHARE_BASE_URL = "https://www.cspricetracker.com";
const ORDER_BY_PRICE_ENDPOINT = "/games#order-by-price";
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

function hasScoringData(item: DailyGameItem) {
  return typeof item.amount === "number" && Number.isFinite(item.amount);
}

function hasChallengeScoringData(challenge: DailyGameChallengeResponse) {
  return challenge.items.every(hasScoringData);
}

function getCorrectOrder(items: DailyGameItem[]) {
  return [...items].sort((left, right) => {
    const leftAmount = left.amount ?? Number.POSITIVE_INFINITY;
    const rightAmount = right.amount ?? Number.POSITIVE_INFINITY;
    if (leftAmount === rightAmount) {
      return left.marketHashName.localeCompare(right.marketHashName);
    }

    return leftAmount - rightAmount;
  });
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
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [hasAutoOpenedShare, setHasAutoOpenedShare] = useState(false);
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

      if (cachedChallenge && hasChallengeScoringData(cachedChallenge)) {
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
    return (
      Boolean(challenge && hasChallengeScoringData(challenge)) &&
      !result &&
      orderedItems.length === 5
    );
  }, [challenge, orderedItems.length, result]);

  const shareUrl = `${SHARE_BASE_URL}${ORDER_BY_PRICE_ENDPOINT}`;
  const shareText = useMemo(() => {
    if (!challenge) {
      return "Play the Daily Order By Price game on CS Price Tracker.";
    }

    if (result) {
      return `I scored ${result.exactMatches}/5 in Daily Order By Price (${challenge.dayKey}) on CS Price Tracker. Can you beat it?`;
    }

    return `Can you beat today's Daily Order By Price challenge (${challenge.dayKey}) on CS Price Tracker?`;
  }, [challenge, result]);

  useEffect(() => {
    if (!isLoading && result && !hasAutoOpenedShare) {
      setIsShareOpen(true);
      setHasAutoOpenedShare(true);
    }
  }, [hasAutoOpenedShare, isLoading, result]);

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

  const onSubmit = () => {
    if (!challenge || !canSubmit) {
      return;
    }

    if (!hasChallengeScoringData(challenge)) {
      setError("Daily game data is stale. Please refresh and try again.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const submittedHashes = orderedItems.map((item) => item.marketHashName);
      const correctOrder = getCorrectOrder(challenge.items);
      const exactMatches = submittedHashes.reduce((count, marketHashName, index) => {
        return correctOrder[index]?.marketHashName === marketHashName ? count + 1 : count;
      }, 0);
      const nextResult = {
        dayKey: challenge.dayKey,
        submittedOrder: submittedHashes,
        exactMatches,
        allCorrect: exactMatches === correctOrder.length,
        correctOrder: correctOrder.map((item, index) => ({
          rank: index + 1,
          marketHashName: item.marketHashName,
          displayName: item.displayName,
          iconUrl: item.iconUrl,
          amount: item.amount ?? 0,
          priceText: item.lowestPriceText,
        })),
      } satisfies DailyGameGuessResponse;

      const nextStats = recordDailyGameResult(
        "order-by-price",
        challenge.dayKey,
        nextResult.allCorrect,
      );
      setResult(nextResult);
      setStats(nextStats);
      saveResult(challenge.dayKey, submittedHashes, nextResult, challenge);
      setIsShareOpen(true);
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

    let rowClass = "border-[var(--line)] bg-[var(--surface-1)] hover:bg-[var(--surface-2)]";

    if (showResultStyles && isCorrect) {
      rowClass = "border-[#56734b] bg-[#273427]";
    }

    if (showResultStyles && !isCorrect) {
      rowClass = "border-[#795158] bg-[#3a292d]";
    }

    if (isGhostRow) {
      return (
        <li
          className="relative select-none rounded-[2px] border border-dashed border-[#637f9c] bg-[#1a2531]/70 px-3 py-2.5 shadow-[inset_0_0_0_1px_rgba(143,170,196,0.14)]"
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
        className={`relative select-none rounded-[2px] border px-3 py-2.5 transition-transform duration-150 ${rowClass}`}
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
            <span className="w-7 text-center text-sm font-semibold text-[var(--text-dim)]">
              {displayIndex + 1}
            </span>
            {item.iconUrl ? (
              <Image
                alt={item.displayName}
                className="rounded-[2px] border border-[#465362] bg-[#10151b]"
                height={40}
                src={item.iconUrl}
                width={40}
              />
            ) : (
              <span className="h-10 w-10 rounded-[2px] border border-[#465362] bg-[#10151b]" />
            )}
            <span className="min-w-0 text-sm leading-snug text-[#e0e5ea] [overflow-wrap:anywhere]">
              {item.displayName}
            </span>
          </div>
          {!result ? (
            <div className="flex items-center justify-end">
              <span
                aria-hidden
                className="ml-1 grid cursor-grab select-none grid-cols-2 gap-0.5 active:cursor-grabbing"
              >
                <span className="h-1 w-1 rounded-full bg-[var(--text-dim)]" />
                <span className="h-1 w-1 rounded-full bg-[var(--text-dim)]" />
                <span className="h-1 w-1 rounded-full bg-[var(--text-dim)]" />
                <span className="h-1 w-1 rounded-full bg-[var(--text-dim)]" />
                <span className="h-1 w-1 rounded-full bg-[var(--text-dim)]" />
                <span className="h-1 w-1 rounded-full bg-[var(--text-dim)]" />
              </span>
            </div>
          ) : (
            <div className="text-right">
              <p
                className={`text-xs font-semibold ${
                  isCorrect ? "text-[#bfdba1]" : "text-[#e5b3b3]"
                }`}
              >
                {isCorrect ? "Correct" : "Incorrect"}
              </p>
              <p className="text-xs text-[#c8d0d8]">
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
    <section className="h-full" id="order-by-price">
      <article className="panel relative flex h-full flex-col p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="label-caps">
              Daily Game
            </p>
            <h2 className="mt-1 text-xl font-semibold text-[#e3e7ec]">Order By Price</h2>
          </div>
        </div>

        <p className="mt-2 text-sm text-[var(--text-dim)]">
          Rank today&apos;s 5 items from lowest to highest Steam market price.
        </p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Record {stats.orderByPrice.wins}/{stats.orderByPrice.played} wins • Streak {stats.orderByPrice.currentStreak}
        </p>

        {isLoading ? <p className="mt-4 text-sm text-[var(--text-dim)]">Loading daily game...</p> : null}
        {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}

        {!isLoading && challenge ? (
          <>
            <ul className="mt-4 space-y-2.5" ref={listRef}>
              {orderedItems.map((item, index) => renderRow(item, index, index))}
            </ul>

            {dragPreview ? (
              <div
                className="pointer-events-none fixed z-40 rounded-[2px] border border-[#5f7792] bg-[#1b2735]/95 px-3 py-2.5 shadow-[0_16px_32px_rgba(0,0,0,0.42)]"
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
                      className="rounded-[2px] border border-[#465362] bg-[#10151b]"
                      height={38}
                      src={dragPreview.item.iconUrl}
                      width={38}
                    />
                  ) : (
                    <span className="h-9 w-9 rounded-[2px] border border-[#465362] bg-[#10151b]" />
                  )}
                  <span className="text-sm font-medium leading-snug text-[#dce1e8] [overflow-wrap:anywhere]">
                    {dragPreview.item.displayName}
                  </span>
                </div>
              </div>
            ) : null}

            {!result ? (
              <button
                className="btn btn-primary mt-4 w-full disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
                disabled={!canSubmit || isSubmitting}
                onClick={() => {
                  onSubmit();
                }}
                type="button"
              >
                {isSubmitting ? "Submitting..." : "Submit Order"}
              </button>
            ) : null}

            {result ? (
              <p className="mt-4 text-sm text-[var(--text-dim)]">
                Score: <span className="font-semibold text-[#dce2e8]">{result.exactMatches}/5 exact</span>
              </p>
            ) : null}

            <GameShareOverlay
              isOpen={isShareOpen}
              onClose={() => {
                setIsShareOpen(false);
              }}
              shareText={shareText}
              shareUrl={shareUrl}
              subtitle="Challenge your friends with today's lineup."
              title="Daily Order By Price"
            />
          </>
        ) : null}
      </article>
    </section>
  );
}
