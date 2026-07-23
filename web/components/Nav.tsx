"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "./WalletProvider";
import { PillLink } from "./ui";
import { shortAddress } from "@/lib/format";

const anchors = [
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/docs", label: "Documentation" },
];

export function Nav() {
  const pathname = usePathname();
  const onLanding = pathname === "/";
  const { address, label, connect, connecting, hasProvider } = useWallet();

  const appLinks = [
    { href: "/desk", label: "Desk" },
    { href: "/public", label: "Public" },
    { href: "/auditor", label: "Auditor" },
    { href: "/docs", label: "Docs" },
  ];

  return (
    <header className="glass-nav sticky top-0 z-50">
      <nav className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-6">
        <Link
          href="/"
          className="text-[15px] font-light tracking-[0.28em] text-white transition-opacity hover:opacity-70"
        >
          ZERK
        </Link>

        {/* Landing carries only two links, so they get room to breathe; the app screens
            keep the tighter rhythm because they carry four. */}
        <div
          className={`hidden flex-1 items-center justify-center lg:flex ${
            onLanding ? "gap-20" : "gap-8"
          }`}
        >
          {(onLanding ? anchors : appLinks).map((item) => (
            <Link
              key={item.href}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              href={item.href as any}
              className={`text-[13px] transition-colors hover:text-white ${
                pathname === item.href ? "text-white" : "text-muted"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-5 lg:ml-0">
          {address ? (
            <span
              className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 font-mono text-[11px] text-muted backdrop-blur-[8px] sm:inline-flex"
              title={address}
            >
              <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-white" />
              {label ?? shortAddress(address)}
            </span>
          ) : hasProvider && !onLanding ? (
            <button
              onClick={connect}
              disabled={connecting}
              className="hidden text-[13px] text-muted transition-colors hover:text-white disabled:opacity-40 sm:block"
            >
              {connecting ? "Connecting…" : "Connect"}
            </button>
          ) : null}

          <PillLink href="/desk" className="px-5 py-2 text-[13px]">
            Open Desk
          </PillLink>
        </div>
      </nav>
    </header>
  );
}
