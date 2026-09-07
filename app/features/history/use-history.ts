import { useEffect, useLayoutEffect, useReducer } from "react";
import { useAccount } from "@/features/auth/use-account";
import {
  getHistoryAccount,
  getHistoryStorageError,
  subscribeHistoryRecords,
} from "@/lib/history-manager";
import { getHistorySyncStatus } from "./sync";

const useClientLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export function useHistoryState() {
  const { user } = useAccount();
  const [revision, refresh] = useReducer((value: number) => value + 1, 0);
  useClientLayoutEffect(() => {
    const unsubscribe = subscribeHistoryRecords(refresh);
    refresh();
    return unsubscribe;
  }, []);
  const ready = getHistoryAccount() === (user?.id ?? null);
  const status = getHistorySyncStatus();
  return {
    ...status,
    revision,
    ready,
    loading:
      !ready ||
      (!!user &&
        (status.userId !== user.id || !status.loaded) &&
        status.phase !== "error"),
    storageError: getHistoryStorageError(),
  };
}
