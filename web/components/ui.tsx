import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/** The 10px uppercase marker that opens every section and labels every state. */
export function Pill({
  children,
  tone = "muted",
  className = "",
}: {
  children: ReactNode;
  tone?: "muted" | "white" | "ghost";
  className?: string;
}) {
  const tones = {
    muted: "text-muted border-hairline",
    white: "text-white border-white/40",
    ghost: "text-ghost border-hairline",
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-full border bg-white/[0.03] px-3 py-1 text-[10px] uppercase tracking-[0.22em] backdrop-blur-[6px] ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function SectionHeading({
  pill,
  title,
  align = "left",
  className = "",
}: {
  pill: string;
  title: ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div className={`${align === "center" ? "text-center" : ""} ${className}`}>
      <Pill>{pill}</Pill>
      <h2 className="mt-6 text-3xl leading-[1.15] font-light tracking-tight text-white sm:text-4xl md:text-[2.75rem]">
        {title}
      </h2>
    </div>
  );
}

export function Card({
  children,
  className = "",
  flat = false,
}: {
  children: ReactNode;
  className?: string;
  flat?: boolean;
}) {
  return (
    <div
      className={`rounded-[14px] ${flat ? "glass-inset" : "glass"} ${className}`}
    >
      {children}
    </div>
  );
}

type ButtonTone = "primary" | "ghost";

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm tracking-tight transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40";

const buttonTones: Record<ButtonTone, string> = {
  primary: "bg-white text-black hover:bg-white/85",
  ghost: "glass text-white hover:border-white/40 hover:bg-white/10",
};

export function PillButton({
  tone = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { tone?: ButtonTone }) {
  return <button className={`${buttonBase} ${buttonTones[tone]} ${className}`} {...props} />;
}

export function PillLink({
  href,
  tone = "primary",
  className = "",
  children,
  external = false,
}: {
  href: string;
  tone?: ButtonTone;
  className?: string;
  children: ReactNode;
  external?: boolean;
}) {
  const classes = `${buttonBase} ${buttonTones[tone]} ${className}`;
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer noopener" className={classes}>
        {children}
      </a>
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (
    <Link href={href as any} className={classes}>
      {children}
    </Link>
  );
}

/** Monospace hex, the house style for anything the chain actually stores. */
export function Mono({
  children,
  tone = "white",
  className = "",
  title,
}: {
  children: ReactNode;
  tone?: "white" | "muted" | "ghost";
  className?: string;
  title?: string;
}) {
  const tones = { white: "text-white", muted: "text-muted", ghost: "text-ghost" } as const;
  return (
    <span className={`font-mono text-[13px] ${tones[tone]} ${className}`} title={title}>
      {children}
    </span>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.22em] text-muted">{label}</span>
      <div className="mt-2">{children}</div>
      {hint ? <span className="mt-2 block text-xs text-ghost">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded-[10px] glass-inset px-4 py-3 font-mono text-sm text-white outline-none transition-colors focus:border-white/40 placeholder:text-ghost";

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="glass rounded-[14px] px-6 py-12 text-center text-sm text-muted">{children}</div>
  );
}

export function Banner({
  tone = "muted",
  children,
}: {
  tone?: "muted" | "warn";
  children: ReactNode;
}) {
  return (
    <div
      className={`glass rounded-[14px] px-5 py-4 text-sm ${
        tone === "warn" ? "border-white/25 text-white" : "text-muted"
      }`}
    >
      {children}
    </div>
  );
}
