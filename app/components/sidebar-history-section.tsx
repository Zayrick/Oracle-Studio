import { HistoryRecordList } from "@/components/history-record-list";

export function SidebarHistorySection() {
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2" aria-labelledby="sidebar-history-heading">
      <div
        id="sidebar-history-heading"
        className="px-2 text-xs font-medium text-muted-foreground"
      >
        历史记录
      </div>

      <HistoryRecordList variant="sidebar" />
    </section>
  );
}
