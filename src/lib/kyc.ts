import { db } from "./db";

// Withdrawals at or above this amount require an approved KYC verification.
export const KYC_THRESHOLD_CENTS = 20000; // $200

export function requiresKyc(amountCents: number): boolean {
  return amountCents >= KYC_THRESHOLD_CENTS;
}

/** Current KYC status for a user: none | pending | approved | rejected. */
export async function getKycStatus(userId: number): Promise<string> {
  const sql = db();
  const rows = (await sql`
    SELECT kyc_status FROM voltrix_users WHERE id = ${userId} LIMIT 1
  `) as Array<{ kyc_status: string | null }>;
  return rows.length ? rows[0].kyc_status || "none" : "none";
}
