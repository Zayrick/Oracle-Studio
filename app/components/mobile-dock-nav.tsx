import {
  Clock3Icon,
  SettingsIcon,
  SparklesIcon,
  type LucideIcon,
} from "lucide-react";
import { Link, useLocation } from "react-router";

import { cn } from "@/lib/utils";

type MobileDockItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  isActive: (pathname: string) => boolean;
};

const divinationPathnames = ["/", "/liuyao", "/bazi", "/tarot"];

const mobileDockItems = [
  {
    label: "占卜",
    to: "/",
    icon: SparklesIcon,
    isActive: (pathname) =>
      divinationPathnames.some((item) => isSamePathOrChild(pathname, item)),
  },
  {
    label: "历史",
    to: "/history",
    icon: Clock3Icon,
    isActive: (pathname) => isSamePathOrChild(pathname, "/history"),
  },
  {
    label: "设置",
    to: "/settings",
    icon: SettingsIcon,
    isActive: (pathname) => isSamePathOrChild(pathname, "/settings"),
  },
] satisfies MobileDockItem[];

export function MobileDockNav() {
  const location = useLocation();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 backdrop-blur md:hidden"
      aria-label="移动端主导航"
    >
      <div className="mx-auto grid h-14 max-w-md grid-cols-3 gap-1">
        {mobileDockItems.map((item) => (
          <MobileDockNavLink
            key={item.to}
            active={item.isActive(location.pathname)}
            item={item}
          />
        ))}
      </div>
    </nav>
  );
}

function MobileDockNavLink({
  active,
  item,
}: {
  active: boolean;
  item: MobileDockItem;
}) {
  const Icon = item.icon;

  return (
    <Link
      to={item.to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-w-0 flex-col items-center justify-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 [&_svg]:size-5 [&_svg]:shrink-0",
        active && "bg-accent text-accent-foreground"
      )}
    >
      <Icon aria-hidden="true" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function isSamePathOrChild(pathname: string, target: string) {
  if (target === "/") {
    return pathname === "/";
  }

  return pathname === target || pathname.startsWith(`${target}/`);
}
