import * as React from "react";

import { useStore } from "@/store/store-context";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

/**
 * Theme is a persisted UI preference stored in the database `settings` table
 * (no localStorage). It reads from and writes through the store, so a signed-in
 * user's choice follows them across devices. Until the settings row loads we
 * follow the OS colour-scheme preference to minimise any first-paint flash.
 */
function osTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { settings, updateSettings, ready } = useStore();

  // Effective theme: the DB value once ready, otherwise the OS preference.
  const theme: Theme = ready ? settings.theme : osTheme();

  // Reflect the effective theme on <html> whenever it changes.
  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
  }, [theme]);

  const setTheme = React.useCallback(
    (t: Theme) => {
      if (t !== settings.theme) updateSettings({ theme: t });
    },
    [settings.theme, updateSettings],
  );

  const value = React.useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      toggleTheme: () => setTheme(theme === "dark" ? "light" : "dark"),
    }),
    [theme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}
