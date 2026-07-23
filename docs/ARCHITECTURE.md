# Architecture

## 1. Why the lifecycle is three transactions

Nox is asynchronous, and designing as though it isn't means rewriting the contract later.

Nox coordinates six components: on-chain contracts, an event listener (**Ingestor**), a message
queue, a computation engine (**Runner**, the attested TEE), an encrypted data store (**Handle
Gateway**), and a **KMS**. Every confidential computation runs input → compute → output.

**Input.** The desk encrypts a value off-chain via the JS SDK. The Handle Gateway encrypts it
under the KMS public key, stores the ciphertext off-chain, and returns a **handle** — an opaque
32-byte identifier. The contract only ever holds handles.

**Compute.** The contract calls a Nox operation on handles. The Ingestor picks the event up and a
Runner executes it inside the TEE. Result handles are deterministic, derived from the operator,
input handles, contract address, caller, timestamp and output index.

**Output.** Decryption is delegated to the client. Each KMS node computes a partial re-encryption
share under threshold ECIES with Shamir secret sharing; shares are reassembled client-side. The
KMS never sees plaintext and no single node can decrypt alone.

Three consequences shaped `ZerkBook`:

1. **`submitOrder` cannot return a match.** Matching is a separate transaction whose result lands
   later. Hence submit → propose → finalize.
2. **You cannot `if (encryptedA > encryptedB)` in Solidity.** Comparisons return encrypted
   booleans; branching happens through `select`.
3. **On-chain `publicDecrypt` is proof *verification*, not decryption.** `Nox.publicDecrypt` is a
   `view` function that validates a KMS signature and returns the plaintext it commits to. The
   actual decryption happens off-chain via the JS SDK's `publicDecrypt`, which returns a
   `decryptionProof`. So `finalizeMatch` takes proofs as calldata:

   ```solidity
   function finalizeMatch(
       bytes32 matchId,
       bytes calldata crossedProof,
       bytes calldata fillSizeProof,
       bytes calldata fillPriceProof
   ) external
   ```

   This is better than it first looks. The relayer cannot lie: a keeper that submits a forged
   fill price simply reverts, because the contract re-verifies the KMS signature itself.

---

## 2. The branchless crossing predicate

Nox exposes comparisons (`eq`, `ne`, `lt`, `le`, `gt`, `ge`), arithmetic (`add`, `sub`, `mul`,
`div`, and safe variants), and `select`. It exposes **no encrypted boolean AND, OR or NOT**, and
no `min`/`max`.

The crossing predicate needs a three-way AND, so it is folded into a 0/1 selector and multiplied
through:

```solidity
ebool priceCrosses = Nox.ge(bid.limit, ask.limit);
ebool bidIsBid     = Nox.eq(bid.side, _eSideBid);
ebool askIsAsk     = Nox.eq(ask.side, _eSideAsk);

euint256 flag = Nox.select(priceCrosses, _eOne, _eZero);
flag          = Nox.select(bidIsBid,     flag,  _eZero);
flag          = Nox.select(askIsAsk,     flag,  _eZero);

ebool crossed = Nox.eq(flag, _eOne);

euint256 minSize   = Nox.select(Nox.le(bid.size, ask.size), bid.size, ask.size);
euint256 fillSize  = Nox.mul(flag, minSize);
euint256 fillPrice = Nox.mul(flag, refPrice);
```

`min` is composed from `le` + `select`. `flag ∈ {0,1}`, so `mul` can never overflow and the
`safeMul` variant is unnecessary.

**Why this matters beyond compiling.** Every proposal executes the identical sequence of
operations regardless of outcome. A failed match is computationally indistinguishable from a
successful one until the result is decrypted, and a rejected proposal leaks nothing about *which*
of the three conditions failed — not the price, not the side, not the size.

`test/ZerkBook.match.test.ts` asserts this formulation equals the naive branching one across
crossed, not-crossed, partial, equal-limit, one-unit-miss, zero-size and wrong-side cases, for
both pricing rules.

---

## 3. Pricing rule: a deliberate deploy-time choice

`ZerkBook` takes a `PricingRule` immutable.

| Rule | Executed price | Buyer's limit | Seller's limit |
|---|---|---|---|
| `AskLimit` | the ask's limit | hidden from everyone | **becomes the public print** |
| `Midpoint` | `(bid.limit + ask.limit) / 2` | hidden from the public | hidden from the public |

**We deploy `Midpoint.`** It is the classic crossing-network peg, and it means the published
price equals *neither* limit — so neither desk's limit is disclosed to the market.

The honest caveat, which belongs in any conversation about this: the *counterparty* can derive
the other side's limit from the midpoint plus its own. Midpoint protects both desks from the
market; it does not protect either desk from the one entity it already chose to trade with. In a
real venue the peg would reference an external mid, not the two orders. That is a liquidity
question, not a protocol one.

`Midpoint` truncates: integer division loses at most one unit of the quote's smallest
denomination, in the buyer's favour.

---

## 4. ACLs: three distinct permissions

Nox's `NoxCompute` distinguishes permissions that are easy to conflate:

| Call | Grants | Used for |
|---|---|---|
| `allow(handle, account)` | **admin** — compute on the handle, and re-grant | persistent contract access |
| `allowThis(handle)` | admin, for `address(this)` | what a contract needs to reuse a handle in a *later* transaction |
| `addViewer(handle, account)` | **viewer** — decrypt, but not re-grant | a desk reading its own order; an auditor grant |
| `allowPublicDecryption(handle)` | anyone may decrypt | exactly three handles per match |

