"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "./WalletProvider";
import { PillLink } from "./ui";
import { shortAddress } from "@/lib/format";

const anchors = [
  { href: "/#problem", label: "Problem" },
  { href: "/#solution", label: "Solution" },
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/#why-zerk", label: "Why Zerk" },
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
    <header className="sticky top-0 z-50 border-b border-hairline bg-ink/85 backdrop-blur-[5px]">
      <nav className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-6">
        <Link
          href="/"
          className="text-[15px] font-light tracking-[0.28em] text-white transition-opacity hover:opacity-70"
        >
          ZERK
        </Link>

        <div className="hidden flex-1 items-center justify-center gap-8 lg:flex">
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
          {onLanding ? (
            <>
              <Link href="/docs" className="hidden text-[13px] text-muted hover:text-white sm:block">
                Docs
              </Link>
              <Link
                href="/public"
                className="hidden text-[13px] text-muted hover:text-white sm:block"
              >
                Public
              </Link>
            </>
          ) : null}

          {address ? (
            <span
              className="hidden items-center gap-2 rounded-full hairline px-3 py-1.5 font-mono text-[11px] text-muted sm:inline-flex"
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
