"use client";

import { useEffect, useState } from "react";

import {
  clearLocalState,
  DEFAULT_STATE,
  loadLocalState,
  saveLocalState,
  updateSettings,
} from "@/lib/storage";

export function SettingsPageClient() {
  const [refreshMinutes, setRefreshMinutes] = useState(
    DEFAULT_STATE.settings.refreshIntervalMinutes,
  );
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    DEFAULT_STATE.settings.notificationsEnabled,
  );
  const [saved, setSaved] = useState(false);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const state = loadLocalState();
      setRefreshMinutes(state.settings.refreshIntervalMinutes);
      setNotificationsEnabled(state.settings.notificationsEnabled);
    }, 0);

    return () => {
      window.clearTimeout(timeout);
    };
  }, []);

  const onSave = () => {
    const current = loadLocalState();
    const next = updateSettings(current, {
      refreshIntervalMinutes: Math.min(Math.max(refreshMinutes, 1), 120),
      notificationsEnabled,
    });

    saveLocalState(next);
    setSaved(true);
    window.setTimeout(() => {
      setSaved(false);
    }, 1500);
  };

  const onClear = () => {
    const confirmed = window.confirm(
      "Clear all local data? This removes watchlist, history, and settings from this browser.",
    );

    if (!confirmed) {
      return;
    }

    clearLocalState();
    setRefreshMinutes(DEFAULT_STATE.settings.refreshIntervalMinutes);
    setNotificationsEnabled(DEFAULT_STATE.settings.notificationsEnabled);
    setSaved(false);
    setCleared(true);
    window.setTimeout(() => {
      setCleared(false);
    }, 2000);
  };

  return (
    <section className="rounded-xl border border-[#2b3b4b] bg-gradient-to-b from-[#1a2735]/95 to-[#111925]/95 p-6 shadow-[0_12px_26px_rgba(0,0,0,0.34)]">
      <h2 className="text-2xl font-semibold text-[#d9e7f5]">Settings</h2>
      <p className="mt-2 text-sm text-[#9fb5ca]">
        These preferences are saved only in your browser.
      </p>

      <div className="mt-5 space-y-4">
        <label className="block text-sm text-[#c7d5e0]" htmlFor="refresh">
          Refresh interval (minutes)
        </label>
        <input
          className="w-full max-w-xs rounded-md border border-[#31465d] bg-[#0d141d] px-4 py-3 text-[#d9e7f5] outline-none focus:border-[#66c0f4]"
          id="refresh"
          max={120}
          min={1}
          onChange={(event) => {
            setRefreshMinutes(Number(event.target.value));
          }}
          type="number"
          value={refreshMinutes}
        />

        <label className="cursor-pointer flex items-center gap-3 text-sm text-[#c7d5e0]" htmlFor="notifications">
          <input
            checked={notificationsEnabled}
            className="cursor-pointer"
            id="notifications"
            onChange={(event) => {
              setNotificationsEnabled(event.target.checked);
            }}
            type="checkbox"
          />
          Enable local browser notifications
        </label>
        <p className="text-xs text-[#89a9c3]">
          This toggle stores your preference for future price alerts. Alerts are not being
          sent yet until threshold notifications are implemented.
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            className="cursor-pointer rounded-md border border-[#3e5a76] bg-gradient-to-b from-[#5ba6db] to-[#3d6f94] px-4 py-2 text-sm font-semibold text-[#eaf5ff] hover:from-[#6ab6ec] hover:to-[#4680a9]"
            onClick={onSave}
            type="button"
          >
            Save Settings
          </button>

          <button
            className="cursor-pointer rounded-md border border-[#6a3f3f] bg-gradient-to-b from-[#7e4040] to-[#5a2f2f] px-4 py-2 text-sm font-semibold text-[#ffe8e8] hover:from-[#965050] hover:to-[#6b3939]"
            onClick={onClear}
            type="button"
          >
            Clear Local Data
          </button>
        </div>

        {saved ? <p className="text-sm text-emerald-300">Saved.</p> : null}
        {cleared ? <p className="text-sm text-amber-300">Local data cleared.</p> : null}
      </div>
    </section>
  );
}
