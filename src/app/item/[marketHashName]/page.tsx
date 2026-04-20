import { ItemDetailClient } from "@/components/item-detail-client";
import { fetchSteamItemByHash, fetchSteamPrice } from "@/lib/steam";

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
  let initialIconUrl: string | undefined;

  try {
    const [price, item] = await Promise.all([
      fetchSteamPrice(itemName),
      fetchSteamItemByHash(itemName),
    ]);

    initialPrice = price;
    initialIconUrl = item?.iconUrl;
  } catch {
    initialPrice = null;
    initialIconUrl = undefined;
  }

  return (
    <ItemDetailClient
      displayName={itemName}
      iconUrl={initialIconUrl}
      initialPrice={initialPrice}
      marketHashName={itemName}
    />
  );
}
