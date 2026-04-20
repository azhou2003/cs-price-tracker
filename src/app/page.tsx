export default function Home() {
  return (
    <section className="grid gap-4 md:grid-cols-2">
      <article className="rounded-2xl border border-sky-300/15 bg-slate-900/70 p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-sky-300">Status</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-50">Scaffold ready</h2>
        <p className="mt-3 text-sm text-slate-300">
          Next.js app router project is initialized with local-first data modules and
          Steam-proxy API route stubs.
        </p>
      </article>

      <article className="rounded-2xl border border-sky-300/15 bg-slate-900/70 p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-sky-300">MVP Queue</p>
        <ul className="mt-3 space-y-2 text-sm text-slate-200">
          <li>1. Search CS items through normalized proxy endpoint</li>
          <li>2. Save watchlist and settings in local storage</li>
          <li>3. Capture snapshots and render local price history</li>
          <li>4. Add refresh controls and alert thresholds</li>
        </ul>
      </article>
    </section>
  );
}
