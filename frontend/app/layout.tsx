import type { Metadata } from "next";
import { EB_Garamond, Inter, JetBrains_Mono } from "next/font/google";

import "./globals.css";

// latin-ext holds the Uzbek modifier letters ʻ and ʼ.
const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-sans" });
const garamond = EB_Garamond({ subsets: ["latin", "latin-ext"], weight: ["400", "500"], variable: "--font-serif" });
const mono = JetBrains_Mono({ subsets: ["latin", "latin-ext"], weight: ["400", "500"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "NDVI monitoring",
  description: "Sentinel-2 NDVI monitoring for farm fields",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz" className={`${inter.variable} ${garamond.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
