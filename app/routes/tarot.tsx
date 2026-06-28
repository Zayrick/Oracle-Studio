import type { Route } from "./+types/tarot";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "云占·塔罗牌" },
    { name: "description", content: "塔罗牌占卜" },
  ];
}

export default function Tarot() {
  return (
    <div className="container mx-auto px-4 py-16">
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)]">
        <h2 className="text-3xl font-bold mb-8">塔罗牌</h2>
        <p className="text-xl text-muted-foreground">开发中...</p>
      </div>
    </div>
  );
}
