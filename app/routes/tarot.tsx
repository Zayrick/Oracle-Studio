import type { Route } from "./+types/tarot";
import { PAGE_TITLES } from "@/lib/page-titles";

export function meta({}: Route.MetaArgs) {
  return [
    { title: PAGE_TITLES.tarot },
    { name: "description", content: "塔罗牌占卜" },
  ];
}

export default function Tarot() {
  return (
    <div className="container mx-auto px-4 py-16">
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)]">
        <h2 className="text-3xl font-bold mb-8">塔罗牌</h2>
        <p className="text-xl text-gray-600">开发中...</p>
      </div>
    </div>
  );
}
