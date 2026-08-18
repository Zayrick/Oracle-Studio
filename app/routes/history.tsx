import { HistoryRecordList } from "@/components/history-record-list";
import { PageShell } from "@/components/page-shell";
import type { Route } from "./+types/history";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "云占·历史" },
    { name: "description", content: "历史记录" },
  ];
}

export default function History() {
  return (
    <PageShell className="container px-4 pb-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">历史记录</h1>
          <p className="text-sm text-muted-foreground">查看和管理过往占卜记录</p>
        </header>

        <HistoryRecordList variant="page" />
      </div>
    </PageShell>
  );
}
