export const metadata = {
  title: "Search",
};

export default function SearchPage() {
  return (
    <section className="rounded-2xl border border-sky-300/15 bg-slate-900/70 p-6">
      <h2 className="text-2xl font-semibold text-slate-50">Search items</h2>
      <p className="mt-2 text-sm text-slate-300">
        Search UI scaffold is ready. Next step is wiring this page to
        <code className="mx-1 rounded bg-slate-800 px-1 py-0.5 text-slate-100">/api/search</code>
        and showing results from the Steam proxy.
      </p>
    </section>
  );
}
