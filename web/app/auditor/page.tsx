"use client";

import { useCallback, useEffect, useState } from "react";
import { formatUnits, type Hex } from "viem";
import { useWallet } from "@/components/WalletProvider";
import { Banner, Card, Empty, Mono, Pill, PillButton, SectionHeading } from "@/components/ui";
import { BASE_SYMBOL, QUOTE_DECIMALS, QUOTE_SYMBOL, isDeployed } from "@/lib/config";
import { canView, fetchOrders, type OrderRow } from "@/lib/book";
import {
  formatBase,
  formatTimestamp,
  shortAddress,
  shortHandle,
  statusLabel,
} from "@/lib/format";
import { readAcl, tryDecrypt, type Acl, type DecryptOutcome } from "@/lib/nox";

type Probe = {
  side?: DecryptOutcome;
  size?: DecryptOutcome;
  limit?: DecryptOutcome;
  acl?: Acl | null;
  granted?: boolean;
};

export default function AuditorPage() {
  const { address, wallet, connect, connecting, hasProvider, nox } = useWallet();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [probes, setProbes] = useState<Record<string, Probe>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isDeployed) return;
    try {
      setOrders(await fetchOrders());
    } catch {
      /* handled by the banner */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // The on-chain grant state is independent of whether decryption is attempted — read it
  // straight from the ACL so the page can show the contrast without any client-side guessing.
  useEffect(() => {
    if (!address || orders.length === 0) return;
    void Promise.all(
      orders.map(async (o) => [o.id.toString(), await canView(o.id, address)] as const)
    ).then((pairs) => {
      setProbes((prev) => {
        const next = { ...prev };
        for (const [id, granted] of pairs) next[id] = { ...next[id], granted };
        return next;
      });
    });
  }, [address, orders]);

  async function probe(order: OrderRow) {
    setBusy(order.id.toString());
    try {
      const client = await nox();
      const [side, size, limit, acl] = await Promise.all([
        tryDecrypt(client, order.hSide),
        tryDecrypt(client, order.hSize),
        tryDecrypt(client, order.hLimit),
        readAcl(client, order.hLimit),
      ]);
      setProbes((prev) => ({
        ...prev,
        [order.id.toString()]: { ...prev[order.id.toString()], side, size, limit, acl },
      }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
      <SectionHeading pill="Selective Disclosure" title="Compliance without publicity." />

      <p className="mt-6 max-w-[68ch] text-[13px] leading-relaxed text-muted">
        Connect as a regulator address. Before a desk grants you viewer rights on an order, the
        KMS refuses to reassemble the value and decryption fails. After the grant, the same field
        resolves — for you, and for nobody else. Nothing about the order becomes public at any
        point.
      </p>

      {!isDeployed ? (
        <div className="mt-10">
          <Banner tone="warn">No deployment configured.</Banner>
        </div>
      ) : null}

      <div className="mt-10 flex flex-wrap items-center gap-4">
        {!address ? (
          <>
            <PillButton onClick={connect} disabled={connecting || !hasProvider}>
              {connecting ? "Connecting…" : "Connect as auditor"}
            </PillButton>
            {!hasProvider ? (
              <span className="text-[13px] text-muted">No injected wallet detected.</span>
            ) : null}
          </>
        ) : (
          <>
            <Pill tone="white">Auditor</Pill>
            <Mono tone="muted" title={address}>
              {shortAddress(address)}
            </Mono>
            <span className="text-[13px] text-ghost">
              Grants are issued from the desk view, one order at a time.
            </span>
          </>
        )}
      </div>

      <div className="mt-12 space-y-4">
        {orders.length === 0 ? (
          <Empty>No orders on chain yet.</Empty>
        ) : (
          orders.map((order) => {
            const p = probes[order.id.toString()] ?? {};
            const granted = p.granted;

            return (
              <Card key={order.id.toString()} className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Mono>#{order.id.toString()}</Mono>
                    <span className="text-[11px] text-muted">{shortAddress(order.desk)}</span>
                    <span className="text-[10px] uppercase tracking-[0.22em] text-muted">
                      {statusLabel(order.status)}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    {address ? (
                      <span
                        className={`text-[10px] uppercase tracking-[0.22em] ${
                          granted ? "text-white" : "text-ghost"
                        }`}
                      >
                        {granted === undefined
                          ? "checking…"
                          : granted
                            ? "access granted"
                            : "no grant"}
                      </span>
                    ) : null}
                    <PillButton
                      tone="ghost"
                      className="px-4 py-2 text-[13px]"
                      disabled={!wallet || busy === order.id.toString()}
                      onClick={() => void probe(order)}
                    >
                      {busy === order.id.toString() ? "Requesting…" : "Attempt decrypt"}
                    </PillButton>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  <ProbeCell label="side" handle={order.hSide} outcome={p.side} kind="side" />
                  <ProbeCell label="size" handle={order.hSize} outcome={p.size} kind="base" />
                  <ProbeCell label="limit" handle={order.hLimit} outcome={p.limit} kind="quote" />
                </div>

                {p.acl ? (
                  <div className="glass-inset mt-6 rounded-[10px] px-4 py-4">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-muted">
                      ACL — limit handle
                    </p>
                    <dl className="mt-3 space-y-1.5 font-mono text-[11px] text-ghost">
                      <div>
                        public: <span className="text-muted">{String(p.acl.isPublic)}</span>
                      </div>
                      <div>
                        admins:{" "}
                        <span className="text-muted">
                          {p.acl.admins.map((a) => shortAddress(a)).join(", ") || "—"}
                        </span>
                      </div>
                      <div>
                        viewers:{" "}
                        <span className="text-muted">
                          {p.acl.viewers.map((a) => shortAddress(a)).join(", ") || "—"}
                        </span>
                      </div>
                    </dl>
                  </div>
                ) : null}

                <p className="mt-4 font-mono text-[11px] text-ghost">
                  submitted {formatTimestamp(order.submittedAt)}
                </p>
              </Card>
            );
          })
        )}
      </div>

      <div className="mt-14">
        <Banner>
          <strong className="font-normal text-white">Why this is the institutional argument.</strong>{" "}
          A dark pool that regulators cannot inspect is not deployable. A venue that publishes
          everything is not usable. Handle-level ACLs give a desk one dial per order per address —
          disclosure to a named supervisor, with an on-chain record of exactly what was disclosed
          and to whom.
        </Banner>
      </div>
    </div>
  );
}

function ProbeCell({
  label,
  handle,
  outcome,
  kind,
}: {
  label: string;
  handle: Hex;
  outcome?: DecryptOutcome;
  kind: "side" | "base" | "quote";
}) {
  return (
    <div className="glass-inset rounded-[10px] px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.22em] text-muted">{label}</p>
      <p className="mt-2">
        {!outcome ? (
          <Mono tone="ghost" title={handle}>
            {shortHandle(handle)}
          </Mono>
        ) : outcome.status === "ok" ? (
          <Mono>{render(outcome.value, kind)}</Mono>
        ) : (
          <Mono tone="ghost">
            {outcome.status === "pending" ? "computing…" : "decryption refused"}
          </Mono>
        )}
      </p>
    </div>
  );
}

function render(value: bigint | boolean, kind: "side" | "base" | "quote"): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (kind === "side") return value === 0n ? "BID" : "ASK";
  if (kind === "base") return `${formatBase(value)} ${BASE_SYMBOL}`;
  return `${formatUnits(value, QUOTE_DECIMALS)} ${QUOTE_SYMBOL}`;
}
