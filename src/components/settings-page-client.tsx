"use client";

import { useState } from "react";

import { loadLocalState, saveLocalState, updateSettings } from "@/lib/storage";

export function SettingsPageClient() {
  const [refreshMinutes, setRefreshMinutes] = useState(
    () => loadLocalState().settings.refreshIntervalMinutes,
  );
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () => loadLocalState().settings.notificationsEnabled,
  );
  const [saved, setSaved] = useState(false);

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

  return (
    <section className="rounded-2xl border border-sky-300/15 bg-slate-900/70 p-6">
      <h2 className="text-2xl font-semibold text-slate-50">Settings</h2>
      <p className="mt-2 text-sm text-slate-300">
        These preferences are saved only in your browser.
      </p>

      <div className="mt-5 space-y-4">
        <label className="block text-sm text-slate-200" htmlFor="refresh">
          Refresh interval (minutes)
        </label>
        <input
          className="w-full max-w-xs rounded-xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none focus:border-sky-400"
          id="refresh"
          max={120}
          min={1}
          onChange={(event) => {
            setRefreshMinutes(Number(event.target.value));
          }}
          type="number"
          value={refreshMinutes}
        />

        <label className="flex items-center gap-3 text-sm text-slate-200" htmlFor="notifications">
          <input
            checked={notificationsEnabled}
            id="notifications"
            onChange={(event) => {
              setNotificationsEnabled(event.target.checked);
            }}
            type="checkbox"
          />
          Enable local browser notifications
        </label>

        <button
          className="rounded-full bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400"
          onClick={onSave}
          type="button"
        >
          Save Settings
        </button>

        {saved ? <p className="text-sm text-emerald-300">Saved.</p> : null}
      </div>
    </section>
  );
}
