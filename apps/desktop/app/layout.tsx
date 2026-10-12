import type { ReactNode } from "react";
import "@fontsource-variable/inter";
import "../src/renderer/globals.css";
export const metadata = {
  title: "Voidra Project",
  description: "Plan and track projects built with AI coding agents",
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />
      </head>
      <body>{children}</body>
    </html>
  );
}
