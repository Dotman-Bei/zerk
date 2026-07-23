import type { Metadata } from "next";
import { Card, Mono, Pill, PillLink, SectionHeading } from "@/components/ui";
import { addresses, explorerAddress, REPO_URL } from "@/lib/config";

export const metadata: Metadata = {
  title: "Docs",
  description: "How Zerk works: the privacy boundary, the Nox lifecycle, the Seaport zone.",
};

const boundary = [
  { field: "Limit prices", hidden: true },
  { field: "Orders that never cross", hidden: true },
  { field: "Resting size before a fill", hidden: true },
  { field: "Which desk is shopping", hidden: true },
  { field: "The matching process itself", hidden: true },
  { field: "Executed fill size", hidden: false },
  { field: "Executed fill price", hidden: false },
  { field: "The settlement transfer", hidden: false },
];

const lifecycle = [
  {
    actor: "Desk A",
    action: "Encrypts buy 500k @ 99.20 in the browser",
    chain: "nothing — no transaction yet",
  },
  {
    actor: "Desk A",
    action: "submitOrder(handles, proofs)",
    chain: "OrderSubmitted(1, deskA) — three opaque handles",
  },
  {
    actor: "Desk B",
    action: "Encrypts sell 400k @ 99.10, submits",
    chain: "OrderSubmitted(2, deskB)",
  },
  { actor: "Matcher", action: "proposeMatch(1, 2) — blind", chain: "MatchProposed(matchId)" },
  { actor: "Nox", action: "Ingestor → Runner → TEE evaluates the cross", chain: "nothing readable" },
  {
    actor: "Matcher",
    action: "finalizeMatch(matchId, proofs)",
    chain: "MatchApproved(matchId, 400000, 99.15)",
  },
  {
    actor: "Desk B",
    action: "Signs a FULL_RESTRICTED Seaport order, zoneHash = matchId",
    chain: "nothing — signed off-chain",
  },
  {
    actor: "Desk A",
    action: "fulfillAdvancedOrder on Seaport 1.6",
    chain: "authorizeOrder → transfers → validateOrder",
  },
];

