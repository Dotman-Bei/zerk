"use client";

import { useCallback, useEffect, useState } from "react";
import { toEventSelector, type AbiEvent, type Log } from "viem";
import { Banner, Card, Empty, Mono, Pill, SectionHeading } from "@/components/ui";
import {
  BASE_SYMBOL,
  QUOTE_SYMBOL,
  addresses,
  explorerAddress,
  explorerTx,
  isDeployed,
} from "@/lib/config";
import {
  fetchBookLogs,
  fetchMatches,
  fetchOrders,
  ZerkBookAbi,
  type MatchRow,
  type OrderRow,
} from "@/lib/book";
import {
  formatBase,
  formatQuote,
  formatTimestamp,
  shortAddress,
  shortHandle,
  statusLabel,
  statusTone,
} from "@/lib/format";

/**
 * topic0 → event name, derived from the compiled ABI so the raw feed is readable without
 * pretending it is anything other than raw. Labelling a topic reveals nothing: the names are
 * already public in the verified source.
 */
const EVENT_NAMES: Record<string, string> = Object.fromEntries(
  (ZerkBookAbi as readonly unknown[])
    .filter((item): item is AbiEvent => (item as AbiEvent).type === "event")
    .map((event) => [toEventSelector(event), event.name])
);

export default function PublicPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isDeployed) return;
    try {
      const [o, m, l] = await Promise.all([fetchOrders(), fetchMatches(), fetchBookLogs()]);
      setOrders(o);
      setMatches(m);
      setLogs(l);
      setUpdatedAt(new Date().toISOString().slice(11, 19));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 12_000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <SectionHeading pill="The Proof" title="What the chain actually exposes." />

      <p className="mt-6 max-w-[68ch] text-[13px] leading-relaxed text-muted">
        Every value below is public. This is the complete on-chain footprint of the venue: order
        ids, opaque handles, event logs and settled fills. Read it carefully and look for a limit
        price. There isn&rsquo;t one — not for filled orders, not for cancelled ones, not for
        orders that never crossed.
      </p>

      <div className="mt-10 flex flex-wrap items-center gap-3">
        {[
          { label: "ZerkBook", address: addresses.book },
          { label: "ZerkZone", address: addresses.zone },
          { label: "Seaport 1.6", address: addresses.seaport },
          { label: "NoxCompute", address: addresses.noxCompute },
        ]
          .filter((c) => Boolean(c.address))
          .map((c) => (
            <a
              key={c.label}
              href={explorerAddress(c.address!)}
              target="_blank"
              rel="noreferrer noopener"
              className="glass inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] text-muted transition-colors hover:border-white/40 hover:text-white"
            >
              {c.label}
              <span className="font-mono">{shortAddress(c.address!)}</span>
            </a>
          ))}
        {updatedAt ? (
          <span className="ml-auto flex items-center gap-2 text-[11px] text-ghost">
            <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-white" />
            live · {updatedAt} UTC
          </span>
        ) : null}
      </div>

      {!isDeployed ? (
        <div className="mt-8">
          <Banner tone="warn">
            No deployment configured. Run the deploy scripts, then{" "}
            <Mono tone="white">npm run sync-abi</Mono>.
          </Banner>
        </div>
      ) : null}

      {error ? (
        <div className="mt-8">
          <Banner tone="warn">{error}</Banner>
        </div>
      ) : null}

      {/* ── Orders ───────────────────────────────────────────────────────── */}
      <section className="mt-16">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] uppercase tracking-[0.22em] text-white">
            Order book — stored state
          </span>
          <Pill tone="ghost">{orders.length} orders</Pill>
        </div>

        <div className="mt-5">
          {orders.length === 0 ? (
            <Empty>No orders on chain yet.</Empty>
          ) : (
            <Card className="scroll-x">
              <table className="w-full min-w-[900px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-hairline">
                    {["id", "desk", "side", "size", "limit", "status", "submitted"].map((h) => (
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
                  {orders.map((o) => (
                    <tr key={o.id.toString()} className="border-b border-hairline last:border-0">
                      <td className="px-5 py-4">
                        <Mono>#{o.id.toString()}</Mono>
                      </td>
                      <td className="px-5 py-4">
                        <a
                          href={explorerAddress(o.desk)}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="font-mono text-[13px] text-muted hover:text-white"
                        >
                          {shortAddress(o.desk)}
                        </a>
                      </td>
                      <td className="px-5 py-4">
                        <Mono tone="ghost" title={o.hSide}>
                          {shortHandle(o.hSide)}
                        </Mono>
                      </td>
                      <td className="px-5 py-4">
                        <Mono tone="ghost" title={o.hSize}>
                          {shortHandle(o.hSize)}
                        </Mono>
                      </td>
                      <td className="px-5 py-4">
                        <Mono tone="ghost" title={o.hLimit}>
                          {shortHandle(o.hLimit)}
                        </Mono>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`text-[10px] uppercase tracking-[0.22em] ${statusTone(o.status)}`}
                        >
                          {statusLabel(o.status)}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-mono text-[11px] text-ghost">
                          {formatTimestamp(o.submittedAt)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
        <p className="mt-4 text-[12px] leading-relaxed text-ghost">
          The side, size and limit columns are the literal storage values. Each is a 32-byte Nox
          handle — an index into ciphertext held off-chain. No amount of chain analysis resolves
          them.
        </p>
      </section>

      {/* ── Matches ──────────────────────────────────────────────────────── */}
      <section className="mt-16">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] uppercase tracking-[0.22em] text-white">
            Matches — the only plaintext in the system
          </span>
          <Pill tone="ghost">{matches.length} proposals</Pill>
        </div>

        <div className="mt-5 space-y-4">
          {matches.length === 0 ? (
            <Empty>No proposals yet. The blind matcher pairs order ids as they rest.</Empty>
          ) : (
            matches.map((m) => (
              <Card key={m.id} className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Mono title={m.id}>{shortHandle(m.id, 10, 8)}</Mono>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-muted">
                      #{m.bidId.toString()} × #{m.askId.toString()}
                    </span>
                    <span
                      className={`text-[10px] uppercase tracking-[0.22em] ${
                        m.consumed
                          ? "text-muted"
                          : m.approved
                            ? "text-white"
                            : m.finalized
                              ? "text-ghost"
                              : "text-muted"
                      }`}
                    >
                      {m.consumed
                        ? "Settled"
                        : m.approved
                          ? "Approved"
                          : m.finalized
                            ? "Did not cross"
                            : "Computing"}
                    </span>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  <div className="glass-inset rounded-[10px] px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-muted">crossed</p>
                    <p className="mt-2">
                      <Mono tone="ghost" title={m.hCrossed}>
                        {shortHandle(m.hCrossed)}
                      </Mono>
                    </p>
                  </div>
                  <div className="glass-inset rounded-[10px] px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-muted">fill size</p>
                    <p className="mt-2">
                      {m.approved ? (
                        <Mono>
                          {formatBase(m.fillSize)} {BASE_SYMBOL}
                        </Mono>
                      ) : (
                        <Mono tone="ghost" title={m.hFillSize}>
                          {shortHandle(m.hFillSize)}
                        </Mono>
                      )}
                    </p>
                  </div>
                  <div className="glass-inset rounded-[10px] px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-muted">fill price</p>
                    <p className="mt-2">
                      {m.approved ? (
                        <Mono>
                          {formatQuote(m.fillPrice)} {QUOTE_SYMBOL}
                        </Mono>
                      ) : (
                        <Mono tone="ghost" title={m.hFillPrice}>
                          {shortHandle(m.hFillPrice)}
                        </Mono>
                      )}
                    </p>
                  </div>
                </div>

                {m.finalized && !m.approved ? (
                  <p className="mt-5 text-[12px] leading-relaxed text-ghost">
                    This pair did not cross. Nothing about why was disclosed — the enclave&rsquo;s
                    rejection is computationally indistinguishable from an acceptance until the
                    result is decrypted, and both orders simply went back to resting.
                  </p>
                ) : null}
              </Card>
            ))
          )}
        </div>
      </section>

      {/* ── Raw logs ─────────────────────────────────────────────────────── */}
      <section className="mt-16">
        <span className="text-[10px] uppercase tracking-[0.22em] text-white">
          Raw event log — unprocessed
        </span>

        <div className="mt-5">
          {logs.length === 0 ? (
            <Empty>No logs in the lookback window.</Empty>
          ) : (
            <Card className="scroll-x p-6">
              <pre className="font-mono text-[11px] leading-relaxed text-ghost">
                {logs
                  .slice(0, 40)
                  .map((log) => {
                    const name = EVENT_NAMES[log.topics[0] ?? ""] ?? "";
                    return [
                      `block ${log.blockNumber}  ${name}`,
                      ...(log.topics as string[]).map((t, i) => `  topic[${i}] ${t}`),
                      log.data && log.data !== "0x" ? `  data     ${log.data}` : null,
                      `  tx       ${log.transactionHash}`,
                    ]
                      .filter(Boolean)
                      .join("\n");
                  })
                  .join("\n\n")}
              </pre>
            </Card>
          )}
        </div>

        {logs[0]?.transactionHash ? (
          <a
            href={explorerTx(logs[0].transactionHash)}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-4 inline-block font-mono text-[12px] text-muted underline-offset-4 hover:text-white hover:underline"
          >
            latest tx on Etherscan ↗
          </a>
        ) : null}
      </section>

      <div className="mt-16">
        <Banner>
          <strong className="font-normal text-white">The privacy test.</strong> Copy any
          transaction above into Etherscan, open the raw input data, and search it for a limit
          price. Then do the same for the event logs. The value is not there, and it never was —
          it was encrypted in the desk&rsquo;s browser before the transaction was built.
        </Banner>
      </div>
    </div>
  );
}