Two ordering facts are load-bearing and neither is obvious:

- `Nox.fromExternal` grants only **transient** access, valid for the current transaction. Without
  a matching `allowThis` in the same transaction, the handle is permanently unusable afterwards —
  `proposeMatch` would revert in a later block.
- `addViewer` itself requires the caller to already be allowed. So the order inside
  `submitOrder` must be `allowThis` first, `addViewer` second.

`ZerkBook.submitOrder` therefore does, for each of the three handles:

```solidity
Nox.allowThis(handle);              // contract can compute on it in a later tx
Nox.addViewer(handle, msg.sender);  // the desk, and only the desk, can read it
```

`grantAuditor(orderId, auditor)` adds one more viewer, per order, per address. Nothing becomes
public; the grant is recorded on-chain and independently checkable through `Nox.isViewer`, which
is what `ZerkBook.canView` and the `/auditor` page surface.

Only three handles per match are ever opened to public decryption: `crossed`, `fillSize` and
`fillPrice`. The limits are never among them, on any code path.

---

## 5. The Seaport integration

Seaport supports restricted orders (`FULL_RESTRICTED` / `PARTIAL_RESTRICTED`). When one is
fulfilled, Seaport calls the order's designated **zone** twice: `authorizeOrder` **before** any
token transfers, and `validateOrder` **after** them. If either reverts, or fails to return the
expected magic value, the entire fulfilment reverts.

`zoneHash` is an arbitrary 32-byte value baked into the order at signing and handed to the zone at
fulfilment. **Zerk puts the match id in it.**

The consequence: a Seaport order is *unfillable* unless `ZerkBook` has approved that exact match.
Nobody can front-run the settlement, replay it, or fulfil an order the TEE didn't authorise — and
Seaport is untouched, running at its canonical address.

### Amount binding

Approving a match id is not sufficient on its own: a fulfiller could present a valid match id
alongside an order that moves the wrong amounts. `ZerkZone._requireAmountsMatch` closes that gap
by reading the approved fill back from the book and checking the items:

- **RWA holder is the offerer** — `offer` base amount must **equal** `fillSize`; `consideration`
  quote total must be **at least** the notional.
- **Cash holder is the offerer** — `offer` quote amount must **equal** the notional;
  `consideration` base total must be **at least** `fillSize`.

`notional = fillSize × fillPrice / 10^baseDecimals`.

Orders must be signed `FULL_RESTRICTED`. Under `PARTIAL_RESTRICTED` Seaport scales item amounts by
the fill fraction, which would no longer equal the exact approved fill.

### Why the zone is `view` on the pre-hook

`authorizeOrder` only reads. Declaring it `view` is a strictly narrower mutability than the
interface requires, which Solidity permits, and it makes the pre-transfer gate obviously
side-effect-free. All state change happens in `validateOrder`, after the transfers, where
`consumeMatch` burns the match and prevents replay.

---

## 6. The blind matcher

`matcher/index.ts` holds no viewer grant on any handle, so it cannot read a side, a size or a
limit. It:

1. reads `openOrderIds()`,
2. picks an untried **ordered** pair — it tries both `(a,b)` and `(b,a)` precisely because it
   cannot tell a bid from an ask,
3. calls `proposeMatch`, which locks both orders while the enclave works,
4. polls the gateway for decryption proofs, and relays them via `finalizeMatch`.

If it pairs badly, the TEE returns "no cross", both orders go back to resting, and nothing is
revealed. If it pairs well, the TEE produces a fill and the keeper's only remaining job is to
relay proofs the contract verifies for itself.

This is why "isn't your keeper a trusted party?" has a real answer rather than a hopeful one: the
keeper is trusted for **liveness**, and for nothing else. Anyone can run one, and a second one
changes only how fast pairs get tried.

Its O(n²) sweep is fine at demo scale. The production answer is batched proposals or an encrypted
sort inside the TEE.

---

## 7. Contract reference

### `ZerkRWA.sol`

Permissioned ERC-20 standing in for a tokenized T-bill. ERC-3643-lite: one allowlist checked in
`_update`, with mint and burn carved out so the float can be issued at all.

### `ZerkBook.sol`

| Function | Caller | Effect |
|---|---|---|
| `submitOrder(...)` | desk | validates three input proofs, stores handles, grants the desk viewer rights |
| `cancelOrder(id)` | desk | `Cancelled`. Terms are never decrypted — a cancelled order's price stays secret permanently |
| `grantAuditor(id, addr)` | desk | adds one viewer to that order's three handles |
| `proposeMatch(bid, ask)` | anyone | branchless crossing in the TEE; locks both orders; opens exactly three result handles |
| `finalizeMatch(id, ×3 proofs)` | anyone | verifies KMS proofs; on a cross writes fill terms, otherwise reopens both orders and reveals nothing |
| `isApprovedMatch(id)` | zone | `approved && !consumed` |
| `fillTerms(id)` | zone | plaintext size, price, notional |
| `consumeMatch(id)` | zone only | marks settled; prevents replay |

### `ZerkZone.sol`

`authorizeOrder` (pre-transfer, `view`) and `validateOrder` (post-transfer). Both reject any
caller that is not Seaport.

---

## 8. Deployability

Nothing is hardcoded to the demo asset. `ZerkBook` takes its base token, quote token, base
decimals and pricing rule at construction, so the same bytecode serves any ERC-20 or ERC-3643
pair. `ZerkZone` takes the book and the Seaport address. Deploying a second venue for a different
instrument is two transactions and no new code.
