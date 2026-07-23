/**
 * Builds and signs the restricted Seaport orders that settle a Zerk match.
 *
 * Seaport is never modified, forked or redeployed. Everything here is a plain client of the
 * canonical 1.6 instance; the only unusual thing we do is put the Zerk match id in `zoneHash`,
 * which makes the order unfillable unless `ZerkBook` approved that exact match.
 */
import {
  encodeFunctionData,
  keccak256,
  toHex,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";

export const SEAPORT_1_6: Address = "0x0000000000000068F116a894984e2DB1123eB395";
export const ZERO_CONDUIT_KEY: Hex = `0x${"00".repeat(32)}`;

export const ItemType = { NATIVE: 0, ERC20: 1, ERC721: 2, ERC1155: 3 } as const;

export const OrderType = {
  FULL_OPEN: 0,
  PARTIAL_OPEN: 1,
  /** Zone is consulted, and the order must be filled in full — the only type Zerk signs. */
  FULL_RESTRICTED: 2,
  PARTIAL_RESTRICTED: 3,
  CONTRACT: 4,
} as const;

/** The slice of Seaport's ABI this project touches. */
export const seaportAbi = [
  {
    type: "function",
    name: "getCounter",
    stateMutability: "view",
    inputs: [{ name: "offerer", type: "address" }],
    outputs: [{ name: "counter", type: "uint256" }],
  },
  {
    type: "function",
    name: "getOrderHash",
    stateMutability: "view",
    inputs: [
      {
        name: "order",
        type: "tuple",
        components: [
          { name: "offerer", type: "address" },
          { name: "zone", type: "address" },
          {
            name: "offer",
            type: "tuple[]",
            components: [
              { name: "itemType", type: "uint8" },
              { name: "token", type: "address" },
              { name: "identifierOrCriteria", type: "uint256" },
              { name: "startAmount", type: "uint256" },
              { name: "endAmount", type: "uint256" },
            ],
          },
          {
            name: "consideration",
            type: "tuple[]",
            components: [
              { name: "itemType", type: "uint8" },
              { name: "token", type: "address" },
              { name: "identifierOrCriteria", type: "uint256" },
              { name: "startAmount", type: "uint256" },
              { name: "endAmount", type: "uint256" },
              { name: "recipient", type: "address" },
            ],
          },
          { name: "orderType", type: "uint8" },
          { name: "startTime", type: "uint256" },
          { name: "endTime", type: "uint256" },
          { name: "zoneHash", type: "bytes32" },
          { name: "salt", type: "uint256" },
          { name: "conduitKey", type: "bytes32" },
          { name: "counter", type: "uint256" },
        ],
      },
    ],
    outputs: [{ name: "orderHash", type: "bytes32" }],
  },
  {
    type: "function",
    name: "fulfillAdvancedOrder",
    stateMutability: "payable",
    inputs: [
      {
        name: "advancedOrder",
        type: "tuple",
        components: [
          {
            name: "parameters",
            type: "tuple",
            components: [
              { name: "offerer", type: "address" },
              { name: "zone", type: "address" },
              {
                name: "offer",
                type: "tuple[]",
                components: [
                  { name: "itemType", type: "uint8" },
                  { name: "token", type: "address" },
                  { name: "identifierOrCriteria", type: "uint256" },
                  { name: "startAmount", type: "uint256" },
                  { name: "endAmount", type: "uint256" },
                ],
              },
              {
                name: "consideration",
                type: "tuple[]",
                components: [
                  { name: "itemType", type: "uint8" },
                  { name: "token", type: "address" },
                  { name: "identifierOrCriteria", type: "uint256" },
                  { name: "startAmount", type: "uint256" },
                  { name: "endAmount", type: "uint256" },
                  { name: "recipient", type: "address" },
                ],
              },
              { name: "orderType", type: "uint8" },
              { name: "startTime", type: "uint256" },
              { name: "endTime", type: "uint256" },
              { name: "zoneHash", type: "bytes32" },
              { name: "salt", type: "uint256" },
              { name: "conduitKey", type: "bytes32" },
              { name: "totalOriginalConsiderationItems", type: "uint256" },
            ],
          },
          { name: "numerator", type: "uint120" },
          { name: "denominator", type: "uint120" },
          { name: "signature", type: "bytes" },
          { name: "extraData", type: "bytes" },
        ],
      },
      {
        name: "criteriaResolvers",
        type: "tuple[]",
        components: [
          { name: "orderIndex", type: "uint256" },
          { name: "side", type: "uint8" },
          { name: "index", type: "uint256" },
          { name: "identifier", type: "uint256" },
          { name: "criteriaProof", type: "bytes32[]" },
        ],
      },
      { name: "fulfillerConduitKey", type: "bytes32" },
      { name: "recipient", type: "address" },
    ],
    outputs: [{ name: "fulfilled", type: "bool" }],
  },
] as const;

/** Seaport's EIP-712 order types, verbatim. */
export const SEAPORT_EIP712_TYPES = {
  OrderComponents: [
    { name: "offerer", type: "address" },
    { name: "zone", type: "address" },
    { name: "offer", type: "OfferItem[]" },
    { name: "consideration", type: "ConsiderationItem[]" },
    { name: "orderType", type: "uint8" },
    { name: "startTime", type: "uint256" },
    { name: "endTime", type: "uint256" },
    { name: "zoneHash", type: "bytes32" },
    { name: "salt", type: "uint256" },
    { name: "conduitKey", type: "bytes32" },
    { name: "counter", type: "uint256" },
  ],
  OfferItem: [
    { name: "itemType", type: "uint8" },
    { name: "token", type: "address" },
    { name: "identifierOrCriteria", type: "uint256" },
    { name: "startAmount", type: "uint256" },
    { name: "endAmount", type: "uint256" },
  ],
  ConsiderationItem: [
    { name: "itemType", type: "uint8" },
    { name: "token", type: "address" },
    { name: "identifierOrCriteria", type: "uint256" },
    { name: "startAmount", type: "uint256" },
    { name: "endAmount", type: "uint256" },
    { name: "recipient", type: "address" },
  ],
} as const;

export type OfferItem = {
  itemType: number;
  token: Address;
  identifierOrCriteria: bigint;
  startAmount: bigint;
  endAmount: bigint;
};

export type ConsiderationItem = OfferItem & { recipient: Address };

export type OrderParameters = {
  offerer: Address;
  zone: Address;
  offer: OfferItem[];
  consideration: ConsiderationItem[];
  orderType: number;
  startTime: bigint;
  endTime: bigint;
  zoneHash: Hex;
  salt: bigint;
  conduitKey: Hex;
  totalOriginalConsiderationItems: bigint;
};

export type SignedOrder = {
  parameters: OrderParameters;
  signature: Hex;
  counter: bigint;
};

export type BuildSellOrderArgs = {
  /** The RWA holder. Signs the order off-chain; nothing hits the chain until it is fulfilled. */
  offerer: Address;
  zone: Address;
  baseToken: Address;
  quoteToken: Address;
  /** Approved fill size in base units. */
  fillSize: bigint;
  /** Approved notional in quote units. */
  notional: bigint;
  /** The Zerk match id. Goes into zoneHash — this is the whole binding. */
  matchId: Hex;
  durationSeconds?: bigint;
  now?: bigint;
  salt?: bigint;
};

/**
 * The RWA seller offers `fillSize` base tokens and asks for `notional` quote tokens back.
 * FULL_RESTRICTED: the zone is consulted, and partial fills are impossible — so the amounts
 * Seaport moves are exactly the amounts the zone verified.
 */
export function buildSellOrderParameters(args: BuildSellOrderArgs): OrderParameters {
  const now = args.now ?? BigInt(Math.floor(Date.now() / 1000));
  const duration = args.durationSeconds ?? 3600n;

  return {
    offerer: args.offerer,
    zone: args.zone,
    offer: [
      {
        itemType: ItemType.ERC20,
        token: args.baseToken,
        identifierOrCriteria: 0n,
        startAmount: args.fillSize,
        endAmount: args.fillSize,
      },
    ],
    consideration: [
      {
        itemType: ItemType.ERC20,
        token: args.quoteToken,
        identifierOrCriteria: 0n,
        startAmount: args.notional,
        endAmount: args.notional,
        recipient: args.offerer,
      },
    ],
    orderType: OrderType.FULL_RESTRICTED,
    startTime: now - 60n,
    endTime: now + duration,
    zoneHash: args.matchId,
    salt: args.salt ?? BigInt(keccak256(toHex(`zerk:${args.matchId}:${now}`)).slice(0, 18)),
    conduitKey: ZERO_CONDUIT_KEY,
    totalOriginalConsiderationItems: 1n,
  };
}

export async function signOrder({
  wallet,
  publicClient,
  parameters,
  seaport = SEAPORT_1_6,
}: {
  wallet: WalletClient;
  publicClient: PublicClient;
  parameters: OrderParameters;
  seaport?: Address;
}): Promise<SignedOrder> {
  const account = wallet.account;
  if (!account) throw new Error("Wallet client has no account attached");

  const chainId = await publicClient.getChainId();
  const counter = await publicClient.readContract({
    address: seaport,
    abi: seaportAbi,
    functionName: "getCounter",
    args: [parameters.offerer],
  });

  const { totalOriginalConsiderationItems: _drop, ...rest } = parameters;

  const signature = await wallet.signTypedData({
    account,
    domain: { name: "Seaport", version: "1.6", chainId, verifyingContract: seaport },
    types: SEAPORT_EIP712_TYPES,
    primaryType: "OrderComponents",
    message: { ...rest, counter },
  });

  return { parameters, signature, counter };
}

/** Calldata for `fulfillAdvancedOrder`. numerator/denominator are 1/1 — FULL_RESTRICTED. */
export function encodeFulfillAdvancedOrder({
  order,
  recipient,
}: {
  order: SignedOrder;
  recipient: Address;
}): Hex {
  return encodeFunctionData({
    abi: seaportAbi,
    functionName: "fulfillAdvancedOrder",
    args: [
      {
        parameters: order.parameters,
        numerator: 1n,
        denominator: 1n,
        signature: order.signature,
        extraData: "0x",
      },
      [],
      ZERO_CONDUIT_KEY,
      recipient,
    ],
  });
}
