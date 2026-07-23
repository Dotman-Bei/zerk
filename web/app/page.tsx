import { Card, Mono, Pill, PillLink, SectionHeading } from "@/components/ui";

const problems = [
  {
    kicker: "Pre-trade intent",
    headline: "The market front-runs you.",
    body: "Order terms are visible in the mempool before they fill. When you trade size, the market moves against your limit price before execution.",
  },
  {
    kicker: "Post-trade attribution",
    headline: "Competitors map your limits.",
    body: "Counterparty pairs are legible on-chain forever. Once you settle, any observer can reverse-engineer your execution strategy.",
  },
  {
    kicker: "Flow patterns",
    headline: "Your positioning is signal.",
    body: "Consistent buying or selling from a known entity becomes public signal. Your liquidity needs become ammunition for the broader market.",
  },
];

const hidden = [
  { key: "limit_price", value: "0x7f3a…c21e" },
  { key: "order_size", value: "0x4b21…99ad" },
  { key: "uncrossed_liquidity", value: "0x11a3…44f2" },
  { key: "cancelled_state", value: "0x9c44…1b8a" },
  { key: "side_intent", value: "0x3d41…77c9" },
];

const revealed = [
  { key: "Size", value: "5,000,000 tT-BILL" },
  { key: "Price", value: "0.9998 USDC" },
  { key: "Tx", value: "0x8f2a…91b4" },
  { key: "Time", value: "12:04:08:12 UTC" },
];

const steps = [
  {
    n: "01",
    title: "Encrypt",
    body: "Order terms are encrypted client-side into completely opaque 32-byte hex handles.",
  },
  {
    n: "02",
    title: "Submit",
    body: "The public blockchain stores handles, never values. The mempool sees only noise.",
  },
  {
    n: "03",
    title: "Match",
    body: "A Trusted Execution Environment blindly decides whether crossed orders overlap.",
  },
  {
    n: "04",
    title: "Settle",
    body: "Matched pairs settle atomically through an unmodified Seaport contract.",
  },
];

const differentiators = [
  {
    n: "1",
    title: "Perfect Price Secrecy",
    body: "Your limit price is never revealed to the public or the matching engine, even on a fully executed order.",
  },
  {
    n: "2",
    title: "Blind Matching",
    body: "The matcher runs inside a secure enclave. It pairs compatible orders mathematically without ever seeing the underlying values.",
  },
  {
    n: "3",
    title: "Standard Infrastructure",
    body: "Settles natively on Seaport. No proprietary rails, no fragmented liquidity, no forked settlement protocols.",
  },
  {
    n: "4",
    title: "Selective Disclosure",
    body: "Absolute privacy from the market, with auditor-grade viewing keys. Unmask specific trades for regulators without compromising your edge.",
  },
];

