"use client";

import { type ChangeEvent, useEffect, useState } from "react";

import {
  clearLocalState,
  DEFAULT_STATE,
  exportBackupPayload,
  importBackupPayload,
  loadLocalState,
  saveLocalState,
  updateSettings,
} from "@/lib/storage";

export function SettingsPageClient() {
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(
    DEFAULT_STATE.settings.autoRefreshEnabled,
  );
  const [refreshMinutes, setRefreshMinutes] = useState(
    DEFAULT_STATE.settings.refreshIntervalMinutes,
  );
  const [saved, setSaved] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const state = loadLocalState();
      setAutoRefreshEnabled(state.settings.autoRefreshEnabled);
      setRefreshMinutes(state.settings.refreshIntervalMinutes);
    }, 0);

    return () => {
      window.clearTimeout(timeout);
    };
  }, []);

  const onSave = () => {
    const current = loadLocalState();
    const next = updateSettings(current, {
      autoRefreshEnabled,
      refreshIntervalMinutes: Math.min(Math.max(refreshMinutes, 1), 120),
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
    setAutoRefreshEnabled(DEFAULT_STATE.settings.autoRefreshEnabled);
    setRefreshMinutes(DEFAULT_STATE.settings.refreshIntervalMinutes);
    setSaved(false);
    setCleared(true);
    window.setTimeout(() => {
      setCleared(false);
    }, 2000);
  };

  const onExportBackup = () => {
    const payload = exportBackupPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = window.URL.createObjectURL(blob);
    const date = new Date().toISOString().slice(0, 10);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `cs-price-tracker-backup-${date}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
  };

  const onImportBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setImportMessage(null);
    setImportError(null);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const result = importBackupPayload(parsed);

      if (!result.ok) {
        setImportError(result.error);
        return;
      }

      const state = loadLocalState();
      setAutoRefreshEnabled(state.settings.autoRefreshEnabled);
      setRefreshMinutes(state.settings.refreshIntervalMinutes);
      setSaved(false);
      setCleared(false);
      setImportMessage("Backup imported successfully.");
    } catch {
      setImportError("Unable to import backup file.");
    } finally {
      event.target.value = "";
    }
  };

  return (
    <section className="space-y-4">
      <article className="panel p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="label-caps">Configuration</p>
            <h2 className="mt-1 text-xl font-semibold text-[#e3e8ed]">Settings</h2>
          </div>
          <span className="chip chip-neutral">Local profile</span>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <section className="panel-inset p-3 sm:p-4">
            <p className="label-caps">Watchlist Refresh</p>
            <p className="mt-1 text-sm text-[#d8dee5]">
              Control automatic refresh behavior for the main dashboard.
            </p>

            <fieldset aria-describedby="refresh-help" className="mt-4 space-y-3">
              <legend className="sr-only">Auto refresh settings</legend>
              <label className="flex items-center gap-3 text-sm text-[#d8dee5]" htmlFor="auto-refresh-toggle">
                <input
                  checked={autoRefreshEnabled}
                  className="cursor-pointer"
                  id="auto-refresh-toggle"
                  onChange={(event) => {
                    setAutoRefreshEnabled(event.target.checked);
                  }}
                  type="checkbox"
                />
                Enable auto-refresh
              </label>

              <div>
                <label
                  className="block text-xs font-semibold uppercase tracking-[0.08em] text-[#a9b2bc]"
                  htmlFor="refresh"
                >
                  Refresh interval (minutes)
                </label>
                <input
                  className="field no-spinner mt-2 max-w-[220px]"
                  disabled={!autoRefreshEnabled}
                  id="refresh"
                  max={120}
                  min={1}
                  onChange={(event) => {
                    setRefreshMinutes(Number(event.target.value));
                  }}
                  type="number"
                  value={refreshMinutes}
                />
              </div>
            </fieldset>

            <p className="mt-3 text-xs text-[var(--text-muted)]" id="refresh-help">
              Runs every 1-120 minutes while the watchlist page remains open.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn btn-primary" onClick={onSave} type="button">
                Save Settings
              </button>
            </div>
            {saved ? <p className="mt-2 text-sm text-[#cde6b0]">Settings saved.</p> : null}
          </section>

          <div className="space-y-4">
            <section className="panel-inset p-3 sm:p-4">
              <p className="label-caps">Data Backup</p>
              <p className="mt-1 text-sm text-[#d8dee5]">
                Export and import a JSON snapshot of your local watchlist, game progress,
                and stats.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <button className="btn btn-muted" onClick={onExportBackup} type="button">
                  Export Backup
                </button>
                <label className="btn btn-muted cursor-pointer" htmlFor="backup-import">
                  Import Backup
                </label>
                <input
                  accept="application/json"
                  className="sr-only"
                  id="backup-import"
                  onChange={(event) => {
                    void onImportBackup(event);
                  }}
                  type="file"
                />
              </div>

              <p className="mt-3 text-xs text-[var(--text-muted)]">
                Keep backups before clearing browser data or switching devices.
              </p>
              {importMessage ? <p className="mt-2 text-sm text-[#cde6b0]">{importMessage}</p> : null}
              {importError ? <p className="mt-2 text-sm text-rose-300">{importError}</p> : null}
            </section>

            <section className="panel-inset border-[#4d3a3a] p-3 sm:p-4">
              <p className="label-caps">Danger Zone</p>
              <p className="mt-1 text-sm text-[#e2d5d5]">
                Remove all local watchlist, history, game progress, and settings from this browser.
              </p>
              <div className="mt-4">
                <button className="btn btn-danger" onClick={onClear} type="button">
                  Clear Local Data
                </button>
              </div>
              {cleared ? <p className="mt-2 text-sm text-[#e5cd9f]">Local data cleared.</p> : null}
            </section>
          </div>
        </div>
      </article>

      <article className="panel-inset p-3 sm:p-4">
        <p className="label-caps">Local Storage Notice</p>
        <p className="mt-1 text-sm text-[#d8dee5]">
          Watchlist, history, daily games progress, and settings are stored only on this
          browser profile.
        </p>
        <p className="mt-1 text-xs text-[var(--text-dim)]">
          Switching devices or clearing browser storage will permanently remove this data.
        </p>
      </article>
    </section>
  );
}
