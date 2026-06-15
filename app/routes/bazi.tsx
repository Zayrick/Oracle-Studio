import type { Route } from "./+types/bazi";
import { PAGE_TITLES } from "@/lib/page-titles";

export function meta({}: Route.MetaArgs) {
  return [
    { title: PAGE_TITLES.bazi },
    { name: "description", content: "八字占卜" },
  ];
}

export default function Bazi() {
  return (
    <div className="container mx-auto px-4 py-16">
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)]">
        <h2 className="text-3xl font-bold mb-8">八字</h2>
        <p className="text-xl text-gray-600">开发中...</p>
      </div>
    </div>
  );
}
