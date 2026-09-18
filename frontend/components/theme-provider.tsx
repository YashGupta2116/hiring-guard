"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

type ThemeProviderProps = React.ComponentProps<typeof NextThemesProvider>;

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  // next-themes injects an inline <script> to avoid a flash of the wrong
  // theme before hydration. That script runs correctly during SSR, but
  // React 19 warns whenever it re-encounters that same <script> element
  // during client rendering. This is a known upstream issue
  // (pacocoursey/next-themes #385, #387) with no fix released yet.
  // The warning is a false positive for this specific case, so it is
  // filtered here rather than left to spam the dev console on every page.
  React.useEffect(() => {
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      if (
        typeof args[0] === "string" &&
        args[0].includes("Encountered a script tag while rendering React component")
      ) {
        return;
      }
      originalError(...args);
    };

    return () => {
      console.error = originalError;
    };
  }, []);

  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}