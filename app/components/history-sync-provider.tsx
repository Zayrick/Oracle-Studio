import { useEffect, useLayoutEffect, type ReactNode } from "react";
import { useAccount } from "@/features/auth/use-account";
import { startHistorySync } from "@/features/history/sync";
import { setHistoryAccount } from "@/lib/history-manager";

const useClientLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export function HistorySyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAccount();
  const userId = user?.id ?? null;
  useClientLayoutEffect(() => {
    setHistoryAccount(userId);
    return startHistorySync(userId);
  }, [userId]);
  return children;
}
