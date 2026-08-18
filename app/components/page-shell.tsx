import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function PageShell({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "mx-auto min-h-[calc(100dvh-var(--mobile-dock-page-offset))] pt-[calc(var(--mobile-safe-top)+2.5rem)] md:min-h-dvh md:pt-12",
        className
      )}
      {...props}
    />
  );
}
