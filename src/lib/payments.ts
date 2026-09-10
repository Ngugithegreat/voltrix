// Payment provider adapter.
//
// v1 settles deposits & withdrawals by ADMIN APPROVAL (see /admin). To automate
// payouts (M-Pesa STK push, crypto, bank, etc.) implement this interface with
// your provider's SDK + keys (added as Vercel env vars) and swap `manualProvider`
// for it in the deposit/withdraw routes. The wallet ledger already records the
// resulting transactions, so no schema changes are needed.

export type PayoutRequest = {
  userId: number;
  amount: number; // cents
  method: string; // "mpesa" | "crypto" | ...
  reference: string; // phone number / wallet address / account
};

export type PayoutResult = {
  ok: boolean;
  providerRef?: string;
  message?: string;
};

export interface PaymentProvider {
  /** Kick off collecting money FROM the user (deposit). */
  collect(req: PayoutRequest): Promise<PayoutResult>;
  /** Kick off sending money TO the user (withdrawal). */
  payout(req: PayoutRequest): Promise<PayoutResult>;
}

// Default provider: everything is left pending for an admin to approve.
export const manualProvider: PaymentProvider = {
  async collect() {
    return { ok: true, message: "Awaiting admin confirmation" };
  },
  async payout() {
    return { ok: true, message: "Awaiting admin approval" };
  },
};
