import { formatUnits } from "viem";
import { BASE_DECIMALS, QUOTE_DECIMALS } from "./config";

/** Handles are 32 opaque bytes. Rendering them truncated is the point of the /public view. */
export function shortHandle(handle: string, lead = 6, tail = 4): string {
  if (!handle || handle.length < lead + tail + 4) return handle;
  return `${handle.slice(0, 2 + lead)}…${handle.slice(-tail)}`;
}

export const shortAddress = (address: string) => shortHandle(address, 4, 4);

export const ZERO_HANDLE = `0x${"00".repeat(32)}`;

export const isEmptyHandle = (handle?: string) => !handle || handle === ZERO_HANDLE;

export function formatBase(value: bigint): string {
  return Number(formatUnits(value, BASE_DECIMALS)).toLocaleString("en-US", {
    maximumFractionDigits: 4,
  });
}

export function formatQuote(value: bigint): string {
  return Number(formatUnits(value, QUOTE_DECIMALS)).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

export function formatTimestamp(seconds: bigint | number): string {
  const ms = Number(seconds) * 1000;
  if (!ms) return "—";
  return new Date(ms).toISOString().replace("T", " ").replace(".000Z", " UTC");
}

export const ORDER_STATUS = [
  "None",
  "Open",
  "Pending",
  "Matched",
  "Settled",
  "Cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUS)[number];

export function statusLabel(status: number): OrderStatus {
  return ORDER_STATUS[status] ?? "None";
}

export function statusTone(status: number): string {
  switch (statusLabel(status)) {
    case "Open":
      return "text-white";
    case "Pending":
      return "text-muted";
    case "Matched":
      return "text-white";
    case "Settled":
      return "text-muted";
    case "Cancelled":
      return "text-ghost";
    default:
      return "text-ghost";
  }
}
