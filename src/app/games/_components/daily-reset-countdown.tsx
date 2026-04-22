"use client";

import { useEffect, useMemo, useState } from "react";

type DailyResetCountdownProps = {
  expiresAt: string;
};

function formatRemaining(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");

  if (days > 0) {
    return `${days}d ${hh}:${mm}:${ss}`;
  }

  return `${hh}:${mm}:${ss}`;
}

function formatUtcDate(value: string) {
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

export function DailyResetCountdown({ expiresAt }: DailyResetCountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const expiresMs = useMemo(() => Date.parse(expiresAt), [expiresAt]);
  const hasValidDate = Number.isFinite(expiresMs);
  const remaining = hasValidDate ? Math.max(0, expiresMs - now) : 0;

  return (
    <div className="panel-inset px-3 py-2">
      <p className="text-xs text-[var(--text-dim)]">
        Resets in{" "}
        <span className="font-semibold text-[#e2e7ed]">
          {hasValidDate ? formatRemaining(remaining) : "--:--:--"}
        </span>
      </p>
      <p className="text-[11px] text-[var(--text-muted)]">at {formatUtcDate(expiresAt)} (UTC)</p>
    </div>
  );
}
