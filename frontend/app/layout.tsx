import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "NDVI monitoring",
  description: "Sentinel-2 NDVI monitoring for farm fields",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz">
      <body>{children}</body>
    </html>
  );
}
