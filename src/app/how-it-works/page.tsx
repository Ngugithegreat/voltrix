import type { Metadata } from "next";
import { InfoPage, Section } from "@/components/InfoPage";
import { BRAND_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: `How it works — ${BRAND_NAME}`,
  description: `How trading Volatility Indices on ${BRAND_NAME} works: markets, contracts, deposits and withdrawals.`,
};

export default function HowItWorks() {
  return (
    <InfoPage
      title="How it works"
      intro="Predict which way a Volatility Index will move and win a payout when you're right. Here's everything you need to know."
    >
      <Section heading="1. Fund your account">
        <p>
          Deposit instantly with M-Pesa, card or crypto. The minimum deposit is <b>$5</b>. Your
          balance is shown in USD, with the M-Pesa equivalent in KES displayed as you trade.
        </p>
        <p>
          Want to practise first? Switch to the <b>Demo</b> account from the top bar — you get
          $10,000 in virtual funds on the same live market, with nothing at risk.
        </p>
      </Section>

      <Section heading="2. Pick a market">
        <p>
          You trade <b>Volatility Indices</b> — synthetic markets that move 24/7 and aren't tied to
          any real-world asset or news. Choose from V10, V25, V50, V75 and V100 (and their faster
          1-second versions). Higher numbers move more sharply.
        </p>
      </Section>

      <Section heading="3. Choose a contract">
        <p><b>Rise / Fall</b> — predict whether the price will be higher or lower when your trade ends.</p>
        <p><b>Digits</b> — predict the last digit of the price: Even/Odd, Over/Under a number, or Matches/Differs.</p>
        <p><b>Multipliers</b> — amplify a move in your chosen direction; close whenever you like. Losses are always capped at your stake.</p>
      </Section>

      <Section heading="4. Set your stake and trade">
        <p>
          Enter your stake, pick your duration, and place the trade. You'll see it live on the chart
          with a countdown, and it settles automatically. Tap any trade to see a full receipt.
        </p>
      </Section>

      <Section heading="5. Withdraw your winnings">
        <p>
          Withdrawals are <b>instant</b> to M-Pesa. Because {BRAND_NAME} is a trading platform (not a
          wallet), you need to trade before cashing out — your total trading must at least match
          what you've deposited. Winnings can then be withdrawn freely, subject to daily limits.
        </p>
      </Section>

      <Section heading="A note on risk">
        <p>
          Trading involves risk and you can lose your stake. Never trade money you can't afford to
          lose, and set yourself limits. {BRAND_NAME} is for entertainment and speculative trading.
        </p>
      </Section>
    </InfoPage>
  );
}
