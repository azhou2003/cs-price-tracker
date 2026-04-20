type ItemPageProps = {
  params: Promise<{ marketHashName: string }>;
};

export async function generateMetadata({ params }: ItemPageProps) {
  const { marketHashName } = await params;
  return {
    title: `Item ${decodeURIComponent(marketHashName)}`,
  };
}

export default async function ItemPage({ params }: ItemPageProps) {
  const { marketHashName } = await params;
  const itemName = decodeURIComponent(marketHashName);

  return (
    <section className="rounded-2xl border border-sky-300/15 bg-slate-900/70 p-6">
      <p className="text-xs uppercase tracking-[0.2em] text-sky-300">Item detail</p>
      <h2 className="mt-2 text-2xl font-semibold text-slate-50">{itemName}</h2>
      <p className="mt-2 text-sm text-slate-300">
        Detail page scaffold is ready. Price card, watchlist actions, and local history
        chart will be added here.
      </p>
    </section>
  );
}
