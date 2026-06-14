import type { Route } from "./+types/liuyao";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "六爻 - 占卜大师" },
    { name: "description", content: "六爻占卜" },
  ];
}

export default function Liuyao() {
  return (
    <div className="container mx-auto px-4 py-16">
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)]">
        <h2 className="text-3xl font-bold mb-8">六爻</h2>
        <p className="text-xl text-gray-600">开发中...</p>
      </div>
    </div>
  );
}
