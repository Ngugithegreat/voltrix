import { Suspense } from "react";
import { WalletView } from "@/components/WalletView";

export default function WalletPage() {
  return (
    <div className="w-full px-3 py-3 lg:h-[calc(100vh-4rem)] lg:overflow-hidden">
      <Suspense fallback={null}>
        <WalletView />
      </Suspense>
    </div>
  );
}
