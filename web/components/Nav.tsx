"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "./WalletProvider";
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

  // Solid, not translucent: the nav sits over scrolling content and must stay a fixed
  // reference edge rather than taking on whatever passes beneath it.
  return (
    <header className="sticky top-0 z-50 border-b border-hairline bg-ink">
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

          {/* Pill and arrow disc are one link, not two, so assistive tech announces a single
              destination rather than the same route twice. */}
          <Link href="/desk" className="group inline-flex items-center gap-2">
            <span className="rounded-full bg-white px-5 py-2 text-[13px] text-ink transition-colors group-hover:bg-white/85">
              Open Desk
            </span>
            <span
              aria-hidden
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-ink transition-colors group-hover:bg-white/85"
            >
              <svg
                viewBox="0 0 16 16"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4.75 11.25 11.25 4.75" />
                <path d="M6 4.75h5.25V10" />
              </svg>
            </span>
          </Link>
        </div>
      </nav>
    </header>
  );
}
