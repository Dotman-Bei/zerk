import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { WalletProvider } from "@/components/WalletProvider";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["300", "400", "500"],
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-jb",
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://zerk.network"),
  title: {
    default: "Zerk — Institutional execution. Without the leak.",
    template: "%s · Zerk",
  },
  description:
    "A dark pool for tokenized real-world assets on Ethereum Sepolia. Orders match inside a Trusted Execution Environment and settle atomically through unmodified Seaport.",
  openGraph: {
    title: "Zerk — Institutional execution. Without the leak.",
    description:
      "Confidential crossing network for tokenized RWAs. Encrypted orders, TEE matching, unmodified Seaport settlement.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-screen overflow-x-hidden antialiased">
        <WalletProvider>
          <Nav />
          <main>{children}</main>
          <Footer />
        </WalletProvider>
      </body>
    </html>
  );
}
