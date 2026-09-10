import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "./Logo";
import { BRAND_NAME } from "@/lib/brand";

// Shared shell for public content pages (How it works, Payout rules, etc.).
export function InfoPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link href="/" className="flex items-center gap-2">
            <Logo className="h-7 w-7" />
            <span className="text-lg font-bold tracking-tight">{BRAND_NAME}</span>
          </Link>
          <Link href="/" className="btn btn-ghost px-3 py-1.5 text-sm">
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{title}</h1>
        {intro && <p className="mt-3 text-lg text-muted">{intro}</p>}
        <div className="mt-8 space-y-8">{children}</div>

        <div className="mt-12 flex flex-wrap gap-3 border-t border-border pt-8">
          <Link href="/register" className="btn btn-brand px-5 py-2.5 text-sm">
            Create account
          </Link>
          <Link href="/how-it-works" className="btn btn-ghost px-5 py-2.5 text-sm">
            How it works
          </Link>
          <Link href="/payout-rules" className="btn btn-ghost px-5 py-2.5 text-sm">
            Payout rules
          </Link>
        </div>
      </main>
    </div>
  );
}

export function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-bold">{heading}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-muted">{children}</div>
    </section>
  );
}
