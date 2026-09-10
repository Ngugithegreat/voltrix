import Link from "next/link";
import {
  Zap,
  ShieldCheck,
  Wallet,
  TrendingUp,
  Clock,
  LineChart,
  ArrowRight,
  Fingerprint,
  Gauge,
  Radar,
  Landmark,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { HeroVisual } from "@/components/HeroVisual";
import { HeroChartBackground } from "@/components/HeroChartBackground";
import { WinsTicker } from "@/components/WinsTicker";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";
import { RotatingWord } from "@/components/RotatingWord";
import { MARKETS, PAYOUT_MULTIPLIER } from "@/lib/markets";

export default function Landing() {
  return (
    <div className="relative isolate min-h-screen overflow-hidden">
      {/* Ambient animated background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-24 top-8 h-96 w-96 rounded-full bg-brand/25 blur-3xl animate-blob" />
        <div className="absolute -right-24 top-48 h-[30rem] w-[30rem] rounded-full bg-violet-500/20 blur-3xl animate-blob-slow" />
        <div className="absolute bottom-24 left-1/3 h-80 w-80 rounded-full bg-cyan-400/15 blur-3xl animate-blob [animation-delay:-9s]" />
        {/* Perspective grid floor */}
        <div className="absolute inset-x-0 bottom-0 h-[420px] grid-floor animate-grid-drift opacity-70" />
        {/* Live, drifting chart line across the hero backdrop */}
        <div className="absolute inset-x-0 top-0 h-[780px] [mask-image:linear-gradient(to_bottom,#000_58%,transparent)] [-webkit-mask-image:linear-gradient(to_bottom,#000_58%,transparent)]">
          <HeroChartBackground />
        </div>
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/40 to-transparent" />
      </div>

      {/* Header */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <div className="flex items-center gap-2">
          <Logo className="h-8 w-8" />
          <span className="text-xl font-bold tracking-tight">{BRAND_NAME}</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/login" className="btn btn-ghost hidden px-4 py-2 text-sm sm:inline-flex">
            Sign in
          </Link>
          <Link href="/register" className="btn btn-brand px-4 py-2 text-sm">
            Get started
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-8 lg:grid-cols-2 lg:pt-16">
        <div className="animate-fade-up">
          <span className="relative inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-medium text-brand">
            <span className="absolute -left-0.5 -top-0.5 h-2 w-2 rounded-full bg-brand animate-glow-pulse" />
            <Zap className="h-3.5 w-3.5" /> Live volatility index trading
          </span>
          <h1 className="mt-4 text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            Markets move fast.
            <br />
            <RotatingWord words={["So do we.", "So should you.", "Trade smarter.", "Trade live.", "Trade yours."]} />
          </h1>
          <p className="mt-5 max-w-md text-lg text-muted">
            {BRAND_TAGLINE}. Predict whether a Volatility Index will rise or fall,
            win up to <span className="font-semibold text-brand">{PAYOUT_MULTIPLIER}×</span>{" "}
            your stake, and cash out instantly — built for everyone, not just
            professional traders.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/register" className="btn btn-brand px-6 py-3 text-base">
              Start trading <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/login" className="btn btn-ghost px-6 py-3 text-base">
              I have an account
            </Link>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-5 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-brand" /> Real live prices
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-brand" /> Trades from 15 seconds
            </span>
            <span className="flex items-center gap-1.5">
              <Wallet className="h-4 w-4 text-brand" /> Instant M-Pesa payouts
            </span>
          </div>
        </div>

        <div className="animate-fade-up [animation-delay:120ms]">
          <div className="relative sheen-sweep overflow-hidden rounded-[2rem]">
            <HeroVisual />
          </div>
        </div>
      </section>

      {/* Recent wins ticker — social proof (shows only when there's real data) */}
      <WinsTicker />

      {/* Markets strip */}
      <section className="border-y border-border bg-surface/40">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-3 px-4 py-6">
          <span className="text-xs uppercase tracking-wider text-muted">
            Available markets
          </span>
          {MARKETS.map((m) => (
            <span
              key={m.symbol}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-semibold"
            >
              {m.short}
              <span className="ml-1 text-[11px] font-normal text-muted">
                {m.name.replace(" Index", "")}
              </span>
            </span>
          ))}
        </div>
      </section>

      {/* Trust strip */}
      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TrustStat icon={Gauge} label="Contract types" value="Rise/Fall, Multipliers, Digits" />
          <TrustStat icon={Radar} label="Markets streamed" value={`${MARKETS.length} volatility indices`} />
          <TrustStat icon={Clock} label="Fastest contract" value="15 seconds" />
          <TrustStat icon={Landmark} label="Payout rails" value="M-Pesa, crypto, bank" />
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-3xl font-bold">Everything you need to trade</h2>
        <p className="mx-auto mt-2 max-w-lg text-center text-muted">
          A professional trading experience without the complexity.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Feature
            icon={LineChart}
            title="Real live prices"
            desc="Volatility indices streamed live. Your trades settle on the genuine market feed — no games."
          />
          <Feature
            icon={Zap}
            title="Trade in one tap"
            desc="Pick a market, set your stake and time, then tap Rise or Fall. That's it."
          />
          <Feature
            icon={Wallet}
            title="Easy deposits & withdrawals"
            desc="Fund your account and cash out your winnings via M-Pesa, crypto or bank."
          />
          <Feature
            icon={ShieldCheck}
            title="Secure by design"
            desc="Every stake and payout is recorded to a tamper-proof ledger tied to your account."
          />
          <Feature
            icon={Clock}
            title="Fast contracts"
            desc="Durations from 15 seconds to 5 minutes. Know your outcome quickly."
          />
          <Feature
            icon={TrendingUp}
            title="Track performance"
            desc="See your win rate, net P&L and full trade history at a glance."
          />
        </div>
      </section>

      {/* Security / integrity band */}
      <section className="border-t border-border bg-surface/30">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-medium text-brand">
                <Fingerprint className="h-3.5 w-3.5" /> Built on a real ledger
              </span>
              <h2 className="mt-4 text-3xl font-bold">
                Every price, every stake, every payout — accounted for.
              </h2>
              <p className="mt-3 max-w-md text-muted">
                Trades settle server-side against the live Deriv feed, not a
                simulated number picked to favor the house. Deposits and
                withdrawals post to a ledger tied to your account, so your
                balance always matches your history.
              </p>
              <ul className="mt-6 space-y-3 text-sm">
                <li className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                  Entry and exit prices are stamped from the real market tick.
                </li>
                <li className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                  Every winning trade pays out above your stake, always.
                </li>
                <li className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                  Full trade and transaction history, exportable any time.
                </li>
              </ul>
            </div>
            <div className="card relative overflow-hidden p-6">
              <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand/20 blur-3xl" />
              <div className="grid grid-cols-2 gap-4 text-center">
                <MiniStat value={`${PAYOUT_MULTIPLIER}×`} label="Rise/Fall payout" />
                <MiniStat value="15s" label="Fastest contract" />
                <MiniStat value="1000×" label="Max multiplier" />
                <MiniStat value="24/7" label="Markets open" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border bg-surface/30">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-center text-3xl font-bold">Start in 3 steps</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            <Step n={1} title="Create an account" desc="Sign up free in under a minute." />
            <Step n={2} title="Deposit funds" desc="Add money with your preferred method." />
            <Step
              n={3}
              title="Trade & withdraw"
              desc="Predict Rise or Fall, win, and cash out."
            />
          </div>
          <div className="mt-10 text-center">
            <Link href="/register" className="btn btn-brand px-8 py-3 text-base">
              Create free account <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-8 text-center text-xs text-muted">
          <div className="mb-2 flex items-center justify-center gap-2">
            <Logo className="h-5 w-5" />
            <span className="font-semibold text-white">{BRAND_NAME}</span>
          </div>
          <div className="mb-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <Link href="/how-it-works" className="hover:text-brand">How it works</Link>
            <Link href="/payout-rules" className="hover:text-brand">Payout rules</Link>
            <Link href="/login" className="hover:text-brand">Sign in</Link>
            <Link href="/register" className="hover:text-brand">Create account</Link>
          </div>
          <p className="mx-auto max-w-2xl">
            Trading volatility indices involves risk and may not be suitable for
            everyone. Only trade with money you can afford to lose. Prices are
            provided by the Deriv synthetic-index feed.
          </p>
          <p className="mt-3">© {new Date().getFullYear()} {BRAND_NAME}. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  desc,
}: {
  icon: any;
  title: string;
  desc: string;
}) {
  return (
    <div className="card p-5 transition hover:border-brand/40">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 font-bold">{title}</h3>
      <p className="mt-1 text-sm text-muted">{desc}</p>
    </div>
  );
}

function TrustStat({
  icon: Icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: string;
}) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-bold">{value}</div>
        <div className="text-[11px] text-muted">{label}</div>
      </div>
    </div>
  );
}

function MiniStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface2 p-4">
      <div className="text-2xl font-black text-gradient">{value}</div>
      <div className="mt-1 text-[11px] text-muted">{label}</div>
    </div>
  );
}

function Step({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div className="card p-6 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-brand font-bold text-white shadow-glow">
        {n}
      </div>
      <h3 className="mt-3 font-bold">{title}</h3>
      <p className="mt-1 text-sm text-muted">{desc}</p>
    </div>
  );
}
