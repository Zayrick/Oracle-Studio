import {
  lazy,
  Suspense,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  UNSAFE_ViewTransitionContext,
  useLocation,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";
import "streamdown/styles.css";
import {
  isMobileDockPathname,
  MobileDockNav,
} from "./components/mobile-dock-nav";
import { ThemeInitScript, ThemeProvider } from "./components/theme-provider";
import { cn } from "./lib/utils";

const useIsomorphicLayoutEffect =
  typeof document === "undefined" ? useEffect : useLayoutEffect;

const LazySidebarNav = lazy(() =>
  import("./components/sidebar-nav").then(({ SidebarNav }) => ({
    default: SidebarNav,
  }))
);

export const links: Route.LinksFunction = () => [
  {
    rel: "manifest",
    href: "/manifest.webmanifest",
    type: "application/manifest+json",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content"
        />
        <meta name="color-scheme" content="light dark" />
        <ThemeInitScript />
        <Meta />
        <Links />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const showMobileNav = isMobileDockPathname(location.pathname);

  useRouteTransitionDirection(location);

  return (
    <div className="app-route-stage min-h-dvh bg-background">
      <DesktopSidebarNav />
      <main
        className={cn(
          "min-h-dvh md:pl-[224px]",
          showMobileNav && "pb-[var(--mobile-dock-page-offset)] md:pb-0"
        )}
      >
        {children}
      </main>
      {showMobileNav ? <MobileDockNav /> : null}
    </div>
  );
}

function useRouteTransitionDirection(location: ReturnType<typeof useLocation>) {
  const transition = useContext(UNSAFE_ViewTransitionContext);
  const handledTransition = useRef<object | null>(null);

  useIsomorphicLayoutEffect(() => {
    if (!transition.isTransitioning) {
      handledTransition.current = null;
      delete document.documentElement.dataset.routeTransition;
      return;
    }

    if (handledTransition.current === transition) {
      return;
    }

    handledTransition.current = transition;
    const destination =
      transition.currentLocation.key === location.key
        ? transition.nextLocation
        : transition.currentLocation;
    const sourceHasDock = isMobileDockPathname(location.pathname);
    const destinationHasDock = isMobileDockPathname(destination.pathname);

    document.documentElement.dataset.routeTransition =
      sourceHasDock === destinationHasDock
        ? "none"
        : destinationHasDock
          ? "back"
          : "forward";
  }, [location.key, transition]);
}

function DesktopSidebarNav() {
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const updateDesktop = () => setDesktop(mediaQuery.matches);

    updateDesktop();
    mediaQuery.addEventListener("change", updateDesktop);

    return () => {
      mediaQuery.removeEventListener("change", updateDesktop);
    };
  }, []);

  if (!desktop) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <LazySidebarNav />
    </Suspense>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <AppShell>
      <div className="container mx-auto p-4">
        <h1>{message}</h1>
        <p>{details}</p>
        {stack && (
          <pre className="w-full overflow-x-auto p-4">
            <code>{stack}</code>
          </pre>
        )}
      </div>
    </AppShell>
  );
}
