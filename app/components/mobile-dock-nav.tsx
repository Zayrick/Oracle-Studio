import { useEffect, useState } from "react";
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
};

const mobileDockItems = [
  {
    label: "占卜",
    to: "/",
    icon: SparklesIcon,
  },
  {
    label: "历史",
    to: "/history",
    icon: Clock3Icon,
  },
  {
    label: "设置",
    to: "/settings",
    icon: SettingsIcon,
  },
] satisfies MobileDockItem[];

export function isMobileDockPathname(pathname: string) {
  return getMobileDockIndex(pathname) >= 0;
}

export function MobileDockNav() {
  const location = useLocation();
  const hiddenForKeyboard = useMobileKeyboardDockHidden();
  const activeIndex = getMobileDockIndex(location.pathname);

  return (
    <nav
      className={cn(
        "fixed inset-x-[var(--mobile-dock-edge-gap)] bottom-[var(--mobile-dock-bottom-gap)] z-40 mx-auto h-[var(--mobile-dock-content-height)] max-w-md rounded-full border bg-background/95 p-1.5 shadow-lg backdrop-blur-xl transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none md:hidden",
        hiddenForKeyboard &&
          "pointer-events-none translate-y-[calc(100%+var(--mobile-dock-bottom-gap))] opacity-0"
      )}
      aria-label="移动端主导航"
      aria-hidden={hiddenForKeyboard || undefined}
      inert={hiddenForKeyboard}
    >
      <div className="relative grid h-full grid-cols-3">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-1/3 rounded-full bg-accent shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
          style={{ transform: `translateX(${activeIndex * 100}%)` }}
        />

        {mobileDockItems.map((item, index) => {
          return (
            <MobileDockNavLink
              key={item.to}
              active={index === activeIndex}
              item={item}
            />
          );
        })}
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
      prefetch="viewport"
      aria-current={active ? "page" : undefined}
      onClick={active ? (event) => event.preventDefault() : undefined}
      className={cn(
        "relative z-10 flex min-w-0 flex-col items-center justify-center gap-1 rounded-full px-2 text-xs font-medium text-muted-foreground transition-[color,transform] hover:text-accent-foreground active:scale-[0.97] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/30 motion-reduce:transition-none [&_svg]:size-5 [&_svg]:shrink-0",
        active && "text-accent-foreground"
      )}
    >
      <Icon aria-hidden="true" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function getMobileDockIndex(pathname: string) {
  const normalizedPathname =
    pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

  return mobileDockItems.findIndex((item) => item.to === normalizedPathname);
}

function useMobileKeyboardDockHidden() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 767.98px)");
    const getViewportHeight = () =>
      window.visualViewport?.height ?? window.innerHeight;
    let restingViewportHeight = getViewportHeight();

    const updateHiddenState = () => {
      const viewportHeight = getViewportHeight();
      const textEntryFocused = isTextEntryElement(document.activeElement);

      if (!mobileQuery.matches || !textEntryFocused) {
        restingViewportHeight = viewportHeight;
        setHidden(false);
        return;
      }

      setHidden(restingViewportHeight - viewportHeight > 96);
    };

    const handleFocusIn = () => {
      updateHiddenState();
    };

    const handleFocusOut = () => {
      window.requestAnimationFrame(() => updateHiddenState());
    };

    const handleViewportChange = () => updateHiddenState();

    updateHiddenState();
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);
    window.addEventListener("resize", handleViewportChange);
    mobileQuery.addEventListener("change", handleViewportChange);
    window.visualViewport?.addEventListener("resize", handleViewportChange);
    window.visualViewport?.addEventListener("scroll", handleViewportChange);

    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
      window.removeEventListener("resize", handleViewportChange);
      mobileQuery.removeEventListener("change", handleViewportChange);
      window.visualViewport?.removeEventListener("resize", handleViewportChange);
      window.visualViewport?.removeEventListener("scroll", handleViewportChange);
    };
  }, []);

  return hidden;
}

function isTextEntryElement(element: Element | null) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  if (element.isContentEditable) {
    return true;
  }

  if (element instanceof HTMLTextAreaElement) {
    return !element.readOnly && !element.disabled;
  }

  if (!(element instanceof HTMLInputElement)) {
    return false;
  }

  if (element.readOnly || element.disabled) {
    return false;
  }

  return ![
    "button",
    "checkbox",
    "color",
    "file",
    "hidden",
    "image",
    "radio",
    "range",
    "reset",
    "submit",
  ].includes(element.type);
}
