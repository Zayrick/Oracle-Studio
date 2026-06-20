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
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
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

type HistoryRecordListVariant = "sidebar" | "page";

export function HistoryRecordList({
  className,
  variant = "sidebar",
}: {
  className?: string;
  variant?: HistoryRecordListVariant;
}) {
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

  const submitRename = (event: FormEvent<HTMLFormElement>, record: HistoryRecord) => {
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

  if (records.length === 0) {
    return <HistoryEmptyState className={className} variant={variant} />;
  }

  const list = (
    <div
      className={cn(
        "flex flex-col",
        variant === "sidebar" ? "gap-1" : "gap-2",
        variant === "page" && className
      )}
    >
      {records.map((record) => (
        <HistoryRecordItem
          key={record.id}
          record={record}
          active={activeHistoryId === record.id}
          editing={editingId === record.id}
          editingTitle={editingTitle}
          variant={variant}
          onCancelEditing={cancelEditing}
          onDelete={deleteRecord}
          onEditingTitleChange={setEditingTitle}
          onStartEditing={startEditing}
          onSubmitRename={submitRename}
        />
      ))}
    </div>
  );

  if (variant === "sidebar") {
    return (
      <ScrollArea className={cn("min-h-0 flex-1 pr-1", className)}>
        {list}
      </ScrollArea>
    );
  }

  return list;
}

function HistoryEmptyState({
  className,
  variant,
}: {
  className?: string;
  variant: HistoryRecordListVariant;
}) {
  if (variant === "sidebar") {
    return (
      <Empty className={cn("min-h-0 flex-1 items-start justify-start rounded-md border-0 p-2 text-left", className)}>
        <EmptyHeader className="max-w-full flex-row items-center gap-2">
          <EmptyMedia variant="icon" className="mb-0">
            <Clock3Icon aria-hidden="true" />
          </EmptyMedia>
          <EmptyDescription className="truncate">
            暂无历史记录
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Empty className={cn("min-h-[18rem] rounded-md border bg-card px-4 py-12", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Clock3Icon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>暂无历史记录</EmptyTitle>
        <EmptyDescription>完成一次占卜后，记录会显示在这里。</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function HistoryRecordItem({
  record,
  active,
  editing,
  editingTitle,
  variant,
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
  variant: HistoryRecordListVariant;
  onCancelEditing: () => void;
  onDelete: (record: HistoryRecord) => void;
  onEditingTitleChange: (value: string) => void;
  onStartEditing: (record: HistoryRecord) => void;
  onSubmitRename: (event: FormEvent<HTMLFormElement>, record: HistoryRecord) => void;
}) {
  if (editing) {
    return (
      <form
        className={cn(
          "flex items-center gap-1 rounded-md",
          variant === "sidebar" ? "bg-sidebar-accent p-1" : "border bg-card p-2"
        )}
        onSubmit={(event) => onSubmitRename(event, record)}
      >
        <Input
          value={editingTitle}
          autoFocus
          className={cn("min-w-0", variant === "sidebar" ? "h-8 text-xs" : "h-9")}
          aria-label="历史记录标题"
          onChange={(event) => onEditingTitleChange(event.target.value)}
        />
        <Button
          type="submit"
          variant="ghost"
          size={variant === "sidebar" ? "icon-xs" : "icon-sm"}
          aria-label="保存标题"
        >
          <CheckIcon />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size={variant === "sidebar" ? "icon-xs" : "icon-sm"}
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
        "group/history flex min-w-0 items-start rounded-md",
        variant === "sidebar"
          ? "gap-1 px-1 py-1"
          : "gap-2 border bg-card p-2",
        active &&
          (variant === "sidebar"
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "border-primary/30 bg-accent text-accent-foreground")
      )}
    >
      <NavLink
        to={getHistoryRecordHref(record)}
        className={cn(
          "flex min-w-0 flex-1 items-start gap-2 rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
          variant === "sidebar" ? "px-1 py-1" : "p-2"
        )}
      >
        <ScrollTextIcon
          className={cn(
            "mt-0.5 shrink-0 text-muted-foreground",
            variant === "sidebar" ? "size-4" : "size-5"
          )}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate font-medium",
              variant === "sidebar" ? "text-xs" : "text-sm"
            )}
          >
            {record.title}
          </span>
          <span
            className={cn(
              "block truncate text-muted-foreground",
              variant === "sidebar" ? "mt-0.5 text-[11px]" : "mt-1 text-xs"
            )}
          >
            {formatHistoryItemMeta(record)}
          </span>
        </span>
      </NavLink>

      <div
        className={cn(
          "flex shrink-0 items-center",
          variant === "sidebar"
            ? "gap-0.5 opacity-0 transition-opacity group-hover/history:opacity-100 focus-within:opacity-100"
            : "gap-1 pt-1"
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size={variant === "sidebar" ? "icon-xs" : "icon-sm"}
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
                size={variant === "sidebar" ? "icon-xs" : "icon-sm"}
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
