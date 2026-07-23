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
    title: "Developers",
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

export function Footer() {
  return (
    <footer className="border-t border-hairline">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <span className="text-[15px] font-light tracking-[0.28em] text-white">ZERK</span>
            <p className="mt-4 max-w-[24ch] text-[13px] leading-relaxed text-muted">
              A confidential crossing network for tokenized real-world assets.
            </p>
          </div>

          {columns.map((column) => (
            <div key={column.title}>
              <h3 className="text-[10px] uppercase tracking-[0.22em] text-white">{column.title}</h3>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {"external" in link && link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-[13px] text-muted transition-colors hover:text-white"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        href={link.href as any}
                        className="text-[13px] text-muted transition-colors hover:text-white"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-hairline pt-8 text-[12px] text-muted sm:flex-row sm:items-center sm:justify-between">
          <p className="flex flex-wrap items-center gap-1.5">
            <span>Built on:</span>
            {builtOn.map((item, index) => (
              <span key={item.label} className="flex items-center gap-1.5">
                <a
                  href={item.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-white transition-opacity hover:opacity-70"
                >
                  {item.label}
                </a>
                {index < builtOn.length - 1 ? <span className="text-ghost">·</span> : null}
              </span>
            ))}
          </p>
          <p>© {new Date().getFullYear()} Zerk Network.</p>
        </div>
      </div>
    </footer>
  );
}
