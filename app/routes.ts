import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("/六爻", "routes/liuyao.tsx"),
  route("/八字", "routes/bazi.tsx"),
  route("/tarot", "routes/tarot.tsx"),
] satisfies RouteConfig;
