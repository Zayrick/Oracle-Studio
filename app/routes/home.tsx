import { Link } from "react-router";
import type { Route } from "./+types/home";
import { Button } from "../components/ui/button";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "占卜大师" },
    { name: "description", content: "选择您的占卜方式" },
  ];
}

export default function Home() {
  const divinations = [
    { name: "六爻", path: "/六爻" },
    { name: "八字", path: "/八字" },
    { name: "塔罗牌", path: "/tarot" },
  ];

  return (
    <div className="container mx-auto px-4 py-16">
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] gap-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
          {divinations.map((item) => (
            <Link key={item.path} to={item.path}>
              <Button
                variant="outline"
                className="w-full h-32 text-2xl font-semibold hover:bg-gray-50 transition-colors"
              >
                {item.name}
              </Button>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
