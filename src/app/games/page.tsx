import { DailyGamesFacts } from "@/app/games/_components/daily-games-facts";
import { DailyGamesResetBanner } from "@/app/games/_components/daily-games-reset-banner";
import { DailyOrderByPriceGame } from "@/app/games/_components/daily-order-by-price-game";
import { DailyPriceGuessGame } from "@/app/games/_components/daily-price-guess-game";

export const metadata = {
  title: "Daily Games",
};

export default function GamesPage() {
  return (
    <section className="space-y-5">
      <DailyGamesResetBanner />
      <DailyGamesFacts />
      <div className="grid gap-5 lg:grid-cols-2">
        <DailyOrderByPriceGame />
        <DailyPriceGuessGame />
      </div>
    </section>
  );
}
