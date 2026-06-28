import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const DEFAULT_THEME: Theme = "system";
const DEFAULT_RESOLVED_THEME: ResolvedTheme = "light";
const DEFAULT_STORAGE_KEY = "oracle-studio-theme";
const THEME_QUERY = "(prefers-color-scheme: dark)";

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
};

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(
  undefined
);

export function ThemeProvider({
  children,
  defaultTheme = DEFAULT_THEME,
  storageKey = DEFAULT_STORAGE_KEY,
}: ThemeProviderProps) {
  const activeThemeRef = useRef<Theme>(defaultTheme);
  const [theme, setThemeState] = useState<Theme>(defaultTheme);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(
    DEFAULT_RESOLVED_THEME
  );

  useIsomorphicLayoutEffect(() => {
    const storedTheme = readStoredTheme(storageKey);
    const nextTheme = storedTheme ?? defaultTheme;
    const mediaQuery = window.matchMedia(THEME_QUERY);

    activeThemeRef.current = nextTheme;
    setThemeState(nextTheme);
    setResolvedTheme(applyTheme(nextTheme));

    const handleSystemThemeChange = () => {
      if (activeThemeRef.current === "system") {
        setResolvedTheme(applyTheme("system"));
      }
    };

    mediaQuery.addEventListener("change", handleSystemThemeChange);

    return () => {
      mediaQuery.removeEventListener("change", handleSystemThemeChange);
    };
  }, [defaultTheme, storageKey]);

  const setTheme = useCallback(
    (nextTheme: Theme) => {
      writeStoredTheme(storageKey, nextTheme);
      activeThemeRef.current = nextTheme;
      setThemeState(nextTheme);
      setResolvedTheme(applyTheme(nextTheme));
    },
    [storageKey]
  );

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
    }),
    [theme, resolvedTheme, setTheme]
  );

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export function ThemeInitScript({
  defaultTheme = DEFAULT_THEME,
  storageKey = DEFAULT_STORAGE_KEY,
}: {
  defaultTheme?: Theme;
  storageKey?: string;
}) {
  const script = `!function(){try{var e=${JSON.stringify(
    storageKey
  )},t=${JSON.stringify(
    defaultTheme
  )},r=localStorage.getItem(e)||t;if("light"!==r&&"dark"!==r&&"system"!==r)r=t;var o="system"===r?window.matchMedia("${THEME_QUERY}").matches?"dark":"light":r,d=document.documentElement;d.classList.remove("light","dark"),d.classList.add(o),d.style.colorScheme=o}catch(e){}}();`;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

export function useTheme() {
  const context = useContext(ThemeProviderContext);

  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }

  return context;
}

function applyTheme(theme: Theme) {
  const resolvedTheme = resolveTheme(theme);
  const root = window.document.documentElement;

  root.classList.remove("light", "dark");
  root.classList.add(resolvedTheme);
  root.style.colorScheme = resolvedTheme;

  return resolvedTheme;
}

function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme !== "system") {
    return theme;
  }

  return window.matchMedia(THEME_QUERY).matches ? "dark" : "light";
}

function readStoredTheme(storageKey: string) {
  try {
    const storedTheme = window.localStorage.getItem(storageKey);
    return isTheme(storedTheme) ? storedTheme : null;
  } catch {
    return null;
  }
}

function writeStoredTheme(storageKey: string, theme: Theme) {
  try {
    window.localStorage.setItem(storageKey, theme);
  } catch {
    // Theme selection still applies for this session if storage is unavailable.
  }
}

function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}
