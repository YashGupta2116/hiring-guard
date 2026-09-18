import type { Metadata } from "next";
import { Inter, Fraunces, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/lib/auth/auth-context";
import { StoreProvider } from "@/lib/store/interview-store";
import { ToastProvider } from "@/components/ui/toast";
import { HydrationCleanup } from "@/components/hydration-cleanup";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-serif" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "VeriTrust — Interview Integrity Platform",
  description:
    "A warm paper report on a desk, not a security console. Multimodal behavioral intelligence for trustworthy technical interviews.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${inter.variable} ${fraunces.variable} ${jetbrainsMono.variable} font-sans min-h-screen bg-background text-foreground antialiased`}
      >
        <HydrationCleanup />
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
            <StoreProvider>
              <ToastProvider>{children}</ToastProvider>
            </StoreProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
