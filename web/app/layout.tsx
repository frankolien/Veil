import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Veil · Confidential MEV-resistant DEX",
  description:
    "Sealed-bid uniform-price batch auction with encrypted orders, depth, and fills. Built on the Zama Protocol.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full relative overflow-x-hidden bg-[var(--bg)] text-[var(--text)]">
        <div className="veil-bg">
          <div className="veil-bg-grid" />
          <div className="veil-bg-mesh" />
          <div className="veil-bg-grain" />
        </div>
        <div className="relative z-[2]">
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}
