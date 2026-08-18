import { useEffect, useMemo, useState } from "react";
import {
  CalendarDaysIcon,
  ChevronRightIcon,
  CompassIcon,
  Flower2Icon,
  OrbitIcon,
  ScrollTextIcon,
  SearchIcon,
  SparklesIcon,
  TelescopeIcon,
  WandSparklesIcon,
  type LucideIcon,
} from "lucide-react";

import type { Route } from "./+types/home";
import { PageShell } from "@/components/page-shell";
import { TransitionLink } from "@/components/route-transition-link";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

type DivinationCategory = "问事" | "命理" | "牌阵" | "择时";
type CategoryFilter = "全部" | DivinationCategory;
type MethodStatus = "可用" | "待开放";

type DivinationMethod = {
  name: string;
  category: DivinationCategory;
  description: string;
  mobileDescription: string;
  material: string;
  status: MethodStatus;
  href?: string;
  icon: LucideIcon;
};

type TodayAlmanac = {
  lunarDate: string;
  recommends: string[];
  avoids: string[];
};

const CATEGORY_FILTERS = ["全部", "问事", "命理", "牌阵", "择时"] satisfies CategoryFilter[];

const DIVINATION_METHODS = [
  {
    name: "六爻",
    category: "问事",
    description: "适合具体问题、取舍、短期时机判断。",
    mobileDescription: "具体问题、取舍、短期时机。",
    material: "起卦方式",
    status: "可用",
    href: "/liuyao",
    icon: ScrollTextIcon,
  },
  {
    name: "八字",
    category: "命理",
    description: "适合命盘结构、长期趋势和阶段分析。",
    mobileDescription: "命盘结构、长期趋势。",
    material: "出生信息",
    status: "可用",
    href: "/bazi",
    icon: SparklesIcon,
  },
  {
    name: "塔罗牌",
    category: "牌阵",
    description: "适合关系、状态、灵感与短期观察。",
    mobileDescription: "关系、状态、灵感观察。",
    material: "问题 + 牌阵",
    status: "待开放",
    icon: WandSparklesIcon,
  },
  {
    name: "梅花易数",
    category: "问事",
    description: "以时间、数字或事件触发取象。",
    mobileDescription: "时间、数字或事件取象。",
    material: "时间 / 数字",
    status: "待开放",
    icon: Flower2Icon,
  },
  {
    name: "奇门遁甲",
    category: "择时",
    description: "适合方位、策略、时机和行动方案。",
    mobileDescription: "方位、策略与行动时机。",
    material: "时间 + 场景",
    status: "待开放",
    icon: CompassIcon,
  },
  {
    name: "紫微斗数",
    category: "命理",
    description: "以宫位关系观察人生结构与阶段。",
    mobileDescription: "宫位关系与人生阶段。",
    material: "出生信息",
    status: "待开放",
    icon: OrbitIcon,
  },
  {
    name: "星盘",
    category: "命理",
    description: "以出生资料和天象周期作参考。",
    mobileDescription: "出生资料和天象周期。",
    material: "出生地点",
    status: "待开放",
    icon: TelescopeIcon,
  },
] satisfies DivinationMethod[];

const INITIAL_TODAY_ALMANAC: TodayAlmanac = {
  lunarDate: "农历加载中",
  recommends: ["加载中"],
  avoids: ["加载中"],
};

