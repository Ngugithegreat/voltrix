"use client";

import { AppProvider } from "@/components/app-context";
import { Nav } from "@/components/Nav";
import { AppBackground } from "@/components/AppBackground";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <div className="relative isolate min-h-screen">
        <AppBackground />
        <Nav />
        {/* Each page owns its own container so the trade dashboard can go
            full-width and fit the viewport while other pages stay centered. */}
        <main className="pb-24 md:pb-0">{children}</main>
      </div>
    </AppProvider>
  );
}
