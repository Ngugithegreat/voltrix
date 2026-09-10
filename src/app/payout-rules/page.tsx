import type { Metadata } from "next";
import { InfoPage, Section } from "@/components/InfoPage";
import { PAYOUT_MULTIPLIER } from "@/lib/markets";
import { BRAND_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Payout rules — ${BRAND_NAME}`,
  description: `How payouts, stakes and settlement work on ${BRAND_NAME}.`,
};

export default function PayoutRules() {
  return (
    <InfoPage
      title="Payout rules"
      intro="Clear, upfront rules on how trades are priced, settled and paid."
    >
      <Section heading="How trades settle">
        <p>
          Rise/Fall and Digit trades settle automatically at expiry against the live market price at
          that moment. Multiplier positions settle when you close them, or automatically if they hit
          their stop-out level. Every settled trade shows its entry and exit on the receipt.
        </p>
      </Section>

      <Section heading="Payouts">
        <p>
          <b>Rise / Fall</b> pays up to <b>{PAYOUT_MULTIPLIER}×</b> your stake on a win, so a $10
          winning trade returns about ${(10 * PAYOUT_MULTIPLIER).toFixed(2)}.
        </p>
        <p>
          <b>Digits</b> payouts depend on how likely the prediction is — narrower predictions (e.g.
          Matches an exact digit) pay more than even-money ones (Even/Odd).
        </p>
        <p>
          <b>Multipliers</b> pay your stake plus the amplified move in your favour; a losing
          multiplier can never lose more than your stake.
        </p>
      </Section>

      <Section heading="Stakes and limits">
        <p>
          Minimum stake is $1 per trade. Maximum stake and maximum payout per trade are capped for
          risk management; you'll see a message if a stake exceeds the limit.
        </p>
      </Section>

      <Section heading="The margin">
        <p>
          Like every trading platform, a small house margin is built into payouts — that's how the
          platform operates. Winners always receive more than their stake back.
        </p>
      </Section>

      <Section heading="Deposits & withdrawals">
        <p>
          Minimum deposit is $5. Deposits and M-Pesa payouts convert at published USD/KES rates; the
          withdrawal rate differs slightly from the deposit rate. Withdrawals are instant, subject to
          per-account daily limits and the requirement to have traded before cashing out.
        </p>
      </Section>
    </InfoPage>
  );
}
