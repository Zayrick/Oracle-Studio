import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useHistoryState } from "@/features/history/use-history";
import { retryHistorySync } from "@/features/history/sync";

export function HistorySyncNotice({
  showStatus = false,
}: {
  showStatus?: boolean;
}) {
  const state = useHistoryState();
  const error = state.storageError || state.error;
  if (error && showStatus) return null;
  if (error)
    return (
      <Alert variant="destructive">
        <AlertTitle>数据尚未完成同步</AlertTitle>
        <AlertDescription>
          <p>{error}</p>
          {state.userId ? (
            <Button variant="outline" size="sm" onClick={retryHistorySync}>
              重试同步
            </Button>
          ) : null}
        </AlertDescription>
      </Alert>
    );
  if (!showStatus) return null;
  return (
    <p role="status" className="text-sm text-muted-foreground">
      {state.phase === "local"
        ? "当前记录保存在本机，登录后会自动同步到云端。"
        : state.loading || state.phase === "syncing"
          ? "正在同步记录与外观设置…"
          : "记录与外观设置已同步到云端。"}
    </p>
  );
}
