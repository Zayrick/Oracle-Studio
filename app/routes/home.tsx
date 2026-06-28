import { useEffect, useMemo, useState } from "react";
import {
  BookOpenIcon,
  CalendarDaysIcon,
  ChevronRightIcon,
  CompassIcon,
  Flower2Icon,
  OrbitIcon,
  ScrollTextIcon,
  SearchIcon,
  SparklesIcon,
  SunIcon,
  TelescopeIcon,
  WandSparklesIcon,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router";
import { SolarDay } from "tyme4ts";

import type { Route } from "./+types/home";
import { Input } from "@/components/ui/input";
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

type Announcement = {
  title: string;
  description: string;
  label: string;
  featured?: boolean;
  mobile?: boolean;
};

type Topic = {
  title: string;
  time: string;
  mobile?: boolean;
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
    href: "/tarot",
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

const ANNOUNCEMENTS = [
  {
    title: "八字 AI 解读开放",
    description: "排盘后可直接追问命盘细节。",
    label: "新",
    featured: true,
    mobile: true,
  },
  {
    title: "六爻历史继续追问",
    description: "旧记录可回到同一上下文。",
    label: "改进",
  },
  {
    title: "塔罗牌入口准备中",
    description: "后续将支持基础牌阵。",
    label: "预告",
    mobile: true,
  },
] satisfies Announcement[];

const TOPICS = [
  { title: "命理与问事的边界", time: "3 分钟阅读", mobile: true },
  { title: "为什么要保留历史记录", time: "2 分钟阅读" },
  { title: "AI 解读适合怎么追问", time: "4 分钟阅读", mobile: true },
] satisfies Topic[];

const TIMING_ITEMS = [
  ["节气", "夏至"],
  ["月相", "上弦前"],
  ["宜", "整理问题"],
  ["记", "占后复盘"],
] as const;

export function meta({}: Route.MetaArgs) {
  return [
    { title: "云占" },
    { name: "description", content: "选择您的占卜方式" },
  ];
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("全部");
  const lunarDate = useTodayLunarDate();

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
    <div className="mx-auto flex min-h-svh w-full max-w-[1216px] flex-col gap-6 bg-background px-5 py-6 md:px-10 md:py-8">
      <header className="flex min-h-14 items-start justify-between gap-4 md:min-h-16 md:items-center">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-[22px] font-bold leading-tight tracking-normal text-foreground md:text-[25px]">
            选择占卜方式
          </h1>
          <p className="text-[13px] leading-normal text-muted-foreground md:text-sm">
            <span className="md:hidden">进入后再填写问题与信息</span>
            <span className="hidden md:inline">
              进入方式后再填写问题、时间、牌阵或起卦信息。
            </span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          <InfoPill icon={CalendarDaysIcon}>{lunarDate}</InfoPill>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-5 xl:flex-row">
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
                className="h-[42px] rounded-lg border-border bg-muted pl-10 text-sm shadow-none placeholder:text-muted-foreground focus-visible:border-border focus-visible:ring-ring/20"
              />
            </label>

            <div
              className="flex h-9 rounded-lg border border-border bg-muted p-1 md:h-[42px]"
              role="group"
              aria-label="方式分类"
            >
              {CATEGORY_FILTERS.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={category === item}
                  onClick={() => setCategory(item)}
                  className={cn(
                    "inline-flex min-w-0 flex-1 items-center justify-center rounded-md px-3 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 md:flex-none",
                    item === "择时" && "hidden sm:inline-flex",
                    category === item && "bg-background text-foreground shadow-sm"
                  )}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="flex h-[30px] items-center justify-between md:hidden">
            <h2 className="text-base font-bold text-foreground">方式库</h2>
            <span className="text-xs font-bold text-muted-foreground">
              {filteredMethods.length} 种方式
            </span>
          </div>

          <div className="flex flex-col gap-2.5 md:gap-2.5">
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

        <aside className="hidden w-full flex-col gap-4 xl:w-80 xl:shrink-0" aria-label="主页信息">
          <TodayTimingCard />
          <AnnouncementsCard />
          <TopicsCard />
        </aside>
      </div>
    </div>
  );
}

function useTodayLunarDate() {
  const [lunarDate, setLunarDate] = useState(() => formatLunarMonthDay());

  useEffect(() => {
    let timeoutId: ReturnType<typeof window.setTimeout>;

    const updateDate = () => {
      setLunarDate(formatLunarMonthDay());

      const now = new Date();
      const nextMidnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
        0,
        0,
        1
      );

      timeoutId = window.setTimeout(
        updateDate,
        Math.max(nextMidnight.getTime() - now.getTime(), 1000)
      );
    };

    updateDate();

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  return lunarDate;
}

function formatLunarMonthDay(date = new Date()) {
  const lunarDay = SolarDay.fromYmd(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate()
  ).getLunarDay();

  return `${lunarDay.getLunarMonth().getName()}${lunarDay.getName()}`;
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
      <span suppressHydrationWarning>{children}</span>
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
      <Link
        to={method.href}
        className={cn(cardClassName, "hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30")}
        aria-label={`进入${method.name}`}
      >
        {content}
      </Link>
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

function TodayTimingCard() {
  return (
    <section className="rounded-[10px] border border-border bg-card p-3.5 md:p-[18px] xl:min-h-[248px]" aria-labelledby="today-timing-title">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <h2 id="today-timing-title" className="text-[15px] font-bold text-foreground md:text-base">
            今日时序
          </h2>
          <p className="text-xs text-muted-foreground">
            <span className="xl:hidden">乙巳年 · 五月初七</span>
            <span className="hidden xl:inline">夏至 · 午月</span>
          </p>
        </div>
        <SunIcon aria-hidden="true" className="size-[18px] text-[#836B3F] md:size-5" />
      </div>

      <div className="mt-3 hidden h-[58px] flex-col justify-center gap-0.5 rounded-lg bg-primary px-3 text-primary-foreground xl:flex">
        <div className="text-[13px] font-bold">2026 · 06 · 21</div>
        <div className="text-lg font-bold">乙巳年 五月初七</div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 xl:hidden">
        {TIMING_ITEMS.map(([label, value]) => (
          <TimingTile key={label} label={label} value={value} />
        ))}
      </div>

      <div className="mt-3 hidden flex-col gap-2 xl:flex">
        {TIMING_ITEMS.map(([label, value]) => (
          <div
            key={label}
            className="flex h-7 items-center justify-between border-b border-border text-[13px] font-bold"
          >
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className="text-foreground">{value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function TimingTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex h-8 items-center justify-between rounded-md bg-muted px-2.5 text-xs font-bold">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

function AnnouncementsCard() {
  return (
    <section className="rounded-[10px] border border-border bg-card p-3.5 md:p-[18px] xl:min-h-[260px]" aria-labelledby="announcements-title">
      <div className="flex h-6 items-center justify-between border-b border-border pb-3 md:h-auto md:pb-3">
        <h2 id="announcements-title" className="text-[15px] font-bold text-foreground md:text-base">
          公告与更新
        </h2>
        <button type="button" className="text-xs font-bold text-muted-foreground hover:text-foreground">
          查看全部
        </button>
      </div>

      <div className="flex flex-col">
        {ANNOUNCEMENTS.map((item) => (
          <article
            key={item.title}
            className={cn(
              "flex flex-col gap-1.5 border-b border-border py-3 last:border-b-0 md:py-2.5 xl:py-3",
              !item.mobile && "hidden md:flex"
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="min-w-0 truncate text-[13px] font-bold text-foreground">
                {item.title}
              </h3>
              <span
                className={cn(
                  "flex h-[22px] shrink-0 items-center justify-center rounded-md px-2 text-[11px] font-bold",
                  item.featured
                    ? "bg-[#F7F1E6] text-[#836B3F]"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {item.label}
              </span>
            </div>
            <p className="text-xs leading-[1.35] text-muted-foreground">
              {item.description}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function TopicsCard() {
  return (
    <section className="rounded-[10px] border border-border bg-card p-3.5 md:p-[18px]" aria-labelledby="topics-title">
      <div className="flex h-6 items-center justify-between md:h-auto">
        <h2 id="topics-title" className="text-[15px] font-bold text-foreground md:text-base">
          入门专题
        </h2>
        <BookOpenIcon aria-hidden="true" className="size-[17px] text-muted-foreground md:size-[18px]" />
      </div>

      <div className="mt-3 rounded-md bg-muted p-3 md:mt-3.5 md:rounded-lg md:p-3.5">
        <h3 className="text-[13px] font-bold text-foreground md:text-sm">
          起卦前如何整理问题
        </h3>
        <p className="mt-1.5 text-xs leading-[1.35] text-muted-foreground md:leading-[1.4]">
          <span className="md:hidden">对象、时间、选择写清楚，排盘和解读会更稳定。</span>
          <span className="hidden md:inline">
            把对象、时间、选择写清楚，后续排盘和解读会更稳定。
          </span>
        </p>
      </div>

      <div className="mt-2 flex flex-col">
        {TOPICS.map((topic) => (
          <button
            key={topic.title}
            type="button"
            className={cn(
              "flex h-[38px] items-center justify-between gap-3 border-t border-border text-left hover:text-foreground md:h-[42px]",
              !topic.mobile && "hidden md:flex"
            )}
          >
            <span className="min-w-0">
              <span className="block truncate text-xs font-bold text-foreground md:text-[13px]">
                {topic.title}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {topic.time}
              </span>
            </span>
            <ChevronRightIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground md:size-[15px]" />
          </button>
        ))}
      </div>
    </section>
  );
}
