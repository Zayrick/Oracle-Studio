import { useEffect, useState, type FormEvent } from "react";
import { format } from "date-fns";
import {
  CheckIcon,
  Clock3Icon,
  PencilIcon,
  ScrollTextIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getHistoryRecordBaseHref,
  getHistoryRecordHref,
} from "@/features/history-sources";
import {
  deleteHistoryRecord,
  listHistoryRecords,
  subscribeHistoryRecords,
  updateHistoryRecord,
  type HistoryRecord,
} from "@/lib/history-manager";
import { cn } from "@/lib/utils";

export function SidebarHistorySection() {
  const [records, setRecords] = useState<Array<HistoryRecord>>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  const activeHistoryId = new URLSearchParams(location.search).get("history");

  const refreshRecords = () => {
    setRecords(listHistoryRecords());
  };

  useEffect(() => {
    refreshRecords();
    return subscribeHistoryRecords(refreshRecords);
  }, []);

  const startEditing = (record: HistoryRecord) => {
    setEditingId(record.id);
    setEditingTitle(record.title);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingTitle("");
  };

  const submitRename = (event: FormEvent, record: HistoryRecord) => {
    event.preventDefault();

    const title = editingTitle.trim();

    if (title) {
      updateHistoryRecord(record.id, { title });
      refreshRecords();
    }

    cancelEditing();
  };

  const deleteRecord = (record: HistoryRecord) => {
    deleteHistoryRecord(record.id);
    refreshRecords();

    if (activeHistoryId === record.id) {
      navigate(getHistoryRecordBaseHref(record), { replace: true });
    }
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2" aria-labelledby="sidebar-history-heading">
      <div
        id="sidebar-history-heading"
        className="px-2 text-xs font-medium text-muted-foreground"
      >
        历史记录
      </div>

      {records.length === 0 ? (
        <Empty className="min-h-0 flex-1 items-start justify-start rounded-md border-0 p-2 text-left">
          <EmptyHeader className="max-w-full flex-row items-center gap-2">
            <EmptyMedia variant="icon" className="mb-0">
              <Clock3Icon aria-hidden="true" />
            </EmptyMedia>
            <EmptyDescription className="truncate">
              暂无历史记录
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ScrollArea className="min-h-0 flex-1 pr-1">
          <div className="flex flex-col gap-1">
            {records.map((record) => (
              <SidebarHistoryItem
                key={record.id}
                record={record}
                active={activeHistoryId === record.id}
                editing={editingId === record.id}
                editingTitle={editingTitle}
                onCancelEditing={cancelEditing}
                onDelete={deleteRecord}
                onEditingTitleChange={setEditingTitle}
                onStartEditing={startEditing}
                onSubmitRename={submitRename}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </section>
  );
}

function SidebarHistoryItem({
  record,
  active,
  editing,
  editingTitle,
  onCancelEditing,
  onDelete,
  onEditingTitleChange,
  onStartEditing,
  onSubmitRename,
}: {
  record: HistoryRecord;
  active: boolean;
  editing: boolean;
  editingTitle: string;
  onCancelEditing: () => void;
  onDelete: (record: HistoryRecord) => void;
  onEditingTitleChange: (value: string) => void;
  onStartEditing: (record: HistoryRecord) => void;
  onSubmitRename: (event: FormEvent, record: HistoryRecord) => void;
}) {
  if (editing) {
    return (
      <form
        className="flex items-center gap-1 rounded-md bg-sidebar-accent p-1"
        onSubmit={(event) => onSubmitRename(event, record)}
      >
        <Input
          value={editingTitle}
          autoFocus
          className="h-8 min-w-0 text-xs"
          aria-label="历史记录标题"
          onChange={(event) => onEditingTitleChange(event.target.value)}
        />
        <Button type="submit" variant="ghost" size="icon-xs" aria-label="保存标题">
          <CheckIcon />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="取消重命名"
          onClick={onCancelEditing}
        >
          <XIcon />
        </Button>
      </form>
    );
  }

  return (
    <div
      className={cn(
        "group/history flex min-w-0 items-start gap-1 rounded-md px-1 py-1",
        active && "bg-sidebar-accent text-sidebar-accent-foreground"
      )}
    >
      <NavLink
        to={getHistoryRecordHref(record)}
        className="flex min-w-0 flex-1 items-start gap-2 rounded-sm px-1 py-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
      >
        <ScrollTextIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium">
            {record.title}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
            {formatHistoryItemMeta(record)}
          </span>
        </span>
      </NavLink>

      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/history:opacity-100 focus-within:opacity-100">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="重命名历史记录"
          onClick={() => onStartEditing(record)}
        >
          <PencilIcon />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="删除历史记录"
              />
            }
          >
            <Trash2Icon />
          </AlertDialogTrigger>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>删除历史记录？</AlertDialogTitle>
              <AlertDialogDescription>
                此操作会删除“{record.title}”，无法撤销。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => onDelete(record)}
              >
                删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

function formatHistoryItemMeta(record: HistoryRecord) {
  return `${record.source} · ${formatHistoryDateTime(record.createdAt)}`;
}

function formatHistoryDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "时间未知";
  }

  return format(date, "MM-dd HH:mm");
}
