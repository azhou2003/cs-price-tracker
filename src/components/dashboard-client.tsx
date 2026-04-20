"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { fetchItemMeta, fetchItemPrice } from "@/lib/api-client";
import {
  appendPriceSnapshot,
  loadLocalState,
  saveLocalState,
  setWatchlistIcon,
} from "@/lib/storage";
import type { LocalState } from "@/lib/types";

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export function DashboardClient() {
  const [state, setState] = useState<LocalState>(() => loadLocalState());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const watchlist = state.watchlist;

  const summary = useMemo(() => {
    const trackedCount = watchlist.length;
    const snapshots = Object.values(state.historyByItem).flat();
    const latestSnapshot = snapshots
      .slice()
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];

    return {
      trackedCount,
      latestSnapshot,
    };
  }, [state, watchlist.length]);

  useEffect(() => {
    const missingIcons = watchlist.filter((item) => !item.iconUrl);
    if (missingIcons.length === 0) {
      return;
    }

    let cancelled = false;

    async function hydrateIcons() {
      let nextState = loadLocalState();
      let changed = false;

      for (const item of missingIcons) {
        try {
          const meta = await fetchItemMeta(item.marketHashName);
          if (!meta?.iconUrl) {
            continue;
          }

          nextState = setWatchlistIcon(nextState, item.marketHashName, meta.iconUrl);
          changed = true;
        } catch {
          // Ignore metadata failures and keep existing placeholder.
        }
      }

      if (!cancelled && changed) {
        saveLocalState(nextState);
        setState(nextState);
      }
    }

    void hydrateIcons();

    return () => {
      cancelled = true;
    };
  }, [watchlist]);

  const refreshWatchlist = async () => {
    if (watchlist.length === 0) {
      return;
    }

    setIsRefreshing(true);
    setError(null);

    try {
      let nextState = loadLocalState();

      for (const item of watchlist) {
        const snapshot = await fetchItemPrice(item.marketHashName);
        if (snapshot) {
          nextState = appendPriceSnapshot(nextState, snapshot);
        }
      }

      saveLocalState(nextState);
      setState(nextState);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to refresh watchlist",
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <article className="rounded-2xl border border-sky-300/15 bg-slate-900/70 p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-sky-300">Tracked items</p>
          <p className="mt-2 text-3xl font-semibold text-slate-50">{summary.trackedCount}</p>
          <p className="mt-2 text-sm text-slate-300">
            All watchlist data is saved locally in this browser.
          </p>
        </article>

        <article className="rounded-2xl border border-sky-300/15 bg-slate-900/70 p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-sky-300">Latest snapshot</p>
          {summary.latestSnapshot ? (
            <>
              <p className="mt-2 text-lg font-semibold text-slate-50">
                {summary.latestSnapshot.marketHashName}
              </p>
              <p className="mt-1 text-sm text-slate-200">
                {summary.latestSnapshot.lowestPriceText ??
                  formatUsd(summary.latestSnapshot.amount)}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {formatTimestamp(summary.latestSnapshot.timestamp)}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-300">No snapshots captured yet.</p>
          )}
        </article>
      </div>

      <article className="rounded-2xl border border-sky-300/15 bg-slate-900/70 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-slate-50">Watchlist</h2>
          <button
            className="rounded-full bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400"
            onClick={() => {
              void refreshWatchlist();
            }}
            type="button"
          >
            {isRefreshing ? "Refreshing..." : "Refresh All"}
          </button>
        </div>

        {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}

        {watchlist.length === 0 ? (
          <p className="mt-3 text-sm text-slate-300">
            Your watchlist is empty. Start in <Link className="text-sky-300" href="/search">Search</Link>.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {watchlist.map((item) => {
              const latest = state.historyByItem[item.marketHashName]?.at(-1);

              return (
                <li
                  className="rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3"
                  key={item.marketHashName}
                >
                  <Link
                    className="flex items-start justify-between gap-3 hover:text-sky-300"
                    href={`/item/${encodeURIComponent(item.marketHashName)}`}
                  >
                    <span className="flex items-start gap-3">
                      {item.iconUrl ? (
                        <Image
                          alt={item.displayName}
                          className="rounded-md border border-slate-700 bg-slate-900"
                          height={44}
                          src={item.iconUrl}
                          width={44}
                        />
                      ) : (
                        <span className="h-11 w-11 rounded-md border border-slate-700 bg-slate-900" />
                      )}

                      <span>
                        <span className="block text-sm text-slate-50">{item.displayName}</span>
                        <span className="mt-1 block text-xs text-slate-400">
                          Added {formatTimestamp(item.addedAt)}
                        </span>
                      </span>
                    </span>
                    <span className="text-sm font-medium text-slate-200">
                      {latest
                        ? latest.lowestPriceText ?? formatUsd(latest.amount)
                        : "No price yet"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </article>
    </section>
  );
}