export function meta({}: Route.MetaArgs) {
  return [
    { title: "云占" },
    {
      name: "description",
      content: "想从什么开始？查看今日宜忌并选择占卜方式。",
    },
  ];
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("全部");
  const todayAlmanac = useTodayAlmanac();

  const filteredMethods = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();

    return DIVINATION_METHODS.filter((method) => {
      const matchesCategory =
        category === "全部" || method.category === category;

      if (!matchesCategory) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return [
        method.name,
        method.category,
        method.description,
        method.mobileDescription,
        method.material,
        method.status,
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedQuery);
    });
  }, [category, query]);

  return (
    <PageShell className="flex w-full max-w-[1216px] flex-col gap-6 bg-background px-5 pb-6 md:px-10 md:pb-8">
      <header className="flex min-h-14 items-start justify-between gap-4 md:min-h-16 md:items-center">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-[22px] font-bold leading-tight tracking-normal text-foreground md:text-[25px]">
            想从什么开始？
          </h1>
          <p className="line-clamp-2 min-h-10 text-[13px] leading-normal text-muted-foreground md:min-h-0 md:text-sm">
            <span>
              今日 · 宜 {formatAlmanacItems(todayAlmanac.recommends, 3)} · 忌{" "}
              {formatAlmanacItems(todayAlmanac.avoids, 3)}
            </span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          <InfoPill className="min-w-[6.75rem] justify-center" icon={CalendarDaysIcon}>
            {todayAlmanac.lunarDate}
          </InfoPill>
        </div>
      </header>

      <section className="flex min-w-0 flex-1 flex-col gap-4" aria-label="方式库">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
            <label className="relative block">
              <span className="sr-only">搜索占卜方式</span>
              <SearchIcon
                aria-hidden="true"
                className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground md:size-[17px]"
              />
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索占卜方式"
                className="h-11 rounded-lg border-border bg-muted pl-10 shadow-none placeholder:text-muted-foreground focus-visible:border-border focus-visible:ring-ring/20 md:h-[42px]"
              />
            </label>

            <ToggleGroup
              className="h-9 w-full rounded-lg border border-border bg-muted p-1 md:h-[42px] md:w-fit"
              value={[category]}
              spacing={1}
              aria-label="方式分类"
              onValueChange={(values) => {
                const nextCategory = values[values.length - 1];

                if (isCategoryFilter(nextCategory)) {
                  setCategory(nextCategory);
                }
              }}
            >
              {CATEGORY_FILTERS.map((item) => (
                <ToggleGroupItem
                  key={item}
                  value={item}
                  className="h-full min-w-0 flex-1 rounded-md px-3 text-xs font-bold text-muted-foreground hover:text-foreground aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm md:flex-none"
                >
                  {item}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <div className="flex flex-col gap-2.5">
            {filteredMethods.length > 0 ? (
              filteredMethods.map((method) => (
                <MethodCard key={method.name} method={method} />
              ))
            ) : (
              <div className="flex min-h-28 items-center justify-center rounded-[10px] border border-border bg-card px-4 text-sm text-muted-foreground">
                没有找到匹配的占卜方式
              </div>
            )}
          </div>
      </section>
    </PageShell>
  );
}

function useTodayAlmanac() {
  const [todayAlmanac, setTodayAlmanac] = useState<TodayAlmanac>(
    INITIAL_TODAY_ALMANAC
  );

  useEffect(() => {
    let timeoutId: ReturnType<typeof window.setTimeout>;
    let cancelled = false;

    const updateDate = async () => {
      const now = new Date();

      try {
        const nextAlmanac = await getAlmanacForDate(now);

        if (!cancelled) {
          setTodayAlmanac(nextAlmanac);
        }
      } catch {
        // Keep the stable placeholder when the optional almanac module fails.
      }

      if (cancelled) {
        return;
      }

      const nextMidnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
        0,
        0,
        1
      );

      timeoutId = window.setTimeout(
        () => void updateDate(),
        Math.max(nextMidnight.getTime() - now.getTime(), 1000)
      );
    };

    void updateDate();

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

  return todayAlmanac;
}

async function getAlmanacForDate(date: Date) {
  const { SolarDay } = await import("tyme4ts");
  const lunarDay = SolarDay.fromYmd(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate()
  ).getLunarDay();

  return {
    lunarDate: `${lunarDay.getLunarMonth().getName()}${lunarDay.getName()}`,
    recommends: lunarDay.getRecommends().map((item) => item.getName()),
    avoids: lunarDay.getAvoids().map((item) => item.getName()),
  };
}

function formatAlmanacItems(items: string[], limit: number) {
  return items.slice(0, limit).join("、") || "暂无";
}

function isCategoryFilter(value: unknown): value is CategoryFilter {
  return (
    typeof value === "string" &&
    CATEGORY_FILTERS.some((item) => item === value)
  );
}

function InfoPill({
  children,
  className,
  icon: Icon,
}: {
  children: string;
  className?: string;
  icon: LucideIcon;
}) {
  return (
    <div
      className={cn(
        "flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-[13px] font-medium text-foreground max-md:border-0 max-md:bg-muted max-md:text-xs max-md:font-bold",
        className
      )}
    >
      <Icon aria-hidden={true} className="size-[15px] text-muted-foreground max-md:size-3.5" />
      <span>{children}</span>
    </div>
  );
}

function MethodCard({ method }: { method: DivinationMethod }) {
  const Icon = method.icon;
  const isAvailable = method.status === "可用";
  const cardClassName =
    "group flex h-[68px] w-full items-center gap-2.5 rounded-[10px] border border-border bg-card px-3 text-left transition-colors md:h-[78px] md:gap-3.5 md:px-4";
  const content = (
    <>
      <div className="flex size-[38px] shrink-0 items-center justify-center rounded-md bg-muted text-foreground md:size-[42px] md:rounded-lg">
        <Icon aria-hidden={true} className="size-[18px] md:size-[19px]" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1 md:gap-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-sm font-bold leading-none text-foreground md:text-[15px]">
            {method.name}
          </h3>
          <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-bold leading-none text-muted-foreground">
            {method.category}
          </span>
        </div>
        <p className="truncate text-xs leading-[1.3] text-muted-foreground md:hidden">
          {method.mobileDescription}
        </p>
        <p className="hidden text-[13px] leading-[1.35] text-muted-foreground md:block">
          {method.description}
        </p>
      </div>

      <span className="hidden w-[170px] shrink-0 text-xs text-muted-foreground md:block">
        {method.material}
      </span>

      <span
        className={cn(
          "flex h-[25px] w-[58px] shrink-0 items-center justify-center rounded-md text-[11px] font-bold md:h-7 md:w-[72px] md:text-xs",
          isAvailable
            ? "bg-[#F7F1E6] text-[#836B3F]"
            : "bg-muted text-muted-foreground"
        )}
      >
        {method.status}
      </span>

      <ChevronRightIcon
        aria-hidden="true"
        className="size-[15px] shrink-0 text-muted-foreground md:size-[17px]"
      />
    </>
  );

  if (method.href) {
    return (
      <TransitionLink
        to={method.href}
        prefetch="intent"
        className={cn(cardClassName, "hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30")}
        aria-label={`进入${method.name}`}
      >
        {content}
      </TransitionLink>
    );
  }

  return (
    <button
      type="button"
      className={cn(cardClassName, "cursor-default")}
      aria-disabled="true"
      aria-label={`${method.name}待开放`}
    >
      {content}
    </button>
  );
}
