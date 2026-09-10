# Voltrix — Volatility Indices Trading Platform

A professional, simple trading platform where users deposit funds, trade **Volatility Indices** live against Deriv's real price feed, and withdraw their winnings.

- **Live prices** — real Deriv WebSocket feed (Volatility 10/25/50/75/100 Index).
- **Live trading** — Rise/Fall contracts, **settled server-side against the real Deriv ticks** so outcomes can't be faked from the browser.
- **Real wallet** — Postgres-backed ledger. Every stake, payout, deposit and withdrawal is a recorded transaction.
- **Deposits & withdrawals** — users submit requests; an admin approves them (same model as manual mobile-money payouts). A clean adapter is ready for automating M-Pesa/crypto later.
- **Admin panel** — approve/reject deposits and withdrawals, see every user's balance.

## Tech
Next.js 14 (App Router) · TypeScript · Tailwind · Recharts · Neon Postgres · `jose` JWT cookies.

## Setup

1. Create a free Postgres DB at [neon.tech](https://neon.tech) and copy its connection string.
2. Copy `.env.example` to `.env.local` and fill in:
   - `DATABASE_URL` — your Neon connection string
   - `AUTH_SECRET` — run `openssl rand -base64 32`
   - `ADMIN_EMAIL` — the email that should become admin on first signup
   - `NEXT_PUBLIC_DERIV_APP_ID` — leave as `1089` (Deriv's shared test id) or use your own
3. Install & run:
   ```bash
   npm install
   npm run dev
   ```
4. Open http://localhost:3000 , register with your `ADMIN_EMAIL` to get the admin account.

The database tables are created automatically on first API call — no manual migration needed.

## Deploy to Vercel
Push to GitHub and import the repo in Vercel. Add the same four environment variables in
**Project → Settings → Environment Variables**, then redeploy.

## Automated M-Pesa (Safaricom Daraja)
Deposits and withdrawals can settle automatically over M-Pesa. If the M-Pesa env vars are set,
the wallet uses them; otherwise it falls back to manual admin approval (bank/crypto always do).

- **Deposits → STK Push.** The user enters their phone, gets an M-Pesa PIN prompt, and their
  balance is credited when Safaricom confirms. The callback is **not trusted blindly** — the
  server re-queries Daraja (`stkpushquery`) and checks the amount before crediting, and every
  callback URL is gated by a secret token.
- **Withdrawals → B2C.** Funds are reserved immediately and sent to the user's phone; the result
  callback marks it paid or refunds on failure.

### Setup
1. Create an app at [developer.safaricom.co.ke](https://developer.safaricom.co.ke) (sandbox first).
2. Fill the `MPESA_*` vars in `.env.example` (see that file for what each one is).
3. Set `MPESA_CALLBACK_BASE_URL` to your deployment's public https URL and
   `MPESA_CALLBACK_SECRET` to a random string (`openssl rand -hex 16`).
4. Register these callback URLs with Safaricom / your shortcode:
   - STK: `{BASE}/api/mpesa/stk-callback?token={SECRET}`
   - B2C result: `{BASE}/api/mpesa/b2c-result?token={SECRET}`
   - B2C timeout: `{BASE}/api/mpesa/b2c-timeout?token={SECRET}`
5. `USD_KES_RATE` converts the USD wallet to the KES M-Pesa moves (users see the KES amount).

Crypto/bank rails can still be automated later via the `PaymentProvider` interface in
`src/lib/payments.ts`.

> B2C on production requires Safaricom to approve your shortcode and issue an initiator +
> encrypted security credential.

> ⚠️ Trading real money involves financial and regulatory risk. Make sure you are licensed/authorised
> to operate this in your jurisdiction before taking real deposits.
