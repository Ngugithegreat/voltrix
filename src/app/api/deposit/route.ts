import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db, ensureSchema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { cents } from "@/lib/format";
import { BRAND_NAME } from "@/lib/brand";
import {
  isMpesaConfigured,
  isProduction,
  normalizePhone,
  centsToKes,
  stkPush,
  callbackBase,
  callbackToken,
} from "@/lib/mpesa";
import {
  isPaystackConfigured,
  initTransaction,
  paystackAmountSubunit,
} from "@/lib/paystack";
import QRCode from "qrcode";
import { isCryptoConfigured, createPayment, isSupportedCoin, CRYPTO_MIN_USD } from "@/lib/crypto-pay";
import { isSoftwaveConfigured, stkPush as swStkPush } from "@/lib/softwave";
import {
  isCollectoConfigured,
  normalizeUgPhone,
  centsToUgx,
  requestToPay,
} from "@/lib/collecto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const amount = cents(Number(body.amount));
  const method = String(body.method || "manual");
  const reference = String(body.reference || "").trim();

  if (!Number.isFinite(amount) || amount < 500) {
    return NextResponse.json({ error: "Minimum deposit is $5.00." }, { status: 400 });
  }
  if (amount > 100000000) {
    return NextResponse.json({ error: "Amount too large." }, { status: 400 });
  }

  await ensureSchema();
  const sql = db();
  const base = callbackBase(req.url);
  const usd = amount / 100;

  // ---------- M-Pesa via SoftWave Global (preferred PSP when configured) ----------
  if (method === "mpesa" && isSoftwaveConfigured()) {
    const phone = normalizePhone(reference);
    if (!phone) {
      return NextResponse.json(
        { error: "Enter a valid M-Pesa phone number (e.g. 0712345678)." },
        { status: 400 }
      );
    }
    const amountKes = centsToKes(amount);
    const merchantRef = `swd_${session.id}_${randomUUID().slice(0, 12)}`;
    const sw = await swStkPush({ amountKes, phone, reference: merchantRef, description: `${BRAND_NAME} deposit` });
    if (!sw.ok) {
      return NextResponse.json({ error: sw.error || "Could not start the M-Pesa prompt. Try again." }, { status: 502 });
    }
    const rows = (await sql`
      INSERT INTO voltrix_transactions
        (user_id, type, amount, status, method, reference, provider_ref, note)
      VALUES
        (${session.id}, 'deposit', ${amount}, 'pending', 'mpesa', ${phone},
         ${sw.data.transaction_id}, ${"STK sent · SoftWave · KES " + amountKes})
      RETURNING *
    `) as any[];
    return NextResponse.json({
      ok: true,
      mpesa: true,
      softwave: true,
      amountKes,
      checkoutRequestId: sw.data.transaction_id,
      transaction: rows[0],
      message: "Check your phone and enter your M-Pesa PIN to complete the deposit.",
    });
  }

  // ---------- M-Pesa (Daraja STK Push) — fallback when SoftWave isn't set ----------
  if (method === "mpesa") {
    if (!isMpesaConfigured()) {
      return NextResponse.json(
        {
          error:
            "M-Pesa isn’t available right now. (Admin: set the SOFTWAVE_API_KEY or MPESA_* variables in Vercel and redeploy.)",
        },
        { status: 503 }
      );
    }
    const phone = normalizePhone(reference);
    if (!phone) {
      return NextResponse.json(
        { error: "Enter a valid M-Pesa phone number (e.g. 0712345678)." },
        { status: 400 }
      );
    }
    const amountKes = centsToKes(amount);
    try {
      const token = callbackToken();
      const callbackUrl = `${base}/api/mpesa/stk-callback${
        token ? `?token=${encodeURIComponent(token)}` : ""
      }`;
      const stk = await stkPush({
        phone,
        amountKes,
        accountRef: `AT${session.id}`,
        description: `${BRAND_NAME} deposit`,
        callbackUrl,
      });
      const rows = (await sql`
        INSERT INTO voltrix_transactions
          (user_id, type, amount, status, method, reference, provider_ref, note)
        VALUES
          (${session.id}, 'deposit', ${amount}, 'pending', 'mpesa', ${phone},
           ${stk.CheckoutRequestID}, ${"STK push sent · KES " + amountKes})
        RETURNING *
      `) as any[];
      return NextResponse.json({
        ok: true,
        mpesa: true,
        amountKes,
        checkoutRequestId: stk.CheckoutRequestID,
        transaction: rows[0],
        message: "Check your phone and enter your M-Pesa PIN to complete the deposit.",
      });
    } catch (e: any) {
      return NextResponse.json(
        {
          error:
            (e?.message || "Could not start the M-Pesa prompt. Try again.") +
            ` [Daraja env: ${isProduction() ? "production" : "sandbox"}]`,
        },
        { status: 502 }
      );
    }
  }

  // ---------- Card / Bank (Paystack hosted checkout) ----------
  if ((method === "card" || method === "bank") && isPaystackConfigured()) {
    try {
      const ref = `atk_${session.id}_${randomUUID().slice(0, 12)}`;
      const init = await initTransaction({
        email: session.email,
        amountSubunit: paystackAmountSubunit(usd),
        reference: ref,
        callbackUrl: `${base}/wallet?deposit=processing`,
        metadata: { userId: session.id, method },
      });
      await sql`
        INSERT INTO voltrix_transactions
          (user_id, type, amount, status, method, provider_ref, note)
        VALUES
          (${session.id}, 'deposit', ${amount}, 'pending', ${method}, ${init.reference},
           ${"Awaiting " + method + " payment"})
      `;
      return NextResponse.json({ ok: true, redirect: true, redirectUrl: init.authorization_url });
    } catch (e: any) {
      return NextResponse.json(
        { error: e?.message || "Could not start card/bank checkout." },
        { status: 502 }
      );
    }
  }

  // ---------- Crypto (NOWPayments invoice) ----------
  if (method === "crypto" && isCryptoConfigured()) {
    // Small crypto deposits get eaten by network fees, so enforce a floor.
    if (usd < CRYPTO_MIN_USD) {
      return NextResponse.json(
        { error: `Minimum crypto deposit is $${CRYPTO_MIN_USD.toFixed(2)}.` },
        { status: 400 }
      );
    }
    const coin = isSupportedCoin(String(body.coin || "")) ? String(body.coin) : "usdttrc20";
    try {
      const orderId = `atc_${session.id}_${randomUUID().slice(0, 12)}`;
      const token = callbackToken();
      const payment = await createPayment({
        amountUsd: usd,
        orderId,
        payCurrency: coin,
        ipnUrl: `${base}/api/crypto/webhook${token ? `?token=${encodeURIComponent(token)}` : ""}`,
      });
      await sql`
        INSERT INTO voltrix_transactions
          (user_id, type, amount, status, method, provider_ref, reference, receipt, note)
        VALUES
          (${session.id}, 'deposit', ${amount}, 'pending', 'crypto', ${orderId},
           ${payment.payAddress}, ${payment.paymentId}, ${"Awaiting " + payment.payCurrency.toUpperCase() + " payment"})
      `;
      // QR of the address so users can scan-to-pay (generated locally, no third party).
      let qr: string | null = null;
      try {
        qr = await QRCode.toDataURL(payment.payAddress, { margin: 1, width: 220 });
      } catch {
        /* QR is optional */
      }
      return NextResponse.json({
        ok: true,
        crypto: {
          paymentId: payment.paymentId,
          address: payment.payAddress,
          amount: payment.payAmount,
          currency: payment.payCurrency,
          network: payment.network,
          usd,
          qr,
        },
      });
    } catch (e: any) {
      return NextResponse.json(
        { error: e?.message || "Could not create the crypto payment." },
        { status: 502 }
      );
    }
  }

  // ---------- Uganda mobile money (MTN / Airtel via Collecto) ----------
  if (method === "mtn" || method === "airtel") {
    if (!isCollectoConfigured()) {
      return NextResponse.json(
        {
          error:
            "Mobile money isn’t available right now. (Admin: set the COLLECTO_* variables in Vercel and redeploy.)",
        },
        { status: 503 }
      );
    }
    const phone = normalizeUgPhone(reference);
    if (!phone) {
      return NextResponse.json(
        { error: "Enter a valid Ugandan phone (e.g. 0772123456)." },
        { status: 400 }
      );
    }
    const amountUgx = centsToUgx(amount);
    const ref = `atug_${session.id}_${randomUUID().slice(0, 12)}`;
    try {
      await requestToPay({ amountUgx, phone, reference: ref, gateway: method });
      await sql`
        INSERT INTO voltrix_transactions
          (user_id, type, amount, status, method, reference, provider_ref, note)
        VALUES
          (${session.id}, 'deposit', ${amount}, 'pending', ${method}, ${phone}, ${ref},
           ${"Prompt sent · UGX " + amountUgx})
      `;
      return NextResponse.json({
        ok: true,
        poll: true,
        ref,
        amountUgx,
        message: `Check your phone and approve the ${method.toUpperCase()} prompt to complete the deposit.`,
      });
    } catch (e: any) {
      return NextResponse.json(
        { error: e?.message || "Could not start the mobile-money prompt. Try again." },
        { status: 502 }
      );
    }
  }

  // ---------- Manual fallback (admin approval) ----------
  const rows = (await sql`
    INSERT INTO voltrix_transactions (user_id, type, amount, status, method, reference, note)
    VALUES (${session.id}, 'deposit', ${amount}, 'pending', ${method}, ${reference}, 'Deposit request')
    RETURNING *
  `) as any[];

  return NextResponse.json({ ok: true, transaction: rows[0] });
}
