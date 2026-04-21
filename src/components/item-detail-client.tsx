"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchItemPrice } from "@/lib/api-client";
import {
  addToWatchlist,
  appendPriceSnapshot,
  DEFAULT_STATE,
  isTracked,
  loadLocalState,
  removeFromWatchlist,
  saveLocalState,
} from "@/lib/storage";
import type { LocalState, PriceSnapshot } from "@/lib/types";

type ItemDetailClientProps = {
  marketHashName: string;
  displayName: string;
  initialPrice: PriceSnapshot | null;
  iconUrl?: string;
};

function formatTimestamp(value: string) {
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

export function ItemDetailClient({
  marketHashName,
  displayName,
  initialPrice,
  iconUrl,
}: ItemDetailClientProps) {
  const [state, setState] = useState<LocalState>(DEFAULT_STATE);
  const [price, setPrice] = useState<PriceSnapshot | null>(initialPrice);
  const [isLoadingPrice, setIsLoadingPrice] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setState(loadLocalState());
    }, 0);

    return () => {
      window.clearTimeout(timeout);
    };
  }, []);

  const history = useMemo(() => {
    return state.historyByItem[marketHashName] ?? [];
  }, [state, marketHashName]);

  const tracked = isTracked(state, marketHashName);

  const pullPrice = useCallback(async () => {
    setIsLoadingPrice(true);
    setError(null);

    try {
      const latest = await fetchItemPrice(marketHashName);
      setPrice(latest);

      if (latest) {
        const nextState = appendPriceSnapshot(loadLocalState(), latest);
        saveLocalState(nextState);
        setState(nextState);
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to load price",
      );
    } finally {
      setIsLoadingPrice(false);
    }
  }, [marketHashName]);

  const toggleWatchlist = () => {
    const current = loadLocalState();
    const next = isTracked(current, marketHashName)
      ? removeFromWatchlist(current, marketHashName)
      : addToWatchlist(current, {
          marketHashName,
          displayName,
          iconUrl,
        });

    saveLocalState(next);
    setState(next);
  };

  const latestKnown = price ?? history.at(-1) ?? null;

  return (
    <section className="space-y-4">
      <article className="rounded-2xl border border-sky-300/15 bg-slate-900/70 p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-sky-300">Item detail</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-50">{displayName}</h2>

        {iconUrl ? (
          <div className="mt-4 inline-flex rounded-xl border border-slate-700 bg-slate-950/60 p-2">
            <Image
              alt={displayName}
              height={96}
              priority
              src={iconUrl}
              width={96}
            />
          </div>
        ) : null}

        <p className="mt-2 text-sm text-slate-300">Hash name: {marketHashName}</p>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            className="rounded-full bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400"
            onClick={() => {
              void pullPrice();
            }}
            type="button"
          >
            {isLoadingPrice ? "Refreshing..." : "Refresh Price"}
          </button>

          <button
            className="rounded-full bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-700"
            onClick={toggleWatchlist}
            type="button"
          >
            {tracked ? "Remove from Watchlist" : "Add to Watchlist"}
          </button>
        </div>

        <div className="mt-5 rounded-xl border border-slate-700 bg-slate-950/60 p-4">
          {error ? (
            <p className="text-sm text-rose-300">{error}</p>
          ) : latestKnown ? (
            <>
              <p className="text-sm text-slate-300">Current lowest price</p>
              <p className="mt-1 text-3xl font-semibold text-slate-50">
                {latestKnown.lowestPriceText ?? formatUsd(latestKnown.amount)}
              </p>
              <p className="mt-2 text-xs text-slate-400">
                Updated {formatTimestamp(latestKnown.timestamp)}
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-300">No local price data yet.</p>
          )}
        </div>
      </article>

      <article className="rounded-2xl border border-sky-300/15 bg-slate-900/70 p-6">
        <h3 className="text-lg font-semibold text-slate-50">Local price history</h3>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-slate-300">No snapshots yet. Refresh price to collect history.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm text-slate-200">
            {[...history]
              .reverse()
              .slice(0, 12)
              .map((entry) => (
                <li
                  key={`${entry.timestamp}-${entry.amount}`}
                  className="flex items-center justify-between rounded-lg bg-slate-950/60 px-3 py-2"
                >
                  <span>{formatTimestamp(entry.timestamp)}</span>
                  <span className="font-medium">
                    {entry.lowestPriceText ?? formatUsd(entry.amount)}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </article>
    </section>
  );
}
