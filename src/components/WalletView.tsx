"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Clock,
  CheckCircle2,
  XCircle,
  TrendingUp,
  TrendingDown,
  Smartphone,
  CreditCard,
  Landmark,
  Bitcoin,
  Loader2,
  Copy,
  Check,
  FlaskConical,
  RotateCcw,
  Lock,
} from "lucide-react";
import { useApp, Txn } from "./app-context";
import { money, shortTime } from "@/lib/format";
import { railsForCountry } from "@/lib/countries";
import { ListSkeleton } from "./Skeleton";
import { NotificationToggle } from "./NotificationToggle";

type MethodDef = { id: string; label: string; hint: string; icon: any };

const METHOD_DEFS: Record<string, MethodDef> = {
  mpesa: { id: "mpesa", label: "M-Pesa", hint: "Phone e.g. 0712345678", icon: Smartphone },
  mtn: { id: "mtn", label: "MTN", hint: "Phone e.g. 0772123456", icon: Smartphone },
  airtel: { id: "airtel", label: "Airtel", hint: "Phone e.g. 0752123456", icon: Smartphone },
  card: { id: "card", label: "Card", hint: "", icon: CreditCard },
  bank: { id: "bank", label: "Bank", hint: "Account number / name", icon: Landmark },
  crypto: { id: "crypto", label: "Crypto", hint: "USDT / BTC & more", icon: Bitcoin },
};

// Minimum crypto deposit in USD (mirrors the server's CRYPTO_MIN_USD). Small
// crypto deposits are eaten by network fees, so we set a floor and show it.
const CRYPTO_MIN_USD = Number(process.env.NEXT_PUBLIC_CRYPTO_MIN_USD || 20);

// Pretty-print a stored MSISDN (2547XXXXXXXX) as +254 7XX XXX XXX.
function fmtLocalPhone(p: string | null | undefined): string {
  const d = String(p || "").replace(/\D/g, "");
  if (d.startsWith("254") && d.length === 12) return `+254 ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}`;
  return p || "";
}

// Deposit rails come from the user's country.
function depositMethods(country: string | null | undefined): string[] {
  return railsForCountry(country);
}
function withdrawMethods(country: string | null | undefined): string[] {
  const out: string[] = [];
  for (const r of railsForCountry(country)) out.push(r === "card" ? "bank" : r);
  return Array.from(new Set(out));
}

