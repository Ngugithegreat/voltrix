import { Suspense } from "react";
import { WalletView } from "@/components/WalletView";

export default function WalletPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Suspense fallback={null}>
        <WalletView />
      </Suspense>
    </div>
  );
}
