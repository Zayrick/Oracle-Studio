import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("/api/liuyao/ai", "routes/liuyao-ai.ts"),
  route("/liuyao", "routes/liuyao.tsx"),
  route("/bazi", "routes/bazi.tsx"),
  route("/tarot", "routes/tarot.tsx"),
  route("/settings", "routes/settings.tsx"),
] satisfies RouteConfig;
