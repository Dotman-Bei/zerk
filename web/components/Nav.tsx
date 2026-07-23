"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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
  const [menuOpen, setMenuOpen] = useState(false);

  const appLinks = [
    { href: "/desk", label: "Desk" },
    { href: "/public", label: "Public" },
    { href: "/auditor", label: "Auditor" },
    { href: "/docs", label: "Docs" },
  ];

  const links = onLanding ? anchors : appLinks;

  // A route change must not leave the panel hanging open over the page it navigated to.
  useEffect(() => setMenuOpen(false), [pathname]);

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
          {links.map((item) => (
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

        <div className="ml-auto flex items-center gap-3 sm:gap-5 lg:ml-0">
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
            <span className="rounded-full bg-white px-4 py-2 text-[13px] whitespace-nowrap text-ink transition-colors group-hover:bg-white/85 sm:px-5">
              Open Desk
            </span>
            {/* The disc is decoration; it yields first when width is scarce. */}
            <span
              aria-hidden
              className="hidden h-9 w-9 items-center justify-center rounded-full bg-white text-ink transition-colors group-hover:bg-white/85 sm:flex"
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

          {/* Below lg the centre rail is hidden, so without this there is no route to Public,
              Auditor or Docs at all on a phone. */}
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="nav-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="flex h-9 w-9 items-center justify-center rounded-full hairline text-white transition-colors hover:border-white/40 lg:hidden"
          >
            <svg
              viewBox="0 0 16 16"
              aria-hidden
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              {menuOpen ? (
                <>
                  <path d="M4 4 12 12" />
                  <path d="M12 4 4 12" />
                </>
              ) : (
                <>
                  <path d="M2.5 5.5h11" />
                  <path d="M2.5 10.5h11" />
                </>
              )}
            </svg>
          </button>
        </div>
      </nav>

      {menuOpen ? (
        <div id="nav-menu" className="border-t border-hairline bg-ink lg:hidden">
          <div className="mx-auto max-w-6xl px-6 py-4">
            {links.map((item) => (
              <Link
                key={item.href}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                href={item.href as any}
                className={`block rounded-[10px] px-3 py-3 text-[14px] transition-colors hover:bg-white/5 hover:text-white ${
                  pathname === item.href ? "text-white" : "text-muted"
                }`}
              >
                {item.label}
              </Link>
            ))}

            {/* The top-bar wallet control only appears from sm up, so narrow screens would
                otherwise have no way to connect. */}
            <div className="mt-2 border-t border-hairline pt-3 sm:hidden">
              {address ? (
                <span
                  className="flex items-center gap-2 px-3 py-2 font-mono text-[12px] text-muted"
                  title={address}
                >
                  <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-white" />
                  {label ?? shortAddress(address)}
                </span>
              ) : hasProvider ? (
                <button
                  onClick={connect}
                  disabled={connecting}
                  className="block w-full rounded-[10px] px-3 py-3 text-left text-[14px] text-muted transition-colors hover:bg-white/5 hover:text-white disabled:opacity-40"
                >
                  {connecting ? "Connecting…" : "Connect wallet"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
