import type { Address, Hex } from "viem";
import { publicClient } from "./chain";
import { addresses } from "./config";
import { ZerkBookAbi } from "./generated/abis";

export type OrderRow = {
  id: bigint;
  desk: Address;
  hSide: Hex;
  hSize: Hex;
  hLimit: Hex;
  submittedAt: bigint;
  status: number;
};

export type MatchRow = {
  id: Hex;
  bidId: bigint;
  askId: bigint;
  hCrossed: Hex;
  hFillSize: Hex;
  hFillPrice: Hex;
  fillSize: bigint;
  fillPrice: bigint;
  proposedAt: bigint;
  finalized: boolean;
  approved: boolean;
  consumed: boolean;
};

function bookAddress(): Address {
  if (!addresses.book) throw new Error("ZerkBook is not deployed on this network yet.");
  return addresses.book;
}

export async function fetchOrders(): Promise<OrderRow[]> {
  const book = bookAddress();
  const count = await publicClient.readContract({
    address: book,
    abi: ZerkBookAbi,
    functionName: "orderCount",
  });

  const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i + 1));

  const rows = await publicClient.multicall({
    contracts: ids.map((id) => ({
      address: book,
      abi: ZerkBookAbi,
      functionName: "getOrder" as const,
      args: [id] as const,
    })),
    allowFailure: true,
  });

  return rows.flatMap((row, index): OrderRow[] => {
    if (row.status !== "success") return [];
    const [desk, hSide, hSize, hLimit, submittedAt, status] = row.result as unknown as [
      Address,
      Hex,
      Hex,
      Hex,
      bigint,
      number,
    ];
    return [{ id: ids[index]!, desk, hSide, hSize, hLimit, submittedAt, status }];
  });
}

export async function fetchMatches(): Promise<MatchRow[]> {
  const book = bookAddress();
  const count = await publicClient.readContract({
    address: book,
    abi: ZerkBookAbi,
    functionName: "matchCount",
  });

  const indices = Array.from({ length: Number(count) }, (_, i) => BigInt(i));

  const idResults = await publicClient.multicall({
    contracts: indices.map((i) => ({
      address: book,
      abi: ZerkBookAbi,
      functionName: "matchIdAt" as const,
      args: [i] as const,
    })),
    allowFailure: true,
  });

  const ids = idResults.flatMap((r) => (r.status === "success" ? [r.result as unknown as Hex] : []));
  if (ids.length === 0) return [];

  const rows = await publicClient.multicall({
    contracts: ids.map((id) => ({
      address: book,
      abi: ZerkBookAbi,
      functionName: "getMatch" as const,
      args: [id] as const,
    })),
    allowFailure: true,
  });

  return rows.flatMap((row, index): MatchRow[] => {
    if (row.status !== "success") return [];
    const [
      bidId,
      askId,
      hCrossed,
      hFillSize,
      hFillPrice,
      fillSize,
      fillPrice,
      proposedAt,
      finalized,
      approved,
      consumed,
    ] = row.result as unknown as [
      bigint,
      bigint,
      Hex,
      Hex,
      Hex,
      bigint,
      bigint,
      bigint,
      boolean,
      boolean,
      boolean,
    ];
    return [
      {
        id: ids[index]!,
        bidId,
        askId,
        hCrossed,
        hFillSize,
        hFillPrice,
        fillSize,
        fillPrice,
        proposedAt,
        finalized,
        approved,
        consumed,
      },
    ];
  });
}

/** Raw event log feed for /public — the literal answer to "what does the chain show?". */
export async function fetchBookLogs(lookbackBlocks = 45_000n) {
  const book = bookAddress();
  const head = await publicClient.getBlockNumber();
  const fromBlock = head > lookbackBlocks ? head - lookbackBlocks : 0n;

  const logs = await publicClient.getLogs({
    address: book,
    fromBlock,
    toBlock: head,
  });

  return logs.reverse();
}

export async function canView(orderId: bigint, account: Address): Promise<boolean> {
  return publicClient.readContract({
    address: bookAddress(),
    abi: ZerkBookAbi,
    functionName: "canView",
    args: [orderId, account],
  });
}

export { ZerkBookAbi };
