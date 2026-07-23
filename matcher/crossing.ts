/**
 * A plaintext mirror of the crossing predicate `ZerkBook.proposeMatch` evaluates inside the TEE.
 *
 * The keeper never runs this on real orders — it cannot, it has no plaintext. It exists so the
 * branchless formulation can be tested against a naive one, and so the demo scripts can predict
 * what a fill *should* be before asking the enclave.
 */

export const SIDE_BID = 0;
export const SIDE_ASK = 1;

export type PricingRule = "askLimit" | "midpoint";

export type PlainOrder = {
  /** 0 = bid, 1 = ask */
  side: number;
  /** base-token units */
  size: bigint;
  /** quote units per whole base token */
  limit: bigint;
};

export type CrossResult = {
  crossed: boolean;
  fillSize: bigint;
  fillPrice: bigint;
};

/**
 * The exact sequence of Nox primitives the contract issues. Nox exposes no encrypted boolean
 * AND, so the three conditions are folded into a 0/1 selector and multiplied through.
 */
export function crossBranchless(
  bid: PlainOrder,
  ask: PlainOrder,
  rule: PricingRule = "midpoint"
): CrossResult {
  const select = <T>(condition: boolean, ifTrue: T, ifFalse: T): T =>
    condition ? ifTrue : ifFalse;

  const priceCrosses = bid.limit >= ask.limit;
  const bidIsBid = bid.side === SIDE_BID;
  const askIsAsk = ask.side === SIDE_ASK;

  let flag = select(priceCrosses, 1n, 0n);
  flag = select(bidIsBid, flag, 0n);
  flag = select(askIsAsk, flag, 0n);

  const minSize = select(bid.size <= ask.size, bid.size, ask.size);
  const fillSize = flag * minSize;

  const refPrice = rule === "midpoint" ? (bid.limit + ask.limit) / 2n : ask.limit;
  const fillPrice = flag * refPrice;

  return { crossed: flag === 1n, fillSize, fillPrice };
}

/** The obvious implementation, used only as a test oracle. */
export function crossNaive(
  bid: PlainOrder,
  ask: PlainOrder,
  rule: PricingRule = "midpoint"
): CrossResult {
  if (bid.side !== SIDE_BID || ask.side !== SIDE_ASK || bid.limit < ask.limit) {
    return { crossed: false, fillSize: 0n, fillPrice: 0n };
  }
  return {
    crossed: true,
    fillSize: bid.size < ask.size ? bid.size : ask.size,
    fillPrice: rule === "midpoint" ? (bid.limit + ask.limit) / 2n : ask.limit,
  };
}

/** Quote-token notional of a fill. Mirrors `ZerkBook.fillTerms`. */
export function notionalOf(fillSize: bigint, fillPrice: bigint, baseDecimals = 18): bigint {
  return (fillSize * fillPrice) / 10n ** BigInt(baseDecimals);
}
