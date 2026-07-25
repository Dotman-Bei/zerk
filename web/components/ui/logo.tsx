import type { ReactNode } from "react";

/**
 * The Zerk mark: a crossing.
 *
 * Four order flows converge from the corners toward a single filled node — the matched, settled
 * fill, the one thing Zerk ever discloses. Each flow stops just short of the node; that gap is the
 * privacy boundary, the line intent never crosses in plaintext. Drawn in currentColor so it takes
 * the surrounding text colour, and legible down to a 16px favicon because the geometry is solid
 * strokes, not dashes.
 */
export function ZerkMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      role="img"
      aria-label="Zerk"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* the venue */}
      <rect
        x="2"
        y="2"
        width="28"
        height="28"
        rx="8"
        stroke="currentColor"
        strokeWidth="1.4"
        opacity="0.45"
      />
      {/* four converging flows */}
      <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M9 9L13 13" />
        <path d="M23 9L19 13" />
        <path d="M9 23L13 19" />
        <path d="M23 23L19 19" />
      </g>
      {/* the settled fill */}
      <circle cx="16" cy="16" r="2.4" fill="currentColor" />
    </svg>
  );
}

/**
 * Mark plus wordmark, in the house tracking. `markClass` sizes the glyph; the row inherits text
 * colour, so the whole lockup recolours with a single `text-*` on a parent.
 */
export function ZerkLogo({
  className = "",
  markClass = "h-6 w-6",
}: {
  className?: string;
  markClass?: string;
}): ReactNode {
  return (
    <span className={`inline-flex items-center gap-2.5 text-white ${className}`}>
      <ZerkMark className={markClass} />
      <span className="text-[15px] font-light tracking-[0.28em]">ZERK</span>
    </span>
  );
}
