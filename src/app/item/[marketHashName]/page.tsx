import { ItemDetailClient } from "@/components/item-detail-client";
import { fetchSteamPrice } from "@/lib/steam";

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

  let initialPrice = null;

  try {
    initialPrice = await fetchSteamPrice(itemName);
  } catch {
    initialPrice = null;
  }

  return (
    <ItemDetailClient
      displayName={itemName}
      initialPrice={initialPrice}
      marketHashName={itemName}
    />
  );
}
