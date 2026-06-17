import {
  CircleUserRoundIcon,
  HomeIcon,
  ScrollTextIcon,
  SettingsIcon,
  SparklesIcon,
  type LucideIcon,
  WandSparklesIcon,
} from "lucide-react";
import { NavLink } from "react-router";

import { SidebarHistorySection } from "@/components/sidebar-history-section";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const divinationItems = [
  {
    label: "六爻",
    to: "/liuyao",
    icon: ScrollTextIcon,
  },
  {
    label: "八字",
    to: "/bazi",
    icon: SparklesIcon,
  },
  {
    label: "塔罗牌",
    to: "/tarot",
    icon: WandSparklesIcon,
  },
];

export function SidebarNav() {
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-[224px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-full min-h-0 flex-col px-3 py-4">
        <div className="px-2 pb-4 text-lg font-semibold tracking-tight">云占</div>

        <nav className="flex flex-col gap-1" aria-label="主导航">
          <SidebarNavLink to="/" label="主页" icon={HomeIcon} end />

          <div className="ml-6 flex flex-col gap-1 border-l border-sidebar-border pl-2">
            {divinationItems.map((item) => (
              <SidebarNavLink
                key={item.to}
                to={item.to}
                label={item.label}
                icon={item.icon}
                nested
              />
            ))}
          </div>
        </nav>

        <Separator className="my-4 bg-sidebar-border" />

        <SidebarHistorySection />

        <Separator className="my-3 bg-sidebar-border" />

        <div className="flex h-10 items-center gap-2 rounded-md px-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground [&_svg]:size-5 [&_svg]:shrink-0">
            <CircleUserRoundIcon aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1 truncate text-sm font-medium">开发中</div>
          <NavLink
            to="/settings"
            aria-label="设置"
            className={({ isActive, isPending }) =>
              cn(
                "flex size-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0",
                isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
                isPending && "opacity-70"
              )
            }
          >
            <SettingsIcon aria-hidden="true" />
          </NavLink>
        </div>
      </div>
    </aside>
  );
}

function SidebarNavLink({
  to,
  label,
  icon: Icon,
  end,
  nested,
}: {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  nested?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive, isPending }) =>
        cn(
          "flex h-9 min-w-0 items-center gap-2 rounded-md px-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0",
          nested && "h-8 text-sm font-normal",
          isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
          isPending && "opacity-70"
        )
      }
    >
      <Icon aria-hidden="true" />
      <span className="truncate">{label}</span>
    </NavLink>
  );
}
