"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";

export type AccountMode = "real" | "demo";

export type Txn = {
  id: number;
  type: string;
  amount: number;
  status: string;
  method: string | null;
  reference: string | null;
  note: string | null;
  receipt?: string | null;
  created_at: string;
  is_demo?: boolean;
};

export type Trade = {
  id: number;
  kind: "rise_fall" | "mult" | "digit";
  symbol: string;
  direction: string; // rise|fall, up|down, even/odd/over/under/matches/differs
  stake: number;
  payout: number;
  multiplier: number | null;
  entry_price: number;
  exit_price: number | null;
  entry_epoch: number;
  expiry_epoch: number;
  stop_out_price: number | null;
  subtype: "even_odd" | "over_under" | "matches_differs" | null;
  prediction: string | null;
  barrier: number | null;
  exit_digit: number | null;
  status: "open" | "won" | "lost";
  created_at: string;
  settled_at: string | null;
  is_demo?: boolean;
};

export type AppUser = {
  id: number;
  name: string;
  email: string;
  role: "user" | "admin";
  balance: number;
  demo_balance?: number;
  country: string | null;
  phone?: string | null;
  account_no?: string;
  status?: string;
  kyc_status?: string;
  kyc_reason?: string | null;
  bonus_locked?: number;
  isTest?: boolean;
  testWinPct?: number;
  email_verified?: boolean;
};

export type AppConfig = {
  mpesaDeposit: boolean;
  mpesaWithdraw: boolean;
  cardDeposit: boolean;
  cryptoDeposit: boolean;
  ugMobileDeposit: boolean;
  usdKesRate: number;
  usdKesWithdrawRate: number;
  usdUgxRate: number;
  globalTest?: boolean;
};

export type Referral = {
  code: string;
  referredCount: number;
  earnedCents: number;
};

type WalletData = {
  user: AppUser | null;
  transactions: Txn[];
  openTrades: Trade[];
  closedTrades: Trade[];
  config?: AppConfig;
  referral?: Referral | null;
};

type Ctx = {
  user: AppUser | null;
  /** The balance of the ACTIVE account (real or demo, per `mode`). */
  balance: number;
  realBalance: number;
  demoBalance: number;
  mode: AccountMode;
  demo: boolean;
  setMode: (m: AccountMode) => void;
  data: WalletData | null;
  config: AppConfig | null;
  loading: boolean;
  refresh: () => Promise<void>;
  /** Updates the ACTIVE account's balance. */
  setBalance: (b: number) => void;
  logout: () => Promise<void>;
};

export const AppCtx = createContext<Ctx | null>(null);
export type AppCtxValue = Ctx;

export function AppProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [data, setData] = useState<WalletData | null>(null);
  const [realBalance, setRealBalance] = useState(0);
  const [demoBalance, setDemoBalance] = useState(0);
  const [mode, setModeState] = useState<AccountMode>("real");
  const [loading, setLoading] = useState(true);

  // Restore the last-used account (real/demo) on this device.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("st_mode");
      if (saved === "demo" || saved === "real") setModeState(saved);
    } catch {
      /* ignore */
    }
  }, []);

  const setMode = useCallback((m: AccountMode) => {
    setModeState(m);
    try {
      localStorage.setItem("st_mode", m);
    } catch {
      /* ignore */
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/wallet", { cache: "no-store" });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const json = await res.json();
      setData(json);
      if (json.user) {
        setRealBalance(Number(json.user.balance ?? 0));
        setDemoBalance(Number(json.user.demo_balance ?? 0));
      }
    } catch {
      /* ignore transient errors */
    } finally {
      setLoading(false);
    }
  }, [router]);

  // Update the active account's balance (used for instant UI after a trade).
  const setBalance = useCallback(
    (b: number) => (mode === "demo" ? setDemoBalance(b) : setRealBalance(b)),
    [mode]
  );

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }, [router]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const balance = mode === "demo" ? demoBalance : realBalance;

  return (
    <AppCtx.Provider
      value={{
        user: data?.user ?? null,
        balance,
        realBalance,
        demoBalance,
        mode,
        demo: mode === "demo",
        setMode,
        data,
        config: data?.config ?? null,
        loading,
        refresh,
        setBalance,
        logout,
      }}
    >
      {children}
    </AppCtx.Provider>
  );
}

export function useApp(): Ctx {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}
