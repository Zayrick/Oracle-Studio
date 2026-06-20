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
  const hiddenForKeyboard = useMobileKeyboardDockHidden();

  useEffect(() => {
    document.documentElement.toggleAttribute(
      "data-mobile-keyboard-open",
      hiddenForKeyboard
    );

    return () => {
      document.documentElement.removeAttribute("data-mobile-keyboard-open");
    };
  }, [hiddenForKeyboard]);

  return (
    <nav
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-3 pb-[var(--mobile-dock-padding-bottom)] pt-[var(--mobile-dock-padding-top)] backdrop-blur transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none md:hidden",
        hiddenForKeyboard && "pointer-events-none translate-y-full opacity-0"
      )}
      aria-label="移动端主导航"
      aria-hidden={hiddenForKeyboard || undefined}
    >
      <div className="mx-auto grid h-[var(--mobile-dock-content-height)] max-w-md grid-cols-3 gap-1">
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

function useMobileKeyboardDockHidden() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 767.98px)");

    const updateHiddenState = () => {
      setHidden(
        mobileQuery.matches && isTextEntryElement(document.activeElement)
      );
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
