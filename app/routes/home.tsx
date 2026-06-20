import { Link } from "react-router";
import type { Route } from "./+types/home";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "云占" },
    { name: "description", content: "选择您的占卜方式" },
  ];
}

export default function Home() {
  const divinations = [
    { name: "六爻", path: "/liuyao" },
    { name: "八字", path: "/bazi" },
    { name: "塔罗牌", path: "/tarot" },
  ];

  return (
    <div className="container mx-auto px-4 py-16">
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] gap-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
          {divinations.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                buttonVariants({ variant: "outline" }),
                "h-32 w-full text-2xl font-semibold transition-colors"
              )}
            >
              {item.name}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
