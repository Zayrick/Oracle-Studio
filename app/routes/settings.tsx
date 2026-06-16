import type { Route } from "./+types/settings";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "云占·设置" },
    { name: "description", content: "设置" },
  ];
}

export default function Settings() {
  return (
    <div className="container mx-auto flex min-h-svh items-center justify-center px-4 py-16">
      <p className="text-xl text-muted-foreground">开发中</p>
    </div>
  );
}
