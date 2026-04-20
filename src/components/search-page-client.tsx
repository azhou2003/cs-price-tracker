"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { searchItems } from "@/lib/api-client";
import type { MarketItem } from "@/lib/types";

function formatUsd(value?: number) {
  if (typeof value !== "number") {
    return null;
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export function SearchPageClient() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MarketItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) {
      return;
    }

    const timeout = window.setTimeout(async () => {
      setIsLoading(true);
      setError(null);

      try {
        const nextResults = await searchItems(value);
        setResults(nextResults);
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Failed to search items",
        );
      } finally {
        setIsLoading(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [query]);

  return (
    <section className="space-y-4">
      <article className="rounded-2xl border border-sky-300/15 bg-slate-900/70 p-6">
        <h2 className="text-2xl font-semibold text-slate-50">Search items</h2>
        <p className="mt-2 text-sm text-slate-300">
          Search for any Counter-Strike skin name to see current market listings.
        </p>
        <label className="mt-4 block text-sm text-slate-300" htmlFor="query">
          Item name
        </label>
        <input
          className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none focus:border-sky-400"
          id="query"
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);

            if (nextQuery.trim().length < 2) {
              setResults([]);
              setError(null);
            }
          }}
          placeholder="AK-47 Redline"
          value={query}
        />
      </article>

      <article className="rounded-2xl border border-sky-300/15 bg-slate-900/70 p-6">
        {isLoading ? (
          <p className="text-sm text-slate-300">Searching Steam market...</p>
        ) : error ? (
          <p className="text-sm text-rose-300">{error}</p>
        ) : query.trim().length < 2 ? (
          <p className="text-sm text-slate-300">Type at least 2 characters to search.</p>
        ) : results.length === 0 ? (
          <p className="text-sm text-slate-300">No items found.</p>
        ) : (
          <ul className="space-y-3">
            {results.map((item) => (
              <li
                className="rounded-xl border border-slate-700 bg-slate-950/60 p-4"
                key={item.marketHashName}
              >
                <Link
                  className="flex items-start justify-between gap-3 hover:text-sky-300"
                  href={`/item/${encodeURIComponent(item.marketHashName)}`}
                >
                  <span>
                    <span className="block text-sm text-slate-50">{item.displayName}</span>
                    <span className="mt-1 block text-xs text-slate-400">
                      {item.listingCount ?? 0} active listings
                    </span>
                  </span>
                  <span className="text-sm font-medium text-slate-200">
                    {item.startingPriceText ?? formatUsd(item.startingPrice) ?? "N/A"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  );
}
