"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatUnits, parseUnits, type Hex } from "viem";
import { sepolia } from "viem/chains";
import { useWallet } from "@/components/WalletProvider";
import {
  Banner,
  Card,
  Empty,
  Field,
  Mono,
  Pill,
  PillButton,
  SectionHeading,
  inputClass,
} from "@/components/ui";
import { balanceOf } from "@/lib/chain";
import {
  BASE_DECIMALS,
  BASE_SYMBOL,
  QUOTE_DECIMALS,
  QUOTE_SYMBOL,
  addresses,
  explorerTx,
  isDeployed,
} from "@/lib/config";
import { fetchOrders, ZerkBookAbi, type OrderRow } from "@/lib/book";
import {
  formatBase,
  formatQuote,
  formatTimestamp,
  shortAddress,
  shortHandle,
  statusLabel,
  statusTone,
} from "@/lib/format";
import { encrypt, tryDecrypt, type DecryptOutcome } from "@/lib/nox";

const SIDE_BID = 0;
const SIDE_ASK = 1;

type Revealed = {
  side?: DecryptOutcome;
  size?: DecryptOutcome;
  limit?: DecryptOutcome;
};

export default function DeskPage() {
  const { address, label, wallet, connect, connecting, hasProvider, error: walletError, nox } =
    useWallet();

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [side, setSide] = useState<number>(SIDE_BID);
  const [size, setSize] = useState("400000");
  const [limit, setLimit] = useState("99.10");

  const [phase, setPhase] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [revealed, setRevealed] = useState<Record<string, Revealed>>({});
  const [balances, setBalances] = useState<{ base: bigint; quote: bigint } | null>(null);

  const [auditorAddress, setAuditorAddress] = useState("");

  const refresh = useCallback(async () => {
    if (!isDeployed) return;
    setLoading(true);
    try {
      setOrders(await fetchOrders());
    } catch {
      /* the banner below already explains an undeployed book */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 15_000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (!address || !addresses.rwa || !addresses.usdc) return;
    void Promise.all([balanceOf(addresses.rwa, address), balanceOf(addresses.usdc, address)])
      .then(([base, quote]) => setBalances({ base, quote }))
      .catch(() => setBalances(null));
  }, [address, txHash]);

  const myOrders = useMemo(
    () => orders.filter((o) => address && o.desk.toLowerCase() === address.toLowerCase()),
    [orders, address]
  );

  async function submit() {
    if (!wallet || !address || !addresses.book) return;
    setFormError(null);
    setTxHash(null);

    let sizeUnits: bigint;
    let limitUnits: bigint;
    try {
      sizeUnits = parseUnits(size.trim(), BASE_DECIMALS);
      limitUnits = parseUnits(limit.trim(), QUOTE_DECIMALS);
    } catch {
      setFormError("Size and limit must be plain decimal numbers.");
      return;
    }
    if (sizeUnits <= 0n) {
      setFormError("Size must be greater than zero.");
      return;
    }

    try {
      setPhase("Sealing order terms client-side…");
      const client = await nox();

      // Three separate ciphertexts. Nothing below ever exists in plaintext on chain.
      const [encSide, encSize, encLimit] = await Promise.all([
        encrypt(client, BigInt(side), "uint16", addresses.book),
        encrypt(client, sizeUnits, "uint256", addresses.book),
        encrypt(client, limitUnits, "uint256", addresses.book),
      ]);

      setPhase("Submitting handles to ZerkBook…");
      const hash = await wallet.writeContract({
        address: addresses.book,
        abi: ZerkBookAbi,
        functionName: "submitOrder",
        args: [
          encSide.handle,
          encSide.handleProof,
          encSize.handle,
          encSize.handleProof,
          encLimit.handle,
          encLimit.handleProof,
        ],
        chain: sepolia,
        account: wallet.account!,
      });

      setTxHash(hash);
      setPhase("Confirming…");
      await refresh();
      setPhase(null);
    } catch (err) {
      setPhase(null);
      setFormError(err instanceof Error ? err.message.split("\n")[0]! : String(err));
    }
  }

  async function reveal(order: OrderRow) {
    const client = await nox();
    const key = order.id.toString();
    setRevealed((prev) => ({ ...prev, [key]: { ...prev[key] } }));
    const [s, z, l] = await Promise.all([
      tryDecrypt(client, order.hSide),
      tryDecrypt(client, order.hSize),
      tryDecrypt(client, order.hLimit),
    ]);
    setRevealed((prev) => ({ ...prev, [key]: { side: s, size: z, limit: l } }));
  }

  async function cancel(order: OrderRow) {
    if (!wallet || !addresses.book) return;
    const hash = await wallet.writeContract({
      address: addresses.book,
      abi: ZerkBookAbi,
      functionName: "cancelOrder",
      args: [order.id],
      chain: sepolia,
      account: wallet.account!,
    });
    setTxHash(hash);
    await refresh();
  }

  async function grant(order: OrderRow) {
    if (!wallet || !addresses.book) return;
    if (!auditorAddress.startsWith("0x") || auditorAddress.length !== 42) {
      setFormError("Enter a valid auditor address before granting.");
      return;
    }
    const hash = await wallet.writeContract({
      address: addresses.book,
      abi: ZerkBookAbi,
      functionName: "grantAuditor",
      args: [order.id, auditorAddress as `0x${string}`],
      chain: sepolia,
      account: wallet.account!,
    });
    setTxHash(hash);
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <SectionHeading
        pill="The Desk"
        title={
          <>
            Submit size. Reveal nothing.
          </>
        }
      />

      <p className="mt-6 max-w-[62ch] text-[13px] leading-relaxed text-muted">
        Side, size and limit are encrypted in this browser before the transaction is built. The
        chain receives three opaque handles. Your blotter below is the proof that you — and only
        you — can read them back.
      </p>

      {!isDeployed ? (
        <div className="mt-10">
          <Banner tone="warn">
            No ZerkBook address is configured. Deploy the contracts and run{" "}
            <Mono tone="white">npm run sync-abi</Mono>, or set{" "}
            <Mono tone="white">NEXT_PUBLIC_ZERK_BOOK</Mono>.
          </Banner>
        </div>
      ) : null}

      {!address ? (
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <PillButton onClick={connect} disabled={connecting || !hasProvider}>
            {connecting ? "Connecting…" : "Connect wallet"}
          </PillButton>
          {!hasProvider ? (
            <span className="text-[13px] text-muted">
              No injected wallet detected. Install MetaMask to trade.
            </span>
          ) : null}
        </div>
      ) : (
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Pill tone="white">{label ?? "Desk"}</Pill>
          <Mono tone="muted" title={address}>
            {shortAddress(address)}
          </Mono>
          {balances ? (
            <span className="text-[13px] text-muted">
              {formatBase(balances.base)} {BASE_SYMBOL} · {formatQuote(balances.quote)}{" "}
              {QUOTE_SYMBOL}
            </span>
          ) : null}
        </div>
      )}

      {walletError ? (
        <div className="mt-6">
          <Banner tone="warn">{walletError}</Banner>
        </div>
      ) : null}

      <div className="mt-12 grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* ── Order ticket ───────────────────────────────────────────── */}
        <Card className="h-fit p-7">
          <span className="text-[10px] uppercase tracking-[0.22em] text-white">Order entry</span>

          <div className="mt-7 space-y-6">
            <Field label="Side">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: SIDE_BID, label: "Bid" },
                  { value: SIDE_ASK, label: "Ask" },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setSide(option.value)}
                    className={`rounded-[10px] px-4 py-3 text-sm transition-colors ${
                      side === option.value
                        ? "bg-white text-black"
                        : "glass text-muted hover:text-white"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </Field>

            <Field label={`Size (${BASE_SYMBOL})`} hint="Base-token units. Encrypted as uint256.">
              <input
                className={inputClass}
                value={size}
                onChange={(e) => setSize(e.target.value)}
                inputMode="decimal"
                placeholder="400000"
              />
            </Field>

            <Field
              label={`Limit (${QUOTE_SYMBOL} per token)`}
              hint="Never published — not at submission, not at fill, not on cancellation."
            >
              <input
                className={inputClass}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                inputMode="decimal"
                placeholder="99.10"
              />
            </Field>

            <PillButton
              className="w-full"
              onClick={submit}
              disabled={!wallet || !isDeployed || Boolean(phase)}
            >
              {phase ? "Working…" : "Encrypt & submit"}
            </PillButton>

            {phase ? (
              <p className="flex items-center gap-2 text-[13px] text-muted">
                <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-white" />
                {phase}
              </p>
            ) : null}

            {formError ? <p className="text-[13px] text-white/80">{formError}</p> : null}

            {txHash ? (
              <a
                href={explorerTx(txHash)}
                target="_blank"
                rel="noreferrer noopener"
                className="block font-mono text-[12px] text-muted underline-offset-4 hover:text-white hover:underline"
              >
                {shortHandle(txHash, 10, 8)} ↗
              </a>
            ) : null}
          </div>
        </Card>

        {/* ── Blotter ────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] uppercase tracking-[0.22em] text-white">
              Your blotter
            </span>
            <button
              onClick={() => void refresh()}
              className="text-[12px] text-muted transition-colors hover:text-white"
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          <div className="mt-5 space-y-4">
            {!address ? (
              <Empty>Connect a wallet to see your orders.</Empty>
            ) : myOrders.length === 0 ? (
              <Empty>
                No orders yet. Everything you submit here is encrypted before it leaves the browser.
              </Empty>
            ) : (
              myOrders.map((order) => {
                const r = revealed[order.id.toString()];
                return (
                  <Card key={order.id.toString()} className="p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <Mono>#{order.id.toString()}</Mono>
                        <span
                          className={`text-[10px] uppercase tracking-[0.22em] ${statusTone(order.status)}`}
                        >
                          {statusLabel(order.status)}
                        </span>
                      </div>
                      <span className="font-mono text-[11px] text-ghost">
                        {formatTimestamp(order.submittedAt)}
                      </span>
                    </div>

                    <dl className="mt-6 grid gap-3 sm:grid-cols-3">
                      <HandleCell label="side" handle={order.hSide} outcome={r?.side} kind="side" />
                      <HandleCell label="size" handle={order.hSize} outcome={r?.size} kind="base" />
                      <HandleCell
                        label="limit"
                        handle={order.hLimit}
                        outcome={r?.limit}
                        kind="quote"
                      />
                    </dl>

                    <div className="mt-6 flex flex-wrap gap-2">
                      <PillButton
                        tone="ghost"
                        className="px-4 py-2 text-[13px]"
                        onClick={() => void reveal(order)}
                      >
                        Decrypt my order
                      </PillButton>
                      {statusLabel(order.status) === "Open" ? (
                        <PillButton
                          tone="ghost"
                          className="px-4 py-2 text-[13px]"
                          onClick={() => void cancel(order)}
                        >
                          Cancel
                        </PillButton>
                      ) : null}
                      <PillButton
                        tone="ghost"
                        className="px-4 py-2 text-[13px]"
                        onClick={() => void grant(order)}
                      >
                        Grant auditor
                      </PillButton>
                    </div>
                  </Card>
                );
              })
            )}
          </div>

          {address ? (
            <div className="mt-6">
              <Field
                label="Auditor address"
                hint="Grants that address viewer rights on one order's handles. Nothing becomes public."
              >
                <input
                  className={inputClass}
                  value={auditorAddress}
                  onChange={(e) => setAuditorAddress(e.target.value)}
                  placeholder="0x…"
                />
              </Field>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function HandleCell({
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
      <dt className="text-[10px] uppercase tracking-[0.22em] text-muted">{label}</dt>
      <dd className="mt-2">
        {!outcome ? (
          <Mono tone="ghost" title={handle}>
            {shortHandle(handle)}
          </Mono>
        ) : outcome.status === "ok" ? (
          <Mono>{renderValue(outcome.value, kind)}</Mono>
        ) : (
          <Mono tone="ghost">{outcome.status === "pending" ? "computing…" : "no access"}</Mono>
        )}
      </dd>
    </div>
  );
}

function renderValue(value: bigint | boolean, kind: "side" | "base" | "quote"): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (kind === "side") return value === 0n ? "BID" : "ASK";
  if (kind === "base") return `${formatBase(value)} ${BASE_SYMBOL}`;
  return `${formatUnits(value, QUOTE_DECIMALS)} ${QUOTE_SYMBOL}`;
}