export function WalletView() {
  const { user, balance, data, config, refresh, setBalance, loading, demo } = useApp();
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");
  const rate = config?.usdKesRate ?? 130;
  const withdrawRate = config?.usdKesWithdrawRate ?? 127;
  const country = user?.country ?? null;

  // Open on the tab the nav's Deposit/Withdraw button asked for (?action=…),
  // and react if it changes while already on the wallet.
  const searchParams = useSearchParams();
  const action = searchParams.get("action");
  useEffect(() => {
    if (action === "withdraw") setTab("withdraw");
    else if (action === "deposit") setTab("deposit");
  }, [action]);

  // Returning from a hosted checkout (?deposit=processing) — confirm & poll.
  const [processing, setProcessing] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search).get("deposit");
    if (p === "processing") {
      setProcessing(true);
      window.history.replaceState({}, "", "/wallet");
      let n = 0;
      const id = setInterval(() => {
        n += 1;
        refresh();
        if (n >= 15) {
          clearInterval(id);
          setProcessing(false);
        }
      }, 4000);
      return () => clearInterval(id);
    }
  }, [refresh]);

  return (
    <div className="space-y-5">
      {/* Balance banner */}
      <div className={`card relative overflow-hidden p-6 ${demo ? "border-gold/40" : ""}`}>
        <div className={`pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full blur-3xl ${demo ? "bg-gold/20" : "bg-brand/20"}`} />
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted">
          {demo ? "Demo balance" : "Available balance"}
          {demo && (
            <span className="rounded-md bg-gold/15 px-1.5 py-0.5 text-[10px] font-bold text-gold">
              PRACTICE
            </span>
          )}
        </div>
        <div className={`tabular mt-1 text-4xl font-black ${demo ? "text-gold" : "text-fg"}`}>
          {loading ? "—" : money(balance)}
        </div>
        <div className="mt-1 text-xs text-muted">
          {demo
            ? "Virtual funds for practice on the live market — not real money."
            : "Funds are held securely and settle to your withdrawals on request."}
        </div>
      </div>

      {processing && (
        <div className="card flex items-center gap-3 border-brand/40 p-4">
          <Loader2 className="h-5 w-5 animate-spin text-brand" />
          <div>
            <div className="text-sm font-semibold">Confirming your payment…</div>
            <div className="text-xs text-muted">
              Your balance updates automatically once the payment is confirmed.
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        {/* Money form (real) / Demo panel */}
        {demo ? (
          <DemoPanel onDone={(bal) => setBalance(bal)} refresh={refresh} />
        ) : (
          <div className="card p-5">
            <div className="mb-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => setTab("deposit")}
                className={`btn py-2 ${tab === "deposit" ? "btn-brand" : "btn-ghost"}`}
              >
                <ArrowDownToLine className="h-4 w-4" /> Deposit
              </button>
              <button
                onClick={() => setTab("withdraw")}
                className={`btn py-2 ${tab === "withdraw" ? "btn-brand" : "btn-ghost"}`}
              >
                <ArrowUpFromLine className="h-4 w-4" /> Withdraw
              </button>
            </div>
            {tab === "deposit" ? (
              <MoneyForm
                kind="deposit"
                max={Infinity}
                rate={rate}
                methodIds={depositMethods(country)}
                mpesaAutomated={!!config?.mpesaDeposit}
                defaultPhone={user?.phone ?? null}
                config={config}
                refresh={refresh}
                onDone={(newBal) => {
                  if (newBal != null) setBalance(newBal);
                  refresh();
                }}
              />
            ) : (
              <MoneyForm
                kind="withdraw"
                max={balance}
                rate={withdrawRate}
                methodIds={withdrawMethods(country)}
                mpesaAutomated={!!config?.mpesaWithdraw}
                defaultPhone={user?.phone ?? null}
                config={config}
                refresh={refresh}
                onDone={(newBal) => {
                  if (newBal != null) setBalance(newBal);
                  refresh();
                }}
              />
            )}
          </div>
        )}

        {/* Transactions — scoped to the active account */}
        <div className="card overflow-hidden">
          <div className="border-b border-border px-5 py-3 font-bold">
            Recent activity
          </div>
          {loading && !data ? (
            <ListSkeleton rows={5} />
          ) : (
            <TxnList txns={(data?.transactions ?? []).filter((t) => !!t.is_demo === demo)} />
          )}
        </div>
      </div>

      {!demo && <NotificationToggle />}
    </div>
  );
}

function DemoPanel({
  onDone,
  refresh,
}: {
  onDone: (balance: number) => void;
  refresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function reset() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/demo/reset", { method: "POST" });
      const j = await res.json();
      if (res.ok && typeof j.demoBalance === "number") {
        onDone(j.demoBalance);
        setMsg("Demo balance reset to $10,000.00.");
        await refresh();
      } else {
        setMsg(j.error || "Could not reset. Try again.");
      }
    } catch {
      setMsg("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 text-sm font-bold">
        <FlaskConical className="h-4 w-4 text-gold" /> Demo account
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        You’re practising with <b className="text-gold">virtual funds</b> on the same live market
        as real trading. Nothing here is real money — a great way to learn the platform and test
        strategies risk-free. Switch back to <b>Real</b> in the top bar anytime.
      </p>
      <button
        onClick={reset}
        disabled={busy}
        className="btn btn-ghost mt-4 w-full border border-gold/40 py-2.5 text-sm text-gold"
      >
        <RotateCcw className="h-4 w-4" /> {busy ? "Resetting…" : "Reset demo balance to $10,000"}
      </button>
      {msg && <p className="mt-2 text-center text-xs text-muted">{msg}</p>}
    </div>
  );
}

function StkStatusPanel({
  data,
  state,
  onReset,
}: {
  data: { phone: string; amountKes: number };
  state: { state: string; desc: string };
  onReset: () => void;
}) {
  const s = state.state;
  const done = s === "success";
  const failed = ["cancelled", "timeout", "insufficient", "wrong_pin", "failed"].includes(s);
  const pending = !done && !failed;

  const title = done
    ? "Payment received"
    : s === "cancelled"
    ? "Request cancelled"
    : s === "timeout"
    ? "Prompt timed out"
    : s === "insufficient"
    ? "Insufficient balance"
    : s === "wrong_pin"
    ? "Wrong PIN"
    : failed
    ? "Payment failed"
    : "Waiting for your PIN";

  return (
    <div className="flex flex-col items-center py-6 text-center">
      {done ? (
        <CheckCircle2 className="h-12 w-12 text-up" />
      ) : failed ? (
        <XCircle className="h-12 w-12 text-down" />
      ) : (
        <div className="relative flex h-14 w-14 items-center justify-center">
          <Loader2 className="absolute h-14 w-14 animate-spin text-brand/40" />
          <Smartphone className="h-6 w-6 text-brand" />
        </div>
      )}

      <div className="mt-3 text-lg font-bold">{title}</div>
      <div className="mt-1 max-w-xs text-sm text-muted">
        {done
          ? `KES ${data.amountKes.toLocaleString("en-US")} received — your balance is updated.`
          : state.desc || "Check your phone…"}
      </div>

      {/* Step tracker */}
      <div className="mt-5 flex w-full max-w-xs flex-col gap-2 text-left text-xs">
        <Step label="Prompt sent to your phone" active done />
        <Step label="Enter your M-Pesa PIN" active={pending || done} done={done} spin={pending} />
        <Step
          label={done ? "Payment confirmed" : failed ? title : "Confirming payment"}
          active={done || failed}
          done={done}
          failed={failed}
        />
      </div>

      <div className="mt-6 flex gap-2">
        {(done || failed) && (
          <button onClick={onReset} className="btn btn-brand px-5 py-2.5 text-sm">
            {done ? "New deposit" : "Try again"}
          </button>
        )}
        {pending && (
          <button onClick={onReset} className="btn btn-ghost px-5 py-2.5 text-sm">
            Cancel
          </button>
        )}
      </div>
      <div className="mt-3 tabular text-[11px] text-muted">{data.phone}</div>
    </div>
  );
}

function Step({
  label,
  active,
  done,
  failed,
  spin,
}: {
  label: string;
  active?: boolean;
  done?: boolean;
  failed?: boolean;
  spin?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 ${active ? "text-fg" : "text-muted/50"}`}>
      {done ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-up" />
      ) : failed ? (
        <XCircle className="h-4 w-4 shrink-0 text-down" />
      ) : spin ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand" />
      ) : (
        <div className={`h-3.5 w-3.5 shrink-0 rounded-full border ${active ? "border-brand" : "border-border"}`} />
      )}
      {label}
    </div>
  );
}

function CryptoDepositPanel({
  data,
  status,
  onReset,
}: {
  data: { address: string; amount: number; currency: string; network: string | null; usd: number; qr: string | null };
  status: "waiting" | "confirming" | "done" | "failed";
  onReset: () => void;
}) {
  const [copied, setCopied] = useState(false);
  async function copyAddr() {
    try {
      await navigator.clipboard.writeText(data.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* select manually */
    }
  }

  if (status === "done") {
    return (
      <div className="flex flex-col items-center py-6 text-center">
        <CheckCircle2 className="h-12 w-12 text-up" />
        <div className="mt-3 text-lg font-bold">Payment received</div>
        <div className="mt-1 text-sm text-muted">
          ${data.usd.toFixed(2)} has been credited to your balance.
        </div>
        <button onClick={onReset} className="btn btn-brand mt-5 px-5 py-2.5">
          Make another deposit
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-sm font-bold">Send crypto to complete your deposit</div>
      <p className="text-xs text-muted">
        Send <b className="text-fg">~{data.amount} {data.currency.toUpperCase()}</b>
        {data.network ? ` on the ${data.network.toUpperCase()} network` : ""} to the address below.
        We credit the <b className="text-fg">exact amount that arrives</b> (after network
        fees), automatically once the network confirms.
      </p>

      {data.qr && (
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={data.qr} alt="Deposit address QR" className="rounded-xl border border-border bg-white p-1" width={180} height={180} />
        </div>
      )}

      <div>
        <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted">
          {data.currency.toUpperCase()} address
        </label>
        <div className="flex gap-2">
          <div className="tabular flex-1 break-all rounded-xl border border-border bg-surface2 px-3 py-2.5 text-xs">
            {data.address}
          </div>
          <button onClick={copyAddr} className="btn btn-brand shrink-0 px-3 py-2.5 text-sm">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div
        className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${
          status === "failed" ? "border-down/40 text-down" : "border-brand/40 text-fg"
        }`}
      >
        {status === "failed" ? (
          <>
            <XCircle className="h-4 w-4 text-down" /> Payment failed or expired. Start a new deposit.
          </>
        ) : (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-brand" />
            {status === "confirming" ? "Payment detected — confirming on-chain…" : "Waiting for your payment…"}
          </>
        )}
      </div>

      <div className="rounded-xl border border-gold/30 bg-gold/5 px-3 py-2 text-[11px] text-muted">
        Send only <b>{data.currency.toUpperCase()}</b> to this address. Sending a different coin or network may lose your funds.
      </div>

      <button onClick={onReset} className="btn btn-ghost w-full py-2.5 text-sm">
        {status === "failed" ? "Start over" : "Cancel"}
      </button>
    </div>
  );
}


// Coins users can pay in (kept in the client so we avoid importing the
// server-only crypto lib). Mirrors CRYPTO_COINS in src/lib/crypto-pay.ts.
const CRYPTO_COINS = [
  { code: "usdttrc20", label: "USDT", note: "TRC20" },
  { code: "usdterc20", label: "USDT", note: "ERC20" },
  { code: "btc", label: "Bitcoin", note: "BTC" },
  { code: "eth", label: "Ethereum", note: "ETH" },
  { code: "trx", label: "TRON", note: "TRX" },
  { code: "bnbbsc", label: "BNB", note: "BSC" },
];

function MoneyForm({
  kind,
  max,
  rate,
  methodIds,
  mpesaAutomated,
  defaultPhone,
  config,
  refresh,
  onDone,
}: {
  kind: "deposit" | "withdraw";
  max: number;
  rate: number;
  methodIds: string[];
  mpesaAutomated: boolean;
  defaultPhone?: string | null;
  config: import("./app-context").AppConfig | null;
  refresh: () => Promise<void>;
  onDone: (newBalance: number | null) => void;
}) {
  const methods = methodIds.map((id) => METHOD_DEFS[id]).filter(Boolean);

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState(methods[0]?.id ?? "card");
  const [reference, setReference] = useState("");
  const [coin, setCoin] = useState("usdttrc20");
  const [cryptoPay, setCryptoPay] = useState<any | null>(null);
  const [cryptoStatus, setCryptoStatus] = useState<"waiting" | "confirming" | "done" | "failed">("waiting");
  const [stkPay, setStkPay] = useState<{ checkoutRequestId: string; phone: string; amountKes: number } | null>(null);
  const [stkState, setStkState] = useState<{ state: string; desc: string }>({ state: "pending", desc: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const methodDef = METHOD_DEFS[method] ?? METHOD_DEFS.card;
  const amountNum = Number(amount) || 0;
  const isMpesa = method === "mpesa";
  const isUgMobile = method === "mtn" || method === "airtel";
  const needsPhone = isMpesa || isUgMobile;
  const automated =
    (isMpesa && mpesaAutomated) || (isUgMobile && !!config?.ugMobileDeposit);
  const kes = Math.max(0, Math.round(amountNum * rate));

  // Card/bank/crypto deposits go to a hosted checkout (gateway collects details).
  const gatewayReady =
    (method === "card" || method === "bank") ? !!config?.cardDeposit : method === "crypto" ? !!config?.cryptoDeposit : false;
  const isHostedDeposit = kind === "deposit" && gatewayReady;
  const showReference = kind === "withdraw" || (kind === "deposit" && !isHostedDeposit);

  // Phone methods (M-Pesa / MTN / Airtel) are LOCKED to the account's verified
  // profile phone — it can't be edited here; the user changes it under Profile
  // (with SMS verification). Non-phone methods start blank (crypto = wallet
  // address, etc.).
  useEffect(() => {
    setReference(needsPhone ? defaultPhone || "" : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, defaultPhone]);

  function rememberPhone(p: string) {
    try {
      localStorage.setItem("st_phone", p);
    } catch {
      /* ignore */
    }
  }

  // Live STK status — polls the PSP so the user sees PIN prompt → paid / cancelled.
  // SoftWave and Daraja return the same {state, desc, credited, balance} shape.
  function pollStk(checkoutRequestId: string, softwave?: boolean) {
    let n = 0;
    const id = setInterval(async () => {
      n += 1;
      try {
        const url = softwave
          ? `/api/softwave/status?id=${encodeURIComponent(checkoutRequestId)}`
          : `/api/mpesa/stk-status?checkoutRequestId=${encodeURIComponent(checkoutRequestId)}`;
        const res = await fetch(url, {
          cache: "no-store",
        });
        const json = await res.json();
        setStkState({ state: json.state || "pending", desc: json.desc || "" });
        if (json.credited) {
          clearInterval(id);
          setStkState({ state: "success", desc: "Payment received." });
          if (typeof json.balance === "number") onDone(json.balance);
          refresh();
        } else if (["cancelled", "timeout", "insufficient", "wrong_pin", "failed"].includes(json.state)) {
          clearInterval(id);
        }
      } catch {
        /* keep polling */
      }
      if (n >= 40) clearInterval(id); // ~3 min
    }, 4500);
  }

  function resetStk() {
    setStkPay(null);
    setStkState({ state: "pending", desc: "" });
    setAmount("");
    setMsg(null);
    refresh();
  }

  // After an automated M-Pesa action, poll the wallet so the status flips from
  // pending to done (or the balance updates) without a manual refresh.
  function startPolling() {
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      refresh();
      if (n >= 12) clearInterval(id); // ~48s
    }, 4000);
  }

  // Poll the Collecto status endpoint after an MTN/Airtel prompt.
  function pollCollecto(ref: string) {
    let n = 0;
    const id = setInterval(async () => {
      n += 1;
      try {
        const res = await fetch(`/api/collecto/status?ref=${encodeURIComponent(ref)}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (json.status === "completed") {
          clearInterval(id);
          if (typeof json.balance === "number") onDone(json.balance);
          refresh();
          setMsg({ text: "Deposit received — your balance is updated.", ok: true });
        } else if (json.status === "failed") {
          clearInterval(id);
          setMsg({ text: "The payment was not completed. Please try again.", ok: false });
        }
      } catch {
        /* keep polling */
      }
      if (n >= 20) clearInterval(id); // ~80s
    }, 4000);
  }

  // Poll NOWPayments status until the on-chain payment confirms, then credit.
  function pollCrypto(paymentId: string) {
    let n = 0;
    const id = setInterval(async () => {
      n += 1;
      try {
        const res = await fetch(`/api/crypto/status?paymentId=${encodeURIComponent(paymentId)}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (json.credited) {
          clearInterval(id);
          setCryptoStatus("done");
          if (typeof json.balance === "number") onDone(json.balance);
          refresh();
        } else if (json.status === "confirming" || json.status === "sending") {
          setCryptoStatus("confirming");
        } else if (["failed", "expired", "refunded"].includes(json.status)) {
          clearInterval(id);
          setCryptoStatus("failed");
        }
      } catch {
        /* keep polling */
      }
      if (n >= 150) clearInterval(id); // ~15 min
    }, 6000);
  }

  function resetCrypto() {
    setCryptoPay(null);
    setCryptoStatus("waiting");
    setAmount("");
    setMsg(null);
    refresh();
  }

  async function submit() {
    setMsg(null);
    // Crypto has a higher minimum than other rails (network fees eat small sends).
    const minUsd =
      kind === "deposit" ? (method === "crypto" ? CRYPTO_MIN_USD : 5) : 1;
    if (amountNum < minUsd) {
      setMsg({ text: `Minimum ${kind === "deposit" ? "deposit" : "withdrawal"} is $${minUsd.toFixed(2)}.`, ok: false });
      return;
    }
    if (kind === "withdraw" && amountNum * 100 > max) {
      setMsg({ text: "Amount exceeds your balance.", ok: false });
      return;
    }
    if (needsPhone && !defaultPhone) {
      setMsg({ text: `Add and verify your phone under Profile to use ${methodDef.label}.`, ok: false });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amountNum, method, reference, coin }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg({ text: json.error || "Request failed.", ok: false });
      } else if (json.mpesa && json.checkoutRequestId) {
        // M-Pesa: show the live STK status (PIN prompt → paid / cancelled).
        if (needsPhone) rememberPhone(reference);
        setStkPay({ checkoutRequestId: json.checkoutRequestId, phone: reference, amountKes: json.amountKes });
        setStkState({ state: "pending", desc: "Sent to your phone — enter your M-Pesa PIN…" });
        pollStk(json.checkoutRequestId, json.softwave);
      } else if (json.crypto) {
        // Crypto: show the deposit address and poll until it confirms on-chain.
        setCryptoPay(json.crypto);
        setCryptoStatus("waiting");
        pollCrypto(json.crypto.paymentId);
      } else if (json.redirect && json.redirectUrl) {
        // Hand off to the hosted checkout (card / bank / crypto).
        setMsg({ text: "Redirecting to secure checkout…", ok: true });
        window.location.href = json.redirectUrl;
        return;
      } else if (json.poll && json.ref) {
        // MTN / Airtel prompt sent — poll until confirmed.
        if (needsPhone) rememberPhone(reference);
        setMsg({ text: json.message || "Approve the prompt on your phone.", ok: true });
        setAmount("");
        pollCollecto(json.ref);
      } else {
        const fallback =
          kind === "deposit"
            ? "Deposit request received — it will reflect once confirmed by our team."
            : "Withdrawal requested — funds reserved and sent after approval.";
        setMsg({ text: json.message || fallback, ok: true });
        setAmount("");
        setReference("");
        onDone(typeof json.balance === "number" ? json.balance : null);
        if (json.mpesa) startPolling();
      }
    } catch {
      setMsg({ text: "Network error. Try again.", ok: false });
    } finally {
      setBusy(false);
    }
  }

  if (stkPay) {
    return <StkStatusPanel data={stkPay} state={stkState} onReset={resetStk} />;
  }
  if (cryptoPay) {
    return <CryptoDepositPanel data={cryptoPay} status={cryptoStatus} onReset={resetCrypto} />;
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">
          Amount (USD)
          {kind === "deposit"
            ? method === "crypto"
              ? ` · min $${CRYPTO_MIN_USD}`
              : " · min $5"
            : ""}
        </label>
        <input
          className="input tabular"
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
        />
        {kind === "deposit" && (
          <div className="mt-2 grid grid-cols-5 gap-1.5">
            {[5, 10, 20, 50, 100].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setAmount(String(v))}
                className={`btn py-1.5 text-[11px] ${Number(amount) === v ? "btn-brand" : "btn-ghost"}`}
              >
                ${v}
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Method</label>
        <div className="grid grid-cols-4 gap-2">
          {methods.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                onClick={() => setMethod(m.id)}
                className={`btn flex-col gap-1 py-2 text-[11px] ${
                  method === m.id ? "btn-brand" : "btn-ghost"
                }`}
              >
                <Icon className="h-4 w-4" />
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {kind === "deposit" && method === "crypto" && gatewayReady && (
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Pay with</label>
          <div className="grid grid-cols-3 gap-2">
            {CRYPTO_COINS.map((c) => (
              <button
                key={c.code}
                onClick={() => setCoin(c.code)}
                className={`btn flex-col gap-0 py-2 text-[11px] ${coin === c.code ? "btn-brand" : "btn-ghost"}`}
              >
                <span className="font-bold">{c.label}</span>
                <span className="text-[9px] opacity-80">{c.note}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {showReference && needsPhone ? (
        // Phone is LOCKED to the verified profile number — not editable here.
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">
            {methodDef.label} number
          </label>
          {defaultPhone ? (
            <>
              <div className="flex items-center gap-2 rounded-xl border border-border bg-surface2/50 px-3 py-2.5">
                <Lock className="h-4 w-4 shrink-0 text-muted" />
                <span className="tabular flex-1 text-sm font-semibold">{fmtLocalPhone(defaultPhone)}</span>
                <span className="rounded-md bg-up/10 px-1.5 py-0.5 text-[10px] font-bold text-up">VERIFIED</span>
              </div>
              <p className="mt-1 text-[11px] text-muted">
                To use a different number,{" "}
                <a href="/profile" className="font-semibold text-brand underline">change your phone under Profile</a>.
              </p>
            </>
          ) : (
            <div className="rounded-xl border border-gold/40 bg-gold/10 px-3 py-2.5 text-xs text-fg">
              Add and verify your phone under{" "}
              <a href="/profile" className="font-semibold text-brand underline">Profile</a>{" "}
              to {kind === "deposit" ? "deposit" : "withdraw"} via {methodDef.label}.
            </div>
          )}
        </div>
      ) : showReference ? (
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">
            {kind === "deposit"
              ? "Sender reference"
              : method === "crypto"
              ? "Your payout wallet address"
              : "Send to"}
          </label>
          <input
            className="input"
            placeholder={methodDef.hint || "Account / name"}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </div>
      ) : null}

      {needsPhone && amountNum > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-surface2/50 px-3 py-2 text-xs">
          <span className="text-muted">
            {kind === "deposit" ? "You’ll pay" : "You’ll receive"}
          </span>
          <span className="tabular font-bold text-brand">
            {isMpesa
              ? `KES ${kes.toLocaleString("en-US")}`
              : `UGX ${Math.max(500, Math.round(amountNum * (config?.usdUgxRate ?? 3750))).toLocaleString("en-US")}`}
          </span>
        </div>
      )}

      <button
        onClick={submit}
        disabled={busy}
        className="btn btn-brand w-full py-2.5"
      >
        {busy
          ? "Submitting…"
          : isHostedDeposit && method === "crypto"
          ? "Get deposit address"
          : isHostedDeposit && method === "bank"
          ? "Continue to Bank"
          : isHostedDeposit
          ? "Pay with Card"
          : needsPhone && kind === "deposit"
          ? `Pay with ${methodDef.label}`
          : needsPhone
          ? `Withdraw to ${methodDef.label}`
          : kind === "deposit"
          ? "Request deposit"
          : "Request withdrawal"}
      </button>

      {msg && (
        <p className={`text-center text-xs ${msg.ok ? "text-up" : "text-down"}`}>
          {msg.text}
        </p>
      )}

      <p className="text-center text-[11px] leading-relaxed text-muted">
        {isHostedDeposit && method === "crypto"
          ? "You’ll be taken to a secure page to pay with USDT, BTC and more. Your balance updates automatically once the payment confirms on-chain."
          : isHostedDeposit
          ? "You’ll be taken to a secure checkout to pay by card or bank. Your balance updates automatically once payment is confirmed."
          : needsPhone && kind === "deposit"
          ? `You’ll get a ${methodDef.label} prompt on your phone. Approve it and your balance is credited instantly.`
          : needsPhone
          ? `Money is sent straight to your ${methodDef.label} and usually arrives within a minute.`
          : kind === "deposit"
          ? "Complete the secure checkout to fund your account."
          : "Withdrawals are reviewed and paid to the destination above."}
      </p>
    </div>
  );
}

function TxnList({ txns }: { txns: Txn[] }) {
  if (!txns.length) {
    return (
      <div className="p-6 text-center text-sm text-muted">No activity yet.</div>
    );
  }
  return (
    <div className="divide-y divide-border">
      {txns.map((t) => (
        <div key={t.id} className="px-5 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <TxnIcon type={t.type} />
              <div>
                <div className="text-sm font-medium capitalize">
                  {t.type === "bonus" ? "Deposit" : t.type.replace("_", " ")}
                  {t.method && t.type !== "bonus" ? (
                    <span className="text-muted"> · {t.method}</span>
                  ) : null}
                </div>
                <div className="text-[11px] text-muted">{shortTime(t.created_at)}</div>
              </div>
            </div>
            <div className="text-right">
              <div
                className={`tabular text-sm font-bold ${
                  Number(t.amount) >= 0 ? "text-up" : "text-fg"
                }`}
              >
                {money(Number(t.amount), { sign: true })}
              </div>
              <StatusBadge status={t.status} />
            </div>
          </div>
          {t.type === "withdrawal" && <WithdrawalTrack status={t.status} receipt={t.receipt} />}
        </div>
      ))}
    </div>
  );
}

function WithdrawalTrack({ status, receipt }: { status: string; receipt?: string | null }) {
  const done = status === "completed";
  const rejected = status === "rejected";

  if (rejected) {
    return (
      <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-down/30 bg-down/5 px-3 py-1.5 text-[11px] text-down">
        <XCircle className="h-3.5 w-3.5" /> Payout didn’t go through — amount refunded to your balance.
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-border bg-surface2/40 px-3 py-2">
      <div className="flex items-center">
        <TrackStep label="Requested" done />
        <TrackLine done />
        <TrackStep label="Sent to M-Pesa" done />
        <TrackLine done={done} />
        <TrackStep label="Received" done={done} active={!done} />
      </div>
      {done && receipt && (
        <div className="mt-1.5 text-[10px] text-muted">
          M-Pesa receipt: <span className="tabular font-semibold text-fg">{receipt}</span>
        </div>
      )}
    </div>
  );
}

function TrackStep({ label, done, active }: { label: string; done?: boolean; active?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span
        className={`flex h-4 w-4 items-center justify-center rounded-full ${
          done ? "bg-up text-white" : active ? "bg-gold/20 text-gold ring-1 ring-gold" : "bg-surface2 text-muted"
        }`}
      >
        {done ? <Check className="h-2.5 w-2.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      </span>
      <span className={`text-[9px] ${done ? "text-fg" : active ? "text-gold" : "text-muted"}`}>{label}</span>
    </div>
  );
}

function TrackLine({ done }: { done?: boolean }) {
  return <div className={`mb-4 h-0.5 flex-1 ${done ? "bg-up" : "bg-border"}`} />;
}

function TxnIcon({ type }: { type: string }) {
  const cls = "h-4 w-4";
  if (type === "deposit" || type === "bonus") return <ArrowDownToLine className={`${cls} text-up`} />;
  if (type === "withdrawal") return <ArrowUpFromLine className={`${cls} text-gold`} />;
  if (type === "trade_payout") return <TrendingUp className={`${cls} text-up`} />;
  if (type === "trade_stake") return <TrendingDown className={`${cls} text-down`} />;
  return <Clock className={`${cls} text-muted`} />;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "pending")
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-gold">
        <Clock className="h-3 w-3" /> pending
      </span>
    );
  if (status === "rejected")
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-down">
        <XCircle className="h-3 w-3" /> rejected
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted">
      <CheckCircle2 className="h-3 w-3" /> done
    </span>
  );
}
