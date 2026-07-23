import Link from "next/link";
import { REPO_URL, explorerAddress, addresses } from "@/lib/config";

const columns = [
  {
    title: "Product",
    links: [
      { label: "Desk", href: "/desk" },
      { label: "Public Feed", href: "/public" },
      { label: "Auditor", href: "/auditor" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Docs", href: "/docs" },
      { label: "GitHub", href: REPO_URL, external: true },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms of Service", href: "/docs#terms" },
      { label: "Privacy Policy", href: "/docs#privacy" },
    ],
  },
];

const builtOn = [
  { label: "iExec Nox", href: "https://docs.noxprotocol.io" },
  { label: "Seaport", href: explorerAddress(addresses.seaport) },
  { label: "Ethereum Sepolia", href: "https://sepolia.etherscan.io" },
];

/** The small glyph that marks a link as leaving the site. */
function ExternalMark() {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden
      className="ml-1.5 inline-block h-2.5 w-2.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 2.5h2.5V5" />
      <path d="M9.5 2.5 5.75 6.25" />
      <path d="M8.5 7v2.5h-6v-6H5" />
    </svg>
  );
}

const linkClass =
  "inline-flex items-center text-[13px] text-muted transition-colors hover:text-white";

export function Footer() {
  return (
    <footer className="mx-auto max-w-6xl px-6 pt-10 pb-12">
      {/* The reference floats its footer as a panel rather than banding it across the viewport,
          so the page background stays continuous behind and beside it. */}
      <div className="glass rounded-[20px] p-7 sm:p-10 lg:p-14">
        <div className="grid gap-10 sm:grid-cols-2 sm:gap-12 lg:grid-cols-[1.7fr_1fr_1fr_1fr]">
          <div>
            <span className="text-[15px] font-light tracking-[0.28em] text-white">ZERK</span>
            <p className="mt-5 max-w-[38ch] text-[13px] leading-relaxed text-muted">
              A confidential crossing network for tokenized real-world assets. Encrypted orders,
              matching inside a TEE, settlement through unmodified Seaport.
            </p>
          </div>

          {columns.map((column) => (
            <div key={column.title}>
              <h3 className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
                {column.title}
              </h3>
              <ul className="mt-6 space-y-3.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {"external" in link && link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noreferrer noopener"
                        className={linkClass}
                      >
                        {link.label}
                        <ExternalMark />
                      </a>
                    ) : (
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      <Link href={link.href as any} className={linkClass}>
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Meta rail sits outside the panel, as in the reference — it belongs to the page, not the
          footer card. */}
      <div className="mt-8 flex flex-col gap-3 px-2 text-[10px] tracking-[0.22em] text-white uppercase sm:flex-row sm:items-center sm:justify-between">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>Built on</span>
          {builtOn.map((item, index) => (
            <span key={item.label} className="flex items-center gap-x-2">
              <a
                href={item.href}
                target="_blank"
                rel="noreferrer noopener"
                className="transition-opacity hover:opacity-70"
              >
                {item.label}
              </a>
              {index < builtOn.length - 1 ? <span aria-hidden>·</span> : null}
            </span>
          ))}
        </p>
        <p>© {new Date().getFullYear()} Zerk Network</p>
      </div>
    </footer>
  );
}
