import { DailyGamesFacts } from "@/components/daily-games-facts";
import { DailyGamesResetBanner } from "@/components/daily-games-reset-banner";
import { DailyPriceGame } from "@/components/daily-price-game";
import { DailyPriceGuessGame } from "@/components/daily-price-guess-game";

export const metadata = {
  title: "Daily Games",
};

export default function GamesPage() {
  return (
    <section className="space-y-5">
      <DailyGamesResetBanner />
      <DailyGamesFacts />
      <div className="grid gap-5 lg:grid-cols-2">
        <DailyPriceGame />
        <DailyPriceGuessGame />
      </div>
    </section>
  );
}
