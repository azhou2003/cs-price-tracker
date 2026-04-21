import { DailyPriceGame } from "@/components/daily-price-game";
import { DailyPriceGuessGame } from "@/components/daily-price-guess-game";

export const metadata = {
  title: "Daily Games",
};

export default function GamesPage() {
  return (
    <section className="space-y-5">
      <DailyPriceGame />
      <DailyPriceGuessGame />
    </section>
  );
}
