import { useRouteLoaderData } from "react-router";
import type { loader } from "@/root";

export function useAccount() {
  return (
    useRouteLoaderData<typeof loader>("root")?.account ?? {
      user: null,
      available: false,
    }
  );
}
