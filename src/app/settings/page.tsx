export const metadata = {
  title: "Settings",
};

export default function SettingsPage() {
  return (
    <section className="rounded-2xl border border-sky-300/15 bg-slate-900/70 p-6">
      <h2 className="text-2xl font-semibold text-slate-50">Settings</h2>
      <p className="mt-2 text-sm text-slate-300">
        Settings scaffold is ready for refresh interval, currency display, and local
        notifications.
      </p>
    </section>
  );
}
