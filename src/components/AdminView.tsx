"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  X,
  Users,
  Wallet,
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  TrendingUp,
  Landmark,
  Coins,
  Percent,
  Ban,
  ShieldCheck,
  Gift,
  Megaphone,
  Lock,
  Unlock,
  Search,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";
import { money, shortTime } from "@/lib/format";
import { AdminSkeleton } from "./Skeleton";
import { BRAND_HEX_LIGHT, BRAND_HEX_DARK, BRAND_RGB } from "@/lib/brand";

type Player = {
  id: number;
  name: string;
  email: string;
  account_no: string;
  status: string;
  promo: boolean;
  withdrawBlocked?: boolean;
  balance: number;
  pnl: number;
  trades: number;
  deposited: number;
  withdrawn: number;
  depositMethod?: string | null;
};

const METHOD_LABELS: Record<string, string> = {
  mpesa: "M-Pesa",
  mtn: "MTN",
  airtel: "Airtel",
  card: "Card",
  bank: "Bank",
  crypto: "Crypto",
  manual: "Manual",
};

export function AdminView() {
  const [data, setData] = useState<any>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userQuery, setUserQuery] = useState("");
  const [serverUsers, setServerUsers] = useState<Player[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [kycQuery, setKycQuery] = useState("");

  // Server-side user search. The dashboard preloads only the newest 5000
  // accounts, so an older account (or any account once there are >5000 users)
  // can't be found by filtering the loaded list. Debounced query hits the DB so
  // ANY account is findable by name / email / account number.
  useEffect(() => {
    const term = userQuery.trim();
    if (term.length < 2) {
      setServerUsers(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(term)}`, { cache: "no-store" });
        const j = await res.json();
        setServerUsers(Array.isArray(j.users) ? j.users : []);
      } catch {
        setServerUsers([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
    // Re-runs on `data` too: after an admin action (grant bonus, block, …) the
    // dashboard reloads, and this refreshes the searched rows so their balance /
    // status reflect the change even for accounts beyond the preloaded 5000.
  }, [userQuery, data]);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin", { cache: "no-store" });
    if (res.status === 403) {
      setForbidden(true);
      setLoading(false);
      return;
    }
    setData(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const post = useCallback(
    async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/admin/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await load();
      return res;
    },
    [load]
  );

  if (forbidden)
    return <div className="card p-8 text-center text-muted">You don’t have access to the admin panel.</div>;
  if (loading || !data) return <AdminSkeleton />;

  const k = data.kpi;
  const players: Player[] = data.topUsers || [];
  const q = userQuery.trim().toLowerCase();
  const localFiltered = q
    ? players.filter(
        (u) =>
          (u.name || "").toLowerCase().includes(q) ||
          (u.email || "").toLowerCase().includes(q) ||
          (u.account_no || "").toLowerCase().includes(q)
      )
    : players;
  // Merge instant local matches (from the loaded list) with server matches
  // (which reach accounts beyond the preloaded 5000), de-duplicated by id.
  const filteredPlayers =
    q && serverUsers
      ? Array.from(new Map([...localFiltered, ...serverUsers].map((u) => [u.id, u])).values())
      : localFiltered;
  const daily = (data.daily || []).map((d: any) => ({
    label: new Date(d.day).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    volume: d.volume / 100,
  }));
  const winRate = k.wonCount + k.lostCount ? Math.round((k.wonCount / (k.wonCount + k.lostCount)) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Needs attention — anything debited but not settled (never in the dark) */}
      <AttentionCard items={data.attention || []} />

      {k.depositsPending > 0 && (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-border p-4">
          <div className="min-w-0">
            <div className="text-sm font-bold">{k.depositsPending} pending deposit{k.depositsPending === 1 ? "" : "s"}</div>
            <div className="text-[11px] text-muted">
              Clear abandoned deposit requests to declutter the panel. Only removes ones older than 20 min, so an in-flight payment is never deleted.
            </div>
          </div>
          <button
            onClick={async () => {
              if (!window.confirm("Delete pending deposit requests older than 20 minutes? Completed deposits and withdrawals are not affected.")) return;
              const res = await post({ action: "clear_pending_deposits" });
              const j = await res.json().catch(() => ({}));
              if (res.ok) window.alert(`Cleared ${j.cleared ?? 0} pending deposit${j.cleared === 1 ? "" : "s"}.`);
            }}
            className="btn btn-ghost shrink-0 border-down/40 px-3 py-2 text-xs text-down"
          >
            Clear pending deposits
          </button>
        </div>
      )}

      {/* Global test mode */}
      <GlobalTestCard
        on={!!data.globalTest}
        pct={Number(data.globalTestPct ?? 50)}
        onSave={(on, pct) => post({ action: "set_global_test", on, pct })}
      />

      {/* Cash-position KPIs — the numbers that tell you if the company is up */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi icon={Landmark} label="Net cash (real money)" value={money(k.netCash ?? 0, { sign: true })} sub="deposits − withdrawals" accent={(k.netCash ?? 0) >= 0 ? "up" : "down"} />
        <Kpi icon={Wallet} label="Player balances (owed)" value={money(k.totalBalance)} sub={`incl. ${money(k.bonusLocked ?? 0)} locked bonus`} accent="gold" />
        <Kpi icon={Gift} label="Bonuses issued" value={money(k.bonusIssued ?? 0)} sub="not real deposits" />
        <Kpi icon={TrendingUp} label="House trading P&L" value={money(k.houseProfit, { sign: true })} sub="staked − paid (GGR)" accent={k.houseProfit >= 0 ? "up" : "down"} />
      </div>

      {/* Activity KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi icon={Users} label="Users" value={String(k.userCount)} />
        <Kpi icon={ArrowDownToLine} label="Deposits" value={money(k.depositsTotal)} sub={`${k.depositsPending} pending`} accent="up" />
        <Kpi icon={ArrowUpFromLine} label="Withdrawals" value={money(k.withdrawalsTotal)} sub={`${k.withdrawalsPending} pending`} accent="gold" />
        <Kpi icon={Activity} label="Trades" value={String(k.tradeCount)} sub={`${winRate}% player win`} />
      </div>

      {/* House edge + referral controls */}
      <div className="grid gap-3 lg:grid-cols-2">
        <HouseEdgeCard edge={Number(data.houseEdge ?? 0.05)} onSave={(pct) => post({ action: "set_house_edge", percent: pct })} />
        <RateCard
          icon={Gift}
          title="Referral reward"
          value={Number(data.referralPct ?? 0.1)}
          onSave={(pct) => post({ action: "set_referral_pct", percent: pct })}
        />
      </div>

      {/* Risk limits — protect the bankroll from big single trades */}
      <div className="grid gap-3 lg:grid-cols-2">
        <AmountCard
          title="Max stake per trade"
          value={Number(data.maxStakeCents ?? 50000) / 100}
          onSave={(usd) => post({ action: "set_max_stake", usd })}
        />
        <AmountCard
          title="Max payout per trade"
          value={Number(data.maxPayoutCents ?? 200000) / 100}
          onSave={(usd) => post({ action: "set_max_payout", usd })}
        />
      </div>

      {/* Instant-withdrawal daily limits */}
      <WithdrawLimitsCard
        count={Number(data.wdDailyCount ?? 5)}
        maxUsd={Number(data.wdDailyMaxCents ?? 100000) / 100}
        onSave={(count, maxUsd) => post({ action: "set_withdraw_limits", count, maxUsd })}
      />

      {/* Test accounts (QA) */}
      <TestAccountsCard accounts={data.testAccounts || []} onAction={post} />

      {/* Volume chart */}
      <div className="card p-5">
        <div className="mb-3 text-sm font-bold">Trade volume · last 14 days</div>
        {daily.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted">No trades yet.</div>
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fill: "#8b93a6", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#8b93a6", fontSize: 11 }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  cursor={{ fill: `rgba(${BRAND_RGB},0.08)` }}
                  contentStyle={{ background: "#12131b", border: "1px solid #262a38", borderRadius: 10, fontSize: 12 }}
                  formatter={(v: any) => [`$${Number(v).toLocaleString()}`, "Volume"]}
                />
                <Bar dataKey="volume" radius={[5, 5, 0, 0]}>
                  {daily.map((_: any, i: number) => (
                    <Cell key={i} fill="url(#vbar)" />
                  ))}
                </Bar>
                <defs>
                  <linearGradient id="vbar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={BRAND_HEX_LIGHT} />
                    <stop offset="100%" stopColor={BRAND_HEX_DARK} />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* KYC verifications */}
      {(() => {
        const kycAll: any[] = data.kyc || [];
        if (kycAll.length === 0) return null;
        const kq = kycQuery.trim().toLowerCase();
        const kycList = kq
          ? kycAll.filter((k) =>
              [k.kyc_name, k.name, k.email, k.account_no, k.kyc_id_number, k.kyc_phone]
                .some((v) => String(v || "").toLowerCase().includes(kq))
            )
          : kycAll;
        return (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
            <span className="font-bold">
              Identity verifications ({kq ? `${kycList.length} of ${kycAll.length}` : kycAll.length})
            </span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <input
                value={kycQuery}
                onChange={(e) => setKycQuery(e.target.value)}
                placeholder="Search name, ID, phone, email…"
                className="w-full rounded-lg border border-border bg-surface2 py-1.5 pl-8 pr-8 text-xs outline-none focus:border-brand/50 sm:w-64"
              />
              {kq && (
                <button
                  onClick={() => setKycQuery("")}
                  title="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-fg"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <div className="max-h-[560px] divide-y divide-border overflow-auto">
            {kycList.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-muted">
                No verifications match “{kycQuery.trim()}”.
              </div>
            ) : (
              kycList.map((k) => (
              <div key={k.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div>
                  <div className="text-sm font-semibold">
                    {k.kyc_name} <span className="text-[11px] text-muted">({k.account_no})</span>
                  </div>
                  <div className="text-xs text-muted">
                    ID: {k.kyc_id_number} · {k.kyc_phone} · {k.email}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => post({ action: "kyc_approve", userId: k.id })}
                    className="btn py-1.5 px-3 text-xs text-white"
                    style={{ background: "linear-gradient(180deg,#00e396,#00b877)" }}
                  >
                    <Check className="h-3.5 w-3.5" /> Approve
                  </button>
                  <button
                    onClick={() => {
                      const r = window.prompt(`Reason for rejecting ${k.kyc_name}'s verification:`, "");
                      if (r != null) post({ action: "kyc_reject", userId: k.id, reason: r });
                    }}
                    className="btn btn-ghost py-1.5 px-3 text-xs text-down"
                  >
                    <X className="h-3.5 w-3.5" /> Reject
                  </button>
                </div>
              </div>
              ))
            )}
          </div>
        </div>
        );
      })()}

      {/* Withdrawals — who cashed out, how much, and their deposit/withdraw totals */}
      <WithdrawalsCard items={data.withdrawals || []} />

      {/* Player management */}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
          <span className="font-bold">
            Users &amp; accounts ({q ? `${filteredPlayers.length} found` : `${(k.userCount ?? 0).toLocaleString()} total · newest ${players.length}`})
          </span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              placeholder="Search name, email or account…"
              className="w-full rounded-lg border border-border bg-surface2 py-1.5 pl-8 pr-8 text-xs outline-none focus:border-brand/50 sm:w-64"
            />
            {q && (
              <button
                onClick={() => setUserQuery("")}
                title="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-fg"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="px-5 py-2 font-medium">Account</th>
                <th className="px-3 py-2 text-right font-medium">Balance</th>
                <th className="px-3 py-2 text-right font-medium">Deposited</th>
                <th className="px-3 py-2 font-medium">Method</th>
                <th className="px-3 py-2 text-right font-medium">Withdrawn</th>
                <th className="px-3 py-2 text-right font-medium">Trades</th>
                <th className="px-3 py-2 text-right font-medium">P&amp;L</th>
                <th className="px-5 py-2 text-right font-medium">Manage</th>
              </tr>
            </thead>
            <tbody>
              {filteredPlayers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-sm text-muted">
                    {searching ? "Searching all accounts…" : q ? `No users match “${userQuery.trim()}”.` : "No users yet."}
                  </td>
                </tr>
              ) : (
                filteredPlayers.map((u) => <PlayerRow key={u.id} u={u} onAction={post} />)
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

function PlayerRow({
  u,
  onAction,
}: {
  u: Player;
  onAction: (p: Record<string, unknown>) => Promise<Response>;
}) {
  const [busy, setBusy] = useState(false);
  const blocked = u.status === "blocked";

  async function run(p: Record<string, unknown>, onOk?: (j: any) => void) {
    setBusy(true);
    try {
      const res = await onAction(p);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(j.error || "Action failed. Please try again.");
        return;
      }
      onOk?.(j);
    } catch {
      window.alert("Network error — action not applied.");
    } finally {
      setBusy(false);
    }
  }

  function grantBonus() {
    const raw = window.prompt(`Grant promo credit to ${u.name} (${u.account_no}). Amount in USD (negative to remove):`, "10");
    if (raw == null) return;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount === 0) return;
    run({ action: "grant_bonus", userId: u.id, amount }, (j) =>
      window.alert(
        `Bonus applied to ${u.name}. New balance: ${money(Number(j.balance ?? 0))}.`
      )
    );
  }

  return (
    <tr className="border-b border-border/60">
      <td className="px-5 py-2.5">
        <div className="flex items-center gap-2">
          <span className="font-medium">{u.name}</span>
          {u.promo && (
            <span className="rounded bg-brand/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-brand">Promo</span>
          )}
          {blocked && (
            <span className="rounded bg-down/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-down">Blocked</span>
          )}
          {u.withdrawBlocked && (
            <span className="rounded bg-gold/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-gold">No W/D</span>
          )}
        </div>
        <div className="tabular text-[11px] text-muted">{u.account_no} · {u.email}</div>
      </td>
      <td className="tabular px-3 py-2.5 text-right text-brand">{money(u.balance)}</td>
      <td className={`tabular px-3 py-2.5 text-right ${u.deposited > 0 ? "text-up" : "text-muted"}`}>{money(u.deposited)}</td>
      <td className="px-3 py-2.5">
        {u.depositMethod ? (
          <span className="rounded-md bg-surface2 px-2 py-0.5 text-[11px] font-medium text-fg">
            {METHOD_LABELS[u.depositMethod] || u.depositMethod}
          </span>
        ) : (
          <span className="text-[11px] text-muted">—</span>
        )}
      </td>
      <td className="tabular px-3 py-2.5 text-right text-muted">{money(u.withdrawn)}</td>
      <td className="tabular px-3 py-2.5 text-right">{u.trades}</td>
      <td className={`tabular px-3 py-2.5 text-right font-bold ${u.pnl >= 0 ? "text-up" : "text-down"}`}>
        {money(u.pnl, { sign: true })}
      </td>
      <td className="px-5 py-2.5">
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={grantBonus}
            disabled={busy}
            title="Grant promo credit"
            className="btn btn-ghost h-8 px-2 text-[11px]"
          >
            <Gift className="h-3.5 w-3.5 text-brand" /> Bonus
          </button>
          <button
            onClick={() => run({ action: "toggle_promo", userId: u.id, value: !u.promo })}
            disabled={busy}
            title="Flag as promotional account"
            className={`btn h-8 px-2 text-[11px] ${u.promo ? "btn-brand" : "btn-ghost"}`}
          >
            <Megaphone className="h-3.5 w-3.5" /> Promo
          </button>
          <button
            onClick={() => run({ action: "toggle_withdraw_block", userId: u.id, value: !u.withdrawBlocked })}
            disabled={busy}
            title={u.withdrawBlocked ? "Allow withdrawals for this account" : "Block withdrawals (account can still trade; withdrawals held in processing, never sent)"}
            className={`btn h-8 px-2 text-[11px] ${u.withdrawBlocked ? "btn-brand" : "btn-ghost"}`}
          >
            {u.withdrawBlocked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />} No W/D
          </button>
          {blocked ? (
            <button
              onClick={() => run({ action: "unblock_user", userId: u.id })}
              disabled={busy}
              className="btn btn-ghost h-8 px-2 text-[11px] text-up"
            >
              <ShieldCheck className="h-3.5 w-3.5" /> Unblock
            </button>
          ) : (
            <button
              onClick={() => run({ action: "block_user", userId: u.id })}
              disabled={busy}
              className="btn btn-ghost h-8 px-2 text-[11px] text-down"
            >
              <Ban className="h-3.5 w-3.5" /> Block
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

type Withdrawal = {
  id: number;
  name: string;
  account_no: string;
  amount: number;
  status: string;
  method: string | null;
  reference: string | null;
  receipt: string | null;
  created_at: string;
  userDeposited: number;
  userWithdrawn: number;
};

function WdStatus({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    completed: { label: "Paid", cls: "bg-up/15 text-up" },
    pending: { label: "Processing", cls: "bg-gold/15 text-gold" },
    rejected: { label: "Refunded", cls: "bg-down/15 text-down" },
  };
  const s = map[status] || { label: status, cls: "bg-surface2 text-muted" };
  return <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${s.cls}`}>{s.label}</span>;
}

type Attention = {
  id: number;
  name: string;
  account_no: string;
  type: "deposit" | "withdrawal" | string;
  amount: number;
  status: string;
  method: string | null;
  reference: string | null;
  receipt: string | null;
  note: string | null;
  provider_ref: string | null;
  created_at: string;
};

function AttentionCard({ items }: { items: Attention[] }) {
  if (!items.length) {
    return (
      <div className="card flex items-center gap-3 border-up/30 p-4">
        <CheckCircle2 className="h-5 w-5 text-up" />
        <div>
          <div className="text-sm font-bold">All clear</div>
          <div className="text-[11px] text-muted">No deposits or withdrawals are stuck — nothing debited but unsettled.</div>
        </div>
      </div>
    );
  }
  return (
    <div className="card overflow-hidden border-gold/40">
      <div className="flex items-center gap-2 border-b border-border bg-gold/10 px-5 py-3">
        <AlertTriangle className="h-4 w-4 text-gold" />
        <span className="font-bold">Needs attention ({items.length})</span>
        <span className="ml-auto text-[11px] text-muted">Stuck / failed deposits & withdrawals</span>
      </div>
      <div className="max-h-[440px] divide-y divide-border overflow-auto">
        {items.map((t) => {
          const isDep = t.type === "deposit";
          const hint = isDep
            ? t.status === "pending"
              ? "Paid but not credited — check M-Pesa"
              : "Deposit rejected — not credited"
            : t.status === "pending"
            ? "Reserved — payout not confirmed"
            : "Withdrawal refunded to balance";
          return (
            <div key={`${t.type}-${t.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${isDep ? "bg-up/15 text-up" : "bg-gold/15 text-gold"}`}>
                    {isDep ? "Deposit" : "Withdrawal"}
                  </span>
                  {t.name} <span className="text-[11px] text-muted">({t.account_no})</span>
                </div>
                <div className="tabular text-[11px] text-muted">
                  {hint}
                  {t.reference ? ` · ${t.reference}` : ""}
                  {t.receipt ? ` · ${t.receipt}` : ""}
                  {t.provider_ref ? ` · ref ${t.provider_ref}` : ""} · {shortTime(t.created_at)}
                </div>
              </div>
              <div className="text-right">
                <div className="tabular text-sm font-bold">{money(t.amount)}</div>
                <WdStatus status={t.status} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WithdrawalsCard({ items }: { items: Withdrawal[] }) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const list = query
    ? items.filter(
        (w) =>
          (w.name || "").toLowerCase().includes(query) ||
          (w.account_no || "").toLowerCase().includes(query) ||
          (w.reference || "").toLowerCase().includes(query)
      )
    : items;
  const paidTotal = items.filter((w) => w.status === "completed").reduce((s, w) => s + w.amount, 0);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <span className="font-bold">
          Withdrawals ({query ? `${list.length} of ${items.length}` : items.length})
        </span>
        <span className="text-[11px] text-muted">
          Paid out: <span className="tabular font-semibold text-gold">{money(paidTotal)}</span>
        </span>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, account or phone…"
            className="w-full rounded-lg border border-border bg-surface2 py-1.5 pl-8 pr-8 text-xs outline-none focus:border-brand/50 sm:w-60"
          />
          {query && (
            <button onClick={() => setQ("")} title="Clear" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-fg">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      {items.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-muted">No withdrawals yet.</div>
      ) : (
        <div className="max-h-[440px] divide-y divide-border overflow-auto">
          {list.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-muted">No withdrawals match “{q.trim()}”.</div>
          ) : (
            list.map((w) => (
              <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">
                    {w.name} <span className="text-[11px] text-muted">({w.account_no})</span>
                  </div>
                  <div className="tabular text-[11px] text-muted">
                    {(w.method && (METHOD_LABELS[w.method] || w.method)) || "—"}
                    {w.reference ? ` · ${w.reference}` : ""}
                    {w.receipt ? ` · ${w.receipt}` : ""} · {shortTime(w.created_at)}
                  </div>
                  <div className="text-[11px] text-muted">
                    Deposited <span className="text-fg">{money(w.userDeposited)}</span> · Withdrawn{" "}
                    <span className="text-fg">{money(w.userWithdrawn)}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="tabular text-sm font-bold text-gold">{money(w.amount)}</div>
                  <WdStatus status={w.status} />
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function HouseEdgeCard({ edge, onSave }: { edge: number; onSave: (pct: number) => Promise<Response> }) {
  const [pct, setPct] = useState(String(Math.round(edge * 1000) / 10));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setPct(String(Math.round(edge * 1000) / 10));
  }, [edge]);

  async function save() {
    const v = Number(pct);
    if (!Number.isFinite(v) || v < 0 || v > 100) return;
    setSaving(true);
    setSaved(false);
    try {
      await onSave(v);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-bold">
          <Percent className="h-4 w-4 text-brand" /> House earn (margin)
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-xl border border-border bg-surface2 px-3 py-2">
            <input
              value={pct}
              onChange={(e) => setPct(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              className="tabular w-16 bg-transparent text-right text-lg font-bold outline-none"
            />
            <span className="ml-1 text-muted">%</span>
          </div>
          <button onClick={save} disabled={saving} className="btn btn-brand px-4 py-2.5 text-sm">
            {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RateCard({
  icon: Icon,
  title,
  value,
  onSave,
}: {
  icon: any;
  title: string;
  value: number;
  onSave: (pct: number) => Promise<Response>;
}) {
  const [pct, setPct] = useState(String(Math.round(value * 1000) / 10));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setPct(String(Math.round(value * 1000) / 10));
  }, [value]);

  async function save() {
    const v = Number(pct);
    if (!Number.isFinite(v) || v < 0 || v > 50) return;
    setSaving(true);
    setSaved(false);
    try {
      await onSave(v);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 text-sm font-bold">
        <Icon className="h-4 w-4 text-brand" /> {title}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div className="flex items-center rounded-xl border border-border bg-surface2 px-3 py-2">
          <input
            value={pct}
            onChange={(e) => setPct(e.target.value.replace(/[^0-9.]/g, ""))}
            inputMode="decimal"
            className="tabular w-16 bg-transparent text-right text-lg font-bold outline-none"
          />
          <span className="ml-1 text-muted">%</span>
        </div>
        <button onClick={save} disabled={saving} className="btn btn-brand px-4 py-2.5 text-sm">
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
        </button>
      </div>
    </div>
  );
}

// Global test mode: puts every logged-in account on the simulated market and
// rolls wins/losses at the % below. Turn OFF before going live.
function GlobalTestCard({
  on,
  pct,
  onSave,
}: {
  on: boolean;
  pct: number;
  onSave: (on: boolean, pct: number) => Promise<Response>;
}) {
  const [p, setP] = useState(pct);
  const [busy, setBusy] = useState(false);
  useEffect(() => setP(pct), [pct]);

  async function save(nextOn: boolean, nextPct: number) {
    setBusy(true);
    try {
      await onSave(nextOn, nextPct);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`card p-5 ${on ? "border-gold/50" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-bold">🧪 Global test mode</div>
        <button
          onClick={() => save(!on, p)}
          disabled={busy}
          className={`relative h-8 w-14 shrink-0 rounded-full transition ${on ? "bg-up" : "bg-border"}`}
          title={on ? "Turn off" : "Turn on"}
        >
          <span className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all ${on ? "left-7" : "left-1"}`} />
        </button>
      </div>

      {on && (
        <div className="mt-4 rounded-xl border border-gold/40 bg-gold/10 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">Everyone wins</span>
            <span className="tabular font-bold">{p}% / loses {100 - p}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={p}
            onChange={(e) => setP(Number(e.target.value))}
            onMouseUp={() => save(true, p)}
            onTouchEnd={() => save(true, p)}
            className="mt-1 w-full accent-[color:rgb(var(--brand))]"
          />
          <div className="mt-1 flex justify-between text-[10px] text-muted">
            <span>always lose</span>
            <span>50/50</span>
            <span>always win</span>
          </div>
        </div>
      )}
    </div>
  );
}

function TestAccountsCard({
  accounts,
  onAction,
}: {
  accounts: { id: number; name: string; email: string; test_win_pct: number }[];
  onAction: (p: Record<string, unknown>) => Promise<Response>;
}) {
  const [email, setEmail] = useState("");
  const [pct, setPct] = useState(50);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run(p: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    try {
      const res = await onAction(p);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error || "Failed.");
      } else if (p.action === "set_test" && p.value) {
        setEmail("");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-bold">🧪 Test accounts (QA)</div>
        {accounts.length > 0 && (
          <button
            onClick={() => run({ action: "clear_tests" })}
            disabled={busy}
            className="btn btn-ghost px-3 py-1.5 text-[11px] text-down"
          >
            Disable all (before launch)
          </button>
        )}
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          className="input flex-1"
          placeholder="team-member@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && email.trim() && run({ action: "set_test", email, value: true, winPct: pct })}
        />
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface2 px-3 py-2 text-xs">
          <span className="text-muted">win</span>
          <input
            type="number"
            min={0}
            max={100}
            value={pct}
            onChange={(e) => setPct(Math.min(100, Math.max(0, Number(e.target.value))))}
            className="tabular w-12 bg-transparent text-right font-bold outline-none"
          />
          <span className="text-muted">%</span>
        </div>
        <button
          onClick={() => email.trim() && run({ action: "set_test", email, value: true, winPct: pct })}
          disabled={busy || !email.trim()}
          className="btn btn-brand shrink-0 px-4 py-2.5 text-sm"
        >
          Enable
        </button>
      </div>
      {err && <p className="mt-2 text-xs text-down">{err}</p>}

      {accounts.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {accounts.map((a) => (
            <TestAccountRow key={a.id} account={a} busy={busy} onRun={run} />
          ))}
        </div>
      )}
    </div>
  );
}

function TestAccountRow({
  account,
  busy,
  onRun,
}: {
  account: { id: number; name: string; email: string; test_win_pct: number };
  busy: boolean;
  onRun: (p: Record<string, unknown>) => Promise<void>;
}) {
  const [pct, setPct] = useState(account.test_win_pct ?? 50);
  const changed = pct !== (account.test_win_pct ?? 50);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gold/30 bg-gold/5 px-3 py-2 text-xs">
      <span className="min-w-0">
        <span className="font-semibold">{account.name}</span>{" "}
        <span className="text-muted">· {account.email}</span>
      </span>
      <div className="flex items-center gap-2">
        <span className="text-muted">win</span>
        <input
          type="number"
          min={0}
          max={100}
          value={pct}
          onChange={(e) => setPct(Math.min(100, Math.max(0, Number(e.target.value))))}
          className="tabular w-12 rounded-lg border border-border bg-surface2 px-2 py-1 text-right font-bold outline-none"
        />
        <span className="text-muted">%</span>
        <button
          onClick={() => onRun({ action: "set_test", email: account.email, value: true, winPct: pct })}
          disabled={busy || !changed}
          className={`text-[11px] font-semibold ${changed ? "text-brand hover:underline" : "text-muted/40"}`}
        >
          Save
        </button>
        <button
          onClick={() => onRun({ action: "set_test", email: account.email, value: false })}
          disabled={busy}
          className="text-[11px] font-semibold text-down hover:underline"
        >
          Disable
        </button>
      </div>
    </div>
  );
}

function WithdrawLimitsCard({
  count,
  maxUsd,
  onSave,
}: {
  count: number;
  maxUsd: number;
  onSave: (count: number, maxUsd: number) => Promise<Response>;
}) {
  const [c, setC] = useState(String(count));
  const [m, setM] = useState(String(Math.round(maxUsd)));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setC(String(count));
    setM(String(Math.round(maxUsd)));
  }, [count, maxUsd]);

  async function save() {
    const cn = Number(c);
    const mx = Number(m);
    if (!Number.isFinite(cn) || cn < 1 || !Number.isFinite(mx) || mx <= 0) return;
    setSaving(true);
    setSaved(false);
    try {
      await onSave(cn, mx);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 text-sm font-bold">
        <ArrowUpFromLine className="h-4 w-4 text-brand" /> Instant withdrawal limits
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-4">
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-wider text-muted">Max per day (count)</div>
          <input
            value={c}
            onChange={(e) => setC(e.target.value.replace(/[^0-9]/g, ""))}
            inputMode="numeric"
            className="tabular w-24 rounded-xl border border-border bg-surface2 px-3 py-2 text-lg font-bold outline-none"
          />
        </div>
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-wider text-muted">Max total per day</div>
          <div className="flex items-center rounded-xl border border-border bg-surface2 px-3 py-2">
            <span className="mr-1 text-muted">$</span>
            <input
              value={m}
              onChange={(e) => setM(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              className="tabular w-28 bg-transparent text-lg font-bold outline-none"
            />
          </div>
        </div>
        <button onClick={save} disabled={saving} className="btn btn-brand px-4 py-2.5 text-sm">
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
        </button>
      </div>
    </div>
  );
}

function AmountCard({
  title,
  value,
  onSave,
}: {
  title: string;
  value: number;
  onSave: (usd: number) => Promise<Response>;
}) {
  const [amt, setAmt] = useState(String(Math.round(value)));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setAmt(String(Math.round(value)));
  }, [value]);

  async function save() {
    const v = Number(amt);
    if (!Number.isFinite(v) || v <= 0) return;
    setSaving(true);
    setSaved(false);
    try {
      await onSave(v);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 text-sm font-bold">
        <Coins className="h-4 w-4 text-brand" /> {title}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div className="flex items-center rounded-xl border border-border bg-surface2 px-3 py-2">
          <span className="mr-1 text-muted">$</span>
          <input
            value={amt}
            onChange={(e) => setAmt(e.target.value.replace(/[^0-9.]/g, ""))}
            inputMode="decimal"
            className="tabular w-24 bg-transparent text-right text-lg font-bold outline-none"
          />
        </div>
        <button onClick={save} disabled={saving} className="btn btn-brand px-4 py-2.5 text-sm">
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
        </button>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: any;
  label: string;
  value: string;
  sub?: string;
  accent?: "up" | "down" | "gold";
}) {
  const color =
    accent === "up" ? "text-up" : accent === "down" ? "text-down" : accent === "gold" ? "text-gold" : "text-fg";
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-muted">{label}</span>
        <Icon className="h-4 w-4 text-muted" />
      </div>
      <div className={`tabular mt-1 text-xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted">{sub}</div>}
    </div>
  );
}