export default function LandingPage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden">
        {/* Film-strip texture. The source photo is mostly white, so it is inverted to a dark
            field, desaturated, dimmed and slowly drifted — it must read as texture behind the
            headline, never as a picture competing with it. Tune `opacity-30` to taste. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-20 overflow-hidden">
          <div className="hero-film-drift absolute inset-0 bg-[url('/hero-film.jpg')] bg-cover bg-center opacity-60 grayscale invert" />
        </div>
        {/* Scrim + centre vignette keep weight-300 white text legible over every frame of the
            drift. Adjust the `from-ink/*` stop if the texture ever crowds the copy. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-ink/75 via-ink/45 to-ink"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(55%_45%_at_50%_42%,rgba(10,10,10,0.85),transparent_70%)]"
        />
        <div className="mx-auto max-w-6xl px-6 py-32 text-center sm:py-40">
          <Pill>( Confidential Crossing )</Pill>

          <h1 className="mx-auto mt-10 max-w-[16ch] text-5xl leading-[1.05] font-light tracking-tight text-white sm:text-6xl md:text-7xl">
            Your size moves markets.
            <br />
            Your intent shouldn&apos;t.
          </h1>

          <p className="mx-auto mt-8 max-w-[52ch] text-base leading-relaxed text-muted sm:text-lg">
            A dark pool for tokenized real-world assets on Ethereum Sepolia. Match large orders
            inside a Trusted Execution Environment. Absolute cryptographic privacy until the
            exact moment of settlement.
          </p>

          <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
            <PillLink href="/desk">Open Desk</PillLink>
            <PillLink href="/public" tone="ghost">
              See what the chain exposes
            </PillLink>
          </div>
        </div>
      </section>

      {/* ── Problem ──────────────────────────────────────────────────────── */}
      <section id="problem" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-24">
        <SectionHeading pill="The Leak" title="Public chains expose your book." />

        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {problems.map((item) => (
            <Card key={item.kicker} className="p-7">
              <span className="text-[10px] uppercase tracking-[0.22em] text-muted">
                {item.kicker}
              </span>
              <h3 className="mt-5 text-lg leading-snug font-normal text-white">{item.headline}</h3>
              <p className="mt-4 text-[13px] leading-relaxed text-muted">{item.body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* ── Solution ─────────────────────────────────────────────────────── */}
      <section id="solution" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-24">
        <SectionHeading
          pill="The Boundary"
          title="Zero-knowledge matching. Atomic settlement."
        />

        <div className="mt-14 grid items-start gap-6 lg:grid-cols-2">
          {/* Left: what stays hidden. Rendered as texture, not information. */}
          <div className="glass-inset rounded-[14px] p-7">
            <span className="text-[10px] uppercase tracking-[0.22em] text-muted">
              Never revealed
            </span>
            <ul className="mt-7 space-y-4">
              {hidden.map((row) => (
                <li key={row.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <Mono tone="ghost">{row.key}:</Mono>
                  <Mono tone="ghost">{row.value}</Mono>
                </li>
              ))}
            </ul>
            <p className="mt-8 max-w-[44ch] text-[13px] leading-relaxed text-ghost">
              Not redacted for this page — these values do not exist in plaintext anywhere on
              chain, and never will.
            </p>
          </div>

          {/* Right: what settlement publishes. Rendered at full contrast. */}
          <div className="glass rounded-[14px] border-white/45 p-7">
            <span className="text-[10px] uppercase tracking-[0.22em] text-white">
              Revealed at settlement
            </span>

            <p className="mt-7 text-[10px] uppercase tracking-[0.22em] text-white">Settled fill</p>

            <dl className="mt-5 space-y-4">
              {revealed.map((row) => (
                <div
                  key={row.key}
                  className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-hairline pb-4 last:border-0 last:pb-0"
                >
                  <dt className="text-[10px] uppercase tracking-[0.22em] text-muted">{row.key}</dt>
                  <dd>
                    <Mono>{row.value}</Mono>
                  </dd>
                </div>
              ))}
            </dl>

            <p className="mt-8 max-w-[44ch] text-[13px] leading-relaxed text-muted">
              The same disclosure regime as a regulated crossing network: pre-trade opaque,
              post-trade transparent. Zerk hides intent, not outcome.
            </p>
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-24">
        <SectionHeading pill="Architecture" title="From intent to settlement." />

        <div className="relative mt-16">
          {/* The dashed rail runs through the step numbers on wide viewports only. */}
          <div
            aria-hidden
            className="step-rail absolute top-[9px] right-0 left-0 hidden h-px lg:block"
          />
          <ol className="grid gap-10 lg:grid-cols-4 lg:gap-6">
            {steps.map((step) => (
              <li key={step.n} className="relative">
                <div className="flex items-center gap-3 lg:block">
                  <span className="inline-block bg-ink pr-3 font-mono text-[13px] text-muted">
                    ( {step.n} )
                  </span>
                </div>
                <h3 className="mt-5 text-[10px] uppercase tracking-[0.22em] text-white">
                  {step.title}
                </h3>
                <p className="mt-4 max-w-[34ch] text-[13px] leading-relaxed text-muted">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Why Zerk ─────────────────────────────────────────────────────── */}
      <section id="why-zerk" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-24">
        <SectionHeading pill="Differentiators" title="Built for trading desks." />

        <div className="mt-14 grid gap-4 md:grid-cols-2">
          {differentiators.map((item) => (
            <Card key={item.n} className="p-8">
              <div className="flex items-baseline gap-4">
                <Mono tone="muted">{item.n}.</Mono>
                <h3 className="text-lg font-normal text-white">{item.title}</h3>
              </div>
              <p className="mt-4 max-w-[52ch] pl-9 text-[13px] leading-relaxed text-muted">
                {item.body}
              </p>
            </Card>
          ))}
        </div>

        <div className="glass mt-16 flex flex-wrap items-center justify-between gap-6 rounded-[14px] px-8 py-8">
          <div>
            <h3 className="text-xl font-light text-white">Trade size without telling anyone.</h3>
            <p className="mt-2 text-[13px] text-muted">
              Two desks, one encrypted book, settlement on infrastructure you already trust.
            </p>
          </div>
          <PillLink href="/desk">Open Desk</PillLink>
        </div>
      </section>
    </>
  );
}