const faq = [
  {
    q: "Settlement is public. What is actually private?",
    a: "Limits, unfilled orders and resting sizes — permanently. Executed fills are reported, exactly as a regulated dark pool does. Zerk hides intent, not outcome. Even on a filled order, a desk's limit price is never published; only the executed price is.",
  },
  {
    q: "Is the matcher a trusted party?",
    a: "No. It pairs order ids blind. It holds no viewer grant on any handle, so it cannot read a side, a size or a limit, and the enclave decides whether a pair crosses. Anyone can run one; running a second changes only how fast pairs get tried.",
  },
  {
    q: "Why Seaport instead of your own escrow?",
    a: "Because a hackathon settlement contract will never be audited the way Seaport has been, and because building a new rail is exactly what the venue does not need. Zerk uses Seaport's official zone extension point at its canonical address. Zero forks.",
  },
  {
    q: "Isn't this a batch auction like CoW?",
    a: "CoW batches publicly for MEV protection and price improvement. Zerk's orders are never published at all, and it targets permissioned assets that cannot touch an AMM in the first place.",
  },
  {
    q: "Your anonymity set is two desks.",
    a: "True in a demo, and worth saying plainly. The claim is pre-trade non-display, which holds at n=2. Position-level anonymity needs volume — that is a liquidity problem, not a protocol one.",
  },
  {
    q: "Why are settlement amounts visible at all?",
    a: "Because both legs settle as standard ERC-20s. Nox ships a documented ERC-20 → ERC-7984 wrapper; wrapping both legs as confidential tokens would hide amounts too. That is the next milestone, not part of this build.",
  },
];

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <SectionHeading pill="Documentation" title="How Zerk works." />

      <p className="mt-6 text-[13px] leading-relaxed text-muted">
        Zerk is a confidential crossing network for tokenized real-world assets. Desks submit
        encrypted orders, matching runs inside a TEE, and crossed trades settle atomically through
        unmodified Seaport on Ethereum Sepolia.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <PillLink href={REPO_URL} tone="ghost" external>
          Source on GitHub
        </PillLink>
        <PillLink href="/public" tone="ghost">
          Live chain state
        </PillLink>
      </div>

      {/* ── Privacy boundary ─────────────────────────────────────────────── */}
      <section id="boundary" className="mt-20 scroll-mt-24">
        <Pill>The Boundary</Pill>
        <h2 className="mt-5 text-2xl font-light text-white">What is hidden, and what is not.</h2>
        <p className="mt-4 text-[13px] leading-relaxed text-muted">
          This table is the honest version of the privacy claim. Regulated dark pools are
          pre-trade opaque and post-trade transparent by design; Zerk reproduces that regime
          rather than claiming more than it delivers.
        </p>

        <Card className="mt-7 scroll-x">
          <table className="w-full min-w-[520px] border-collapse text-left">
            <thead>
              <tr className="border-b border-hairline">
                <th className="px-5 py-4 text-[10px] font-normal uppercase tracking-[0.22em] text-muted">
                  Field
                </th>
                <th className="px-5 py-4 text-[10px] font-normal uppercase tracking-[0.22em] text-muted">
                  Confidential forever
                </th>
                <th className="px-5 py-4 text-[10px] font-normal uppercase tracking-[0.22em] text-white">
                  Revealed at settlement
                </th>
              </tr>
            </thead>
            <tbody>
              {boundary.map((row) => (
                <tr key={row.field} className="border-b border-hairline last:border-0">
                  <td className="px-5 py-3.5 text-[13px] text-muted">{row.field}</td>
                  <td className="px-5 py-3.5">
                    {row.hidden ? <Mono>✓</Mono> : <Mono tone="ghost">—</Mono>}
                  </td>
                  <td className="px-5 py-3.5">
                    {row.hidden ? <Mono tone="ghost">never</Mono> : <Mono>✓</Mono>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      {/* ── Lifecycle ────────────────────────────────────────────────────── */}
      <section id="lifecycle" className="mt-20 scroll-mt-24">
        <Pill>Lifecycle</Pill>
        <h2 className="mt-5 text-2xl font-light text-white">From intent to settlement.</h2>
        <p className="mt-4 text-[13px] leading-relaxed text-muted">
          Nox compute is asynchronous, so the order lifecycle is deliberately three transactions:
          submit, propose, finalize. There is real latency between a proposal and its result —
          that is the enclave working, not the UI hanging.
        </p>

        <Card className="mt-7 scroll-x">
          <table className="w-full min-w-[680px] border-collapse text-left">
            <thead>
              <tr className="border-b border-hairline">
                {["#", "Actor", "Action", "What the chain sees"].map((h) => (
                  <th
                    key={h}
                    className="px-5 py-4 text-[10px] font-normal uppercase tracking-[0.22em] text-muted"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lifecycle.map((row, index) => (
                <tr key={row.action} className="border-b border-hairline last:border-0">
                  <td className="px-5 py-3.5">
                    <Mono tone="ghost">{String(index + 1).padStart(2, "0")}</Mono>
                  </td>
                  <td className="px-5 py-3.5 text-[13px] text-white">{row.actor}</td>
                  <td className="px-5 py-3.5 text-[13px] text-muted">{row.action}</td>
                  <td className="px-5 py-3.5 font-mono text-[12px] text-ghost">{row.chain}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <p className="mt-5 text-[13px] leading-relaxed text-muted">
          Steps 1–6 reveal nothing except that some order existed and some match crossed at a size
          and a price. Had the pair failed to cross, nothing at all would have been revealed — the
          orders would simply still be resting.
        </p>
      </section>

      {/* ── Seaport integration ──────────────────────────────────────────── */}
      <section id="seaport" className="mt-20 scroll-mt-24">
        <Pill>Integration</Pill>
        <h2 className="mt-5 text-2xl font-light text-white">
          One field does the whole binding.
        </h2>
        <p className="mt-4 text-[13px] leading-relaxed text-muted">
          Seaport supports restricted orders. When one is fulfilled, Seaport calls the order&rsquo;s
          designated zone twice — <Mono tone="white">authorizeOrder</Mono> before any token
          transfers and <Mono tone="white">validateOrder</Mono> after them. Reverting in either
          aborts the entire fulfilment.
        </p>
        <p className="mt-4 text-[13px] leading-relaxed text-muted">
          <Mono tone="white">zoneHash</Mono> is an arbitrary 32 bytes baked into the order at
          signing and handed to the zone at fulfilment. Zerk puts the match id there. The
          consequence: a Seaport order is unfillable unless ZerkBook approved that exact match, at
          that exact size and price. Nobody can front-run the settlement, replay it, or fulfil an
          order the enclave never authorised — and Seaport itself is untouched, running at its
          canonical address.
        </p>

        <Card className="mt-7 p-6">
          <dl className="space-y-3">
            {[
              { label: "Seaport 1.6", value: addresses.seaport },
              { label: "ZerkZone", value: addresses.zone },
              { label: "ZerkBook", value: addresses.book },
              { label: "NoxCompute", value: addresses.noxCompute },
            ]
              .filter((row) => Boolean(row.value))
              .map((row) => (
                <div
                  key={row.label}
                  className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1"
                >
                  <dt className="text-[10px] uppercase tracking-[0.22em] text-muted">
                    {row.label}
                  </dt>
                  <dd>
                    <a
                      href={explorerAddress(row.value!)}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="font-mono text-[12px] text-muted underline-offset-4 hover:text-white hover:underline"
                    >
                      {row.value}
                    </a>
                  </dd>
                </div>
              ))}
          </dl>
        </Card>
      </section>

      {/* ── Branchless matching ──────────────────────────────────────────── */}
      <section id="matching" className="mt-20 scroll-mt-24">
        <Pill>Matching</Pill>
        <h2 className="mt-5 text-2xl font-light text-white">Why a rejection tells you nothing.</h2>
        <p className="mt-4 text-[13px] leading-relaxed text-muted">
          Solidity cannot branch on an encrypted value, and Nox exposes no encrypted boolean AND.
          The crossing predicate is therefore folded into a 0/1 selector and multiplied through,
          so every proposal executes the identical sequence of operations regardless of outcome:
        </p>

        <Card className="mt-7 scroll-x p-6">
          <pre className="font-mono text-[12px] leading-relaxed text-muted">
{`flag      = select(bid.limit >= ask.limit, 1, 0)
flag      = select(bid.side == BID, flag, 0)
flag      = select(ask.side == ASK, flag, 0)

minSize   = select(bid.size <= ask.size, bid.size, ask.size)
fillSize  = flag * minSize
fillPrice = flag * midpoint(bid.limit, ask.limit)`}
          </pre>
        </Card>

        <p className="mt-5 text-[13px] leading-relaxed text-muted">
          A non-crossing pair produces a fill of zero rather than a revert, and the failure
          discloses nothing about which of the three conditions failed. Only three handles are
          ever opened to public decryption — <Mono tone="white">crossed</Mono>,{" "}
          <Mono tone="white">fillSize</Mono> and <Mono tone="white">fillPrice</Mono>. The limits
          are not among them.
        </p>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section id="faq" className="mt-20 scroll-mt-24">
        <Pill>Questions</Pill>
        <h2 className="mt-5 text-2xl font-light text-white">The obvious objections.</h2>

        <div className="mt-8 space-y-4">
          {faq.map((item) => (
            <Card key={item.q} className="p-6">
              <h3 className="text-[15px] font-normal text-white">{item.q}</h3>
              <p className="mt-3 text-[13px] leading-relaxed text-muted">{item.a}</p>
            </Card>
          ))}
        </div>
      </section>

      <section id="terms" className="mt-20 scroll-mt-24">
        <Pill tone="ghost">Legal</Pill>
        <h2 className="mt-5 text-2xl font-light text-white">Terms &amp; privacy</h2>
        <p id="privacy" className="mt-4 scroll-mt-24 text-[13px] leading-relaxed text-muted">
          Zerk is unaudited research software deployed on a public testnet. It handles no real
          funds, makes no warranty of any kind, and is not an offer to trade securities. Order
          terms are encrypted in your browser and never transmitted to a Zerk-operated server —
          there is no Zerk-operated server. On-chain activity is public by construction; see the{" "}
          <a href="#boundary" className="text-white underline-offset-4 hover:underline">
            privacy boundary
          </a>{" "}
          for exactly what that means.
        </p>
      </section>
    </div>
  );
}
