"use client";

import { useEffect, useState } from "react";

import { buildShareMessage } from "@/lib/share";

type GameShareOverlayProps = {
  isOpen: boolean;
  title: string;
  subtitle: string;
  shareText: string;
  shareUrl: string;
  onClose: () => void;
};

export function GameShareOverlay({
  isOpen,
  title,
  subtitle,
  shareText,
  shareUrl,
  onClose,
}: GameShareOverlayProps) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");

  useEffect(() => {
    setCopyStatus("idle");
  }, [shareText, shareUrl, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const onCopy = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      setCopyStatus("error");
      return;
    }

    try {
      await navigator.clipboard.writeText(buildShareMessage(shareText, shareUrl));
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center p-3 pointer-events-none sm:p-4">
      <article className="panel pointer-events-auto w-[min(28rem,100%)] p-3 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="label-caps">Share Result</p>
            <h3 className="mt-1 text-lg font-semibold text-[#e6edf4]">{title}</h3>
            <p className="mt-1 text-sm text-[var(--text-dim)]">{subtitle}</p>
          </div>
          <button className="btn btn-danger" onClick={onClose} type="button">
            X
          </button>
        </div>

        <div className="panel-inset mt-4 p-3">
          <p className="text-xs text-[var(--text-muted)]">Preview</p>
          <p className="mt-1 text-sm leading-relaxed text-[#d3dae1]">{shareText}</p>
          <a
            className="mt-1 inline-block text-sm font-medium text-[#9ec6ea] underline underline-offset-2 hover:text-[#b7d8f4]"
            href={shareUrl}
            rel="noreferrer"
            target="_blank"
          >
            {shareUrl}
          </a>
        </div>

        <div className="mt-3 flex items-center justify-end gap-2">
          <button className="btn btn-muted" onClick={() => {
            void onCopy();
          }} type="button">
            {copyStatus === "copied" ? "Copied" : copyStatus === "error" ? "Copy failed" : "Copy"}
          </button>
        </div>
      </article>
    </div>
  );
}
