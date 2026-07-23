# ZERK — Build Document

**WTF Hackathon (Write The Future, Summer Edition) — iExec / Nox**

> **Zerk** is a confidential crossing network for tokenized real-world assets. Desks submit encrypted orders, matching runs inside a TEE, and crossed trades settle atomically through unmodified Seaport on Ethereum Sepolia.

---

## 0. TL;DR

| | |
|---|---|
| **What you're building** | A dark-pool-style venue for permissioned RWA tokens |
| **Protocol integrated (unmodified)** | Seaport 1.6, via its official zone extension point |
| **Privacy layer** | Nox — encrypted handles, TEE compute, on-chain ACLs |
| **Chain** | Ethereum Sepolia |
| **Contracts** | `ZerkBook.sol`, `ZerkZone.sol`, `ZerkRWA.sol` |
| **Off-chain** | A blind matcher keeper + Next.js front-end |
| **The one-sentence pitch** | *Zerk never reveals a limit price, an unfilled order, or a resting size — it reveals executed fills only, which is the same disclosure regime as a regulated crossing network.* |

---

## 1. The problem

RWA tokenization is scaling fast, and iExec's own documentation names the reason institutions hesitate: on a public chain, every balance and every transfer is a matter of public record. Their RWA use-case page frames this for **issuance** — investor allocations leak competitive intelligence, redemption flows read as distress signals, LP identities can be inferred and poached.

That framing stops at the primary market. **The secondary market has the same disease and nobody has treated it.**

When a desk wants to move size in a tokenized T-bill, private credit note, or fund share, three things leak:

| Leak | Consequence |
|---|---|
| **Pre-trade intent** — the order is visible before it fills | The market moves against you before you're done |
| **Post-trade attribution** — counterparty pairs are legible forever | Competitors reconstruct your book and your strategy |
| **Flow patterns** — a consistent seller is identifiable | Your positioning becomes public signal |

The result isn't that institutions trade badly on-chain. It's that **they don't trade size on-chain at all.**

Traditional finance solved this decades ago with crossing networks and dark pools — venues that match institutional orders without pre-trade display, then report after execution. A large share of institutional equity volume trades this way.

> **Before you use this in the video:** find and cite one real, sourced statistic on off-exchange share of institutional volume. Don't guess a number on camera.

**Zerk is that venue, for tokenized RWAs, on a public chain.**

---

## 2. The privacy boundary

Be explicit about this in the video and the README. Do not let a judge discover it by asking.

| | Confidential, forever | Revealed at settlement |
|---|---|---|
| Limit prices | ✅ | never |
| Orders that never cross | ✅ | never |
| Resting size before a fill | ✅ | never |
| Which desk is shopping | ✅ | never |
| The matching process itself | ✅ | never |
| Executed fill size and price | | ✅ |
| The settlement transfer | | ✅ |
| Auditor / regulator view | ACL-gated, selective | |

**The defence is market structure, not hand-waving.** Regulated dark pools are pre-trade opaque and post-trade transparent by design. Zerk hides *intent*, not *outcome*. Critically: even when an order crosses, **your limit price is never revealed** — only the executed price. That is exactly what a crossing network gives an institutional desk, and it's a sharper claim than "private swaps."

If pushed on why settlement amounts are visible: Nox ships a documented ERC-20 → ERC-7984 wrapper, so wrapping both legs as confidential tokens hides amounts too. **Say it's the next milestone. Do not build it during the hackathon.**

---

## 3. How Nox actually works — and the constraint that shapes everything

Read this before you design a single function. Nox is **asynchronous**, and if you design as though it isn't, you will rewrite the contract on day three.

Nox coordinates six components: on-chain smart contracts, an event listener (**Ingestor**), a message queue (NATS), a computation engine (**Runner**, the attested TEE), an encrypted data store (**Handle Gateway**), and a **KMS**. Every confidential computation runs in three phases: **input → compute → output.**

**Input.** The user encrypts a value off-chain via the JS SDK. The Handle Gateway encrypts it with ECIES under the KMS public key, stores the ciphertext off-chain, and returns a **handle** — an opaque 32-byte identifier. Your contract only ever holds handles. Plaintext never touches the chain.

**Compute.** Your contract calls a Nox operation on handles. The Ingestor picks the event up, queues it, and a Runner executes it inside the TEE. Result handles are deterministic: derived from the operator, input handles, contract address, caller, timestamp, and output index.

**Output.** Decryption is delegated to the client. Each KMS node computes a partial re-encryption share under threshold ECIES with Shamir secret sharing; the shares are reassembled client-side. The KMS never sees plaintext, and no single node can decrypt alone.

### What this means for Zerk

1. **`submitOrder` cannot return a match.** Matching is a separate transaction whose result lands later. Design for a three-step lifecycle: submit → propose → finalise.
2. **You cannot `if (encryptedA > encryptedB)` in Solidity.** Use Nox's `comparisons` and `select` primitives to compute branchlessly, then decrypt only the specific value you need.
3. **`publicDecrypt` is your settlement primitive.** It's how a fill size and price become plaintext at exactly the moment Seaport needs them, and not one moment earlier.
4. **The demo has latency.** There is real time between submit and match. Script around it — narrate, or cut. Don't leave dead air in a 4-minute video.

### Nox surface you'll use

| Layer | Thing | Used for |
|---|---|---|
| JS SDK | `encryptInput` | Desk encrypts side / size / limit before submitting |
| JS SDK | `decrypt` | Desk reads back its own orders and fills |
| JS SDK | `publicDecrypt` | Revealing fill terms at settlement |
| JS SDK | `viewACL` | Auditor panel — proving who can see what |
| Solidity | `fromExternal` | Taking encrypted user inputs into the contract |
| Solidity | `comparisons`, `select` | Branchless crossing logic inside the TEE |
| Solidity | Access control methods | Granting the counterparty and the auditor view rights |

> ⚠️ The Nox docs are marked *under development*. Confirm exact type names and signatures against `docs.noxprotocol.io` before writing code, and log every gap you hit — that's `feedback.md` material worth two stars.

---

## 4. How Seaport zones actually work

This is the integration, and it's the cleanest possible answer to "don't modify the underlying protocol."

Seaport supports **restricted orders** (`FULL_RESTRICTED` / `PARTIAL_RESTRICTED`). When one is fulfilled, Seaport calls the order's designated **zone** contract twice: `authorizeOrder` **before** any token transfers, and `validateOrder` **after** them. The zone runs whatever custom logic it likes; if it reverts, or fails to return the expected magic value, the entire fulfilment reverts. New zones can be deployed permissionlessly to extend Seaport's feature set.

Both calls receive a `ZoneParameters` struct:

```solidity
struct ZoneParameters {
    bytes32        orderHash;
    address        fulfiller;
    address        offerer;
    SpentItem[]    offer;
    ReceivedItem[] consideration;
    bytes          extraData;
    bytes32[]      orderHashes;
    uint256        startTime;
    uint256        endTime;
    bytes32        zoneHash;
}
```

### The binding trick

`zoneHash` is an arbitrary 32-byte value baked into the order at creation and handed to the zone at fulfilment. **Put the Zerk match ID in it.**

The consequence: a Seaport order is *unfillable* unless `ZerkBook` has approved that exact match. Nobody can front-run the settlement, replay it, or fulfil an order the TEE didn't authorise — and Seaport itself is untouched, running at its canonical address.

That's the whole integration story, and it fits in one sentence for the video.

**Sepolia addresses (same as mainnet — Seaport is CREATE2-deployed):**

| Contract | Address |
|---|---|
| Seaport 1.6 | `0x0000000000000068F116a894984e2DB1123eB395` |
| Seaport 1.5 | `0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC` |
| ConduitController | `0x00000000F9490004C11Cef243f5400493c00Ad63` |

Use **Seaport 1.6** — `authorizeOrder` was added to the zone interface in 1.6, and the pre-transfer hook is what you want. With `conduitKey = bytes32(0)`, offerers approve Seaport directly and you skip conduit setup entirely. Do that.

---

## 5. System architecture

```
┌────────────────────────────────────────────────────────────────┐
│  web/  (Next.js)                                               │
│    /desk      Desk A │ Desk B  — submit + decrypt own orders   │
│    /public    what the chain actually shows                    │
│    /auditor   ACL-granted regulator view                       │
└───────────────────────────┬────────────────────────────────────┘
                            │ encryptInput()   [Nox JS SDK]
                            ▼
┌────────────────────────────────────────────────────────────────┐
│  ZerkBook.sol            — Nox confidential contract           │
│    • orders stored as handles (side, size, limit)              │
│    • proposeMatch() runs comparisons + select inside the TEE   │
│    • finalizeMatch() publicDecrypts fill terms only            │
│    • approvedMatches[matchId] = true                           │
│    • ACL grants: owner → counterparty on fill → auditor        │
└───────────────────────────┬────────────────────────────────────┘
                            │ matchId
                            ▼
┌────────────────────────────────────────────────────────────────┐
│  ZerkZone.sol            — Seaport zone (restricted orders)     │
│    authorizeOrder()  → require(book.isApprovedMatch(zoneHash))  │
│    validateOrder()   → book.consumeMatch(zoneHash)              │
└───────────────────────────┬────────────────────────────────────┘
                            ▼
┌────────────────────────────────────────────────────────────────┐
│  Seaport 1.6 — UNMODIFIED, canonical Sepolia address            │
│    atomic DvP: ZerkRWA ↔ USDC                                   │
└───────────────────────────┬────────────────────────────────────┘
                            ▼
     ZerkRWA.sol (permissioned ERC-20)  +  Sepolia USDC

  ┌──────────────────────────────────────────────────────────┐
  │  matcher/  — blind keeper. Pairs candidate order IDs and  │
  │  calls proposeMatch(). Never sees order contents; the TEE │
  │  decides. Trustless with respect to privacy.              │
  └──────────────────────────────────────────────────────────┘
```

**The matcher is blind, and that's a feature.** It pairs order IDs without knowing what's in them and lets the TEE decide whether they cross. Say this out loud in the video — it pre-empts "isn't your keeper a trusted party?"

---

## 6. Repo structure

```
zerk/
├── contracts/
│   ├── ZerkBook.sol           # Nox confidential order book
│   ├── ZerkZone.sol           # Seaport zone
│   ├── ZerkRWA.sol            # permissioned ERC-20 (ERC-3643-lite)
│   └── interfaces/
│       ├── IZerkBook.sol
│       └── ISeaportZone.sol
├── script/
│   ├── 01_deploy_tokens.ts
│   ├── 02_deploy_book.ts
│   ├── 03_deploy_zone.ts
│   └── 04_allowlist_and_approve.ts
├── test/
│   ├── ZerkBook.match.t.ts
│   ├── ZerkZone.gating.t.ts
│   └── e2e.sepolia.t.ts
├── matcher/
│   ├── index.ts               # blind pairing keeper
│   └── seaport-order.ts       # builds restricted orders
├── web/
│   ├── app/desk/
│   ├── app/public/
│   ├── app/auditor/
│   └── lib/nox.ts             # SDK wrapper
├── docs/
│   ├── ARCHITECTURE.md
│   └── DEPLOYMENT.md
├── feedback.md                # ⭐⭐ — write this from day one
└── README.md
```

Start from the **Nox Hardhat starter** (`github.com/iExec-Nox/nox-hardhat-starter`) rather than a bare Hardhat project. It wires the plugin and config for you and saves an afternoon.

---

## 7. Contract specs

### 7.1 `ZerkRWA.sol` — the asset

A permissioned ERC-20 standing in for a tokenized T-bill. ERC-3643-lite: an allowlist checked in `_update`.

```solidity
contract ZerkRWA is ERC20, Ownable {
    mapping(address => bool) public permitted;

    event Permitted(address indexed account, bool status);

    function setPermitted(address account, bool status) external onlyOwner {
        permitted[account] = status;
        emit Permitted(account, status);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0)) require(permitted[from], "ZERK: sender not permitted");
        if (to   != address(0)) require(permitted[to],   "ZERK: recipient not permitted");
        super._update(from, to, value);
    }
}
```

**Allowlist Seaport itself**, or fulfilment will revert on the transfer. This is the single most likely thing to eat an hour on demo day. Write it in `DEPLOYMENT.md` now.

Full ERC-3643 / T-REX is stretch scope. This is enough to make the "permissioned asset can't touch an AMM" argument credible.

### 7.2 `ZerkBook.sol` — the confidential order book

The heart of the build. Sketch below is structural — **confirm Nox types and signatures against the docs.**

```solidity
contract ZerkBook {
    enum Status { Open, Matched, Settled, Cancelled }

    struct Order {
        address desk;
        bytes32 hSide;      // Nox handle — 0 = bid, 1 = ask
        bytes32 hSize;      // Nox handle
        bytes32 hLimit;     // Nox handle
        Status  status;
    }

    struct Match {
        uint256 bidId;
        uint256 askId;
        bytes32 hCrossed;   // encrypted bool
        bytes32 hFillSize;
        bytes32 hFillPrice;
        uint256 fillSize;   // plaintext, set at finalise
        uint256 fillPrice;  // plaintext, set at finalise
        bool    approved;
        bool    consumed;
    }

    mapping(uint256 => Order)  public orders;
    mapping(bytes32 => Match)  public matches;   // key = matchId = zoneHash

    event OrderSubmitted(uint256 indexed orderId, address indexed desk);
    event MatchProposed(bytes32 indexed matchId);
    event MatchApproved(bytes32 indexed matchId, uint256 fillSize, uint256 fillPrice);
    event MatchSettled(bytes32 indexed matchId);
```

**`submitOrder(externalSide, externalSize, externalLimit, proof)`**
Converts external encrypted inputs into handles via `fromExternal`, stores the order, grants the desk ACL read on its own handles, emits `OrderSubmitted`. Returns `orderId`. **Emits nothing about contents.**

**`cancelOrder(orderId)`**
Desk-only. Sets `Status.Cancelled`. The handles are never decrypted — a cancelled order's terms stay secret forever. Worth one line in the video.

**`proposeMatch(bidId, askId)`**
Callable by anyone (the blind matcher). Inside, using Nox primitives:

```
crossed    = ge(bidLimit, askLimit) AND isBid(bidSide) AND isAsk(askSide)
fillSize   = select(crossed, min(bidSize, askSize), 0)
fillPrice  = select(crossed, askLimit, 0)          // or midpoint
```

Stores the result handles, emits `MatchProposed`. Compute is async — results land shortly after.

> **Design note:** using `select` rather than branching means a failed match is computationally indistinguishable from a successful one until you decrypt. A rejected proposal leaks nothing about *why* it failed. Call this out — it's the kind of detail that reads as competence.

**`finalizeMatch(matchId)`**
`publicDecrypt`s `hCrossed`. If false, mark the orders open again and stop — **and reveal nothing**. If true, `publicDecrypt` `hFillSize` and `hFillPrice` only, write them to plaintext storage, set `approved = true`, emit `MatchApproved`. Limits are never decrypted.

**`isApprovedMatch(bytes32 matchId) → bool`**
View. Called by `ZerkZone.authorizeOrder`. Returns `approved && !consumed`.

**`consumeMatch(bytes32 matchId)`**
Zone-only. Sets `consumed = true`, orders to `Settled`, emits `MatchSettled`. Prevents replay.

**`grantAuditor(address auditor, uint256 orderId)`**
Grants ACL view on that order's handles to a regulator address. This is the selective-disclosure demo beat — cheap to build, and it's the thing that makes "institutional" credible rather than aspirational.

### 7.3 `ZerkZone.sol` — the Seaport plug

Small, boring, and load-bearing. This is real Seaport interface code:

```solidity
contract ZerkZone {
    IZerkBook public immutable book;
    address   public immutable seaport;

    constructor(address _book, address _seaport) {
        book = IZerkBook(_book);
        seaport = _seaport;
    }

    // Called by Seaport BEFORE any token transfers
    function authorizeOrder(ZoneParameters calldata zp)
        external
        view
        returns (bytes4)
    {
        require(msg.sender == seaport, "ZERK: not seaport");
        require(book.isApprovedMatch(zp.zoneHash), "ZERK: match not approved");
        return this.authorizeOrder.selector;
    }

    // Called by Seaport AFTER token transfers
    function validateOrder(ZoneParameters calldata zp)
        external
        returns (bytes4)
    {
        require(msg.sender == seaport, "ZERK: not seaport");
        book.consumeMatch(zp.zoneHash);
        return this.validateOrder.selector;
    }
}
```

Optionally verify `zp.offer` / `zp.consideration` amounts against the stored `fillSize` / `fillPrice`. Worth the twenty lines — it closes the gap where a fulfiller submits a valid `matchId` with wrong amounts, and it's a good answer if a judge probes the trust model.

---

## 8. Order lifecycle, end to end

| # | Actor | Action | What the chain sees |
|---|---|---|---|
| 1 | Desk A | Encrypts *buy 500k @ 99.20* via SDK | nothing yet |
| 2 | Desk A | `submitOrder(handles)` | `OrderSubmitted(1, deskA)` — three opaque handles |
| 3 | Desk B | Encrypts *sell 400k @ 99.10*, submits | `OrderSubmitted(2, deskB)` |
| 4 | Matcher | `proposeMatch(1, 2)` — blind | `MatchProposed(matchId)` |
| 5 | Nox | Ingestor → Runner → TEE computes crossing | nothing readable |
| 6 | Matcher | `finalizeMatch(matchId)` | `MatchApproved(matchId, 400000, 99.10)` |
| 7 | Desk B | Signs a `FULL_RESTRICTED` Seaport order, `zone = ZerkZone`, `zoneHash = matchId` | nothing — orders are signed off-chain |
| 8 | Desk A | `fulfillAdvancedOrder` on Seaport 1.6 | Seaport → `authorizeOrder` → transfers → `validateOrder` |
| 9 | — | Settled | one atomic swap; **no limit prices anywhere** |

Steps 1–6 reveal nothing except that *some* order existed and *some* match crossed at a size and price. Desk A's willingness to pay 99.20 is never published. If steps 4–5 had failed to cross, **nothing at all would have been revealed** — the orders would simply still be resting.

---

## 9. Front-end spec

Three routes. Resist adding a fourth.

**`/desk`** — desk selector (A / B), order entry (side, size, limit), and a blotter of your own orders with client-side `decrypt`. The blotter is the proof that *you* can read your orders and nobody else can.

**`/public`** — the money shot. A live feed of what the chain actually exposes: order IDs, handles, event logs, and the settlement tx. Render the raw handles as hex. Judges should be able to stare at it and find nothing.

**`/auditor`** — connect as the regulator address. Before the grant: decrypt fails. After `grantAuditor`: the same field resolves. Show both states. That contrast *is* the selective-disclosure argument.

Deploy on Vercel. Hosting is covered by the prize for a year, so keep it up after judging.

---

## 10. Deployment sequence (Sepolia)

1. Confirm the `NoxCompute` address for Sepolia on the Nox Networks page (it renders client-side, so open it in a browser).
2. Deploy `ZerkRWA`; mint the float to Desk B.
3. Fund Desk A with Sepolia USDC.
4. Deploy `ZerkBook`, wired to `NoxCompute`.
5. Deploy `ZerkZone(book, 0x0000000000000068F116a894984e2DB1123eB395)`.
6. Allowlist Desk A, Desk B, **and Seaport** on `ZerkRWA`.
7. Approve Seaport on both tokens from both desks (`conduitKey = bytes32(0)`).
8. Deploy `web/` to Vercel; deploy `matcher/` anywhere it can hold an RPC connection.
9. Verify every contract on Sepolia Etherscan. Verified source costs ten minutes and makes the repo look finished.

---

## 11. Build milestones

The deadline is still unknown, so these are phases, not dates. **Do not start phase N+1 until phase N runs on Sepolia.**

| Phase | Goal | Done when |
|---|---|---|
| **0** | Validate + scaffold | Idea posted in the WTF Discord channel; Nox Hardhat starter deploys a hello-world confidential contract to Sepolia |
| **1** | Assets | `ZerkRWA` deployed, allowlist works, both desks hold balances |
| **2** | Confidential book | `submitOrder` stores handles; desk decrypts its own order in the browser |
| **3** | Matching | `proposeMatch` + `finalizeMatch` produce a correct fill from encrypted inputs. **This is the risk phase — budget double.** |
| **4** | Settlement | One real Seaport fulfilment gated by `ZerkZone`, tx hash in hand |
| **5** | Front-end | Three routes working against Sepolia, no mocks |
| **6** | Auditor | ACL grant demo working both ways |
| **7** | Submission | README, docs, `feedback.md`, video, X post |

**Phase 3 is where this project lives or dies.** If it isn't working with real time left, execute the fallback in §16.

---

## 12. Testing plan

- **Unit (local):** matching logic against known plaintext — crossed, not crossed, partial, equal limits, zero size.
- **Integration (Sepolia fork):** `ZerkZone` gating. Assert that fulfilment **reverts** with an unapproved `zoneHash`, and reverts again on replay after `consumeMatch`.
- **E2E:** two browser profiles, two wallets, full lifecycle.
- **The privacy test — do this on camera.** After settlement, pull the raw calldata and logs for every Zerk transaction and grep for the limit price. It must not appear. Thirty seconds of video, and it converts your privacy claim from an assertion into a demonstration.

---

## 13. Rubric mapping

| Criterion | Weight | How Zerk satisfies it | Risk |
|---|---|---|---|
| Project creativity | ⭐⭐⭐ | Secondary-market privacy — iExec's own RWA docs stop at issuance. You're filling a gap they identified but didn't build. | **Medium.** RWA and OTC were both VIBE categories. Lead with the crossing-network framing, never "RWA platform." |
| Works end-to-end, **no mock data** | ⭐⭐⭐ | Real Sepolia deploys, real Seaport fulfilment, real USDC, real tx hashes | **High — this is where submissions die.** Never fake a fill, not even in the video. |
| Deployed on ETH Sepolia | ⭐⭐ | Everything on Sepolia; Seaport already there | Low. Confirm the Nox Sepolia address first. |
| `feedback.md` | ⭐⭐ | Written during the build, while friction is fresh | Low. **Free points** — most teams write three lines of flattery the night before. Write real friction. |
| Video ≤ 4 min | ⭐⭐ | Script in §14 | Low, but a hard cap. Land at 3:50. |
| Nox technical implementation | ⭐ | Handles, TEE matching via `select`, ACL selective disclosure | Low |
| UX | ⭐ | Three-panel desk view; `/public` *is* the UX argument | Low |

**The brief's own judging line** — *"how cleanly Nox integrates into the app, the privacy it adds, and how close the result is to something a company can deploy"*:

- **Cleanly:** Seaport's official zone extension point. Zero forks, canonical address.
- **Privacy added:** limits and unfilled orders never revealed; auditor-grade selective disclosure.
- **Deployable:** works for any ERC-20 or ERC-3643 pair. Nothing hardcoded to the demo asset.

---

## 14. Demo video script (4:00 hard cap)

Two stars ride on this file, and the X post is the entire public surface of your submission. Script it. Don't improvise.

| Time | Beat |
|---|---|
| 0:00–0:25 | **Problem.** A large order sitting visible on a public venue. *"This is why desks don't trade size on-chain."* |
| 0:25–0:45 | **What Zerk is.** One sentence, then the stack diagram. |
| 0:45–1:50 | **Live.** Desk A submits a bid — cut to Etherscan, three opaque handles, nothing readable. Desk B submits an ask. Match fires. |
| 1:50–2:30 | **Settlement.** Seaport fulfilment on Sepolia. Point at the canonical address: *unmodified, not a fork.* Zone gated it. |
| 2:30–3:00 | **The privacy test.** Grep the calldata for the limit price. Not there. |
| 3:00–3:25 | **Auditor.** Grant ACL view; regulator decrypts the fill. Compliance without publicity. |
| 3:25–3:50 | **Why it's deployable.** Any ERC-20 pair, Seaport untouched, no new rail. |

---

## 15. Submission

### `feedback.md` (⭐⭐ — outline it now, fill it as you go)

```markdown
# Feedback on iExec Nox
## Setup
Time to first deployed confidential contract; what the starter got right/wrong.
## SDK ergonomics
encryptInput / decrypt / publicDecrypt — what surprised me.
## The async model
Where I expected synchronous returns and had to redesign.
## Documentation gaps
Specific pages, specific missing signatures. Be precise; be useful.
## What worked
Genuine wins — handles + ACL as a combined primitive.
## What I'd want next
Ranked, with a reason for each.
```

Be specific and unflattering. Vague praise is worth nothing; a precise bug report is worth two stars and buys goodwill with the people scoring you.

### X post

Tag **@iEx_ec**. Structure: hook (the problem in one line) → what Zerk is → demo video → repo link → one line on the Seaport zone integration, because that's the differentiator. Write it as a thread, not a drop.

### Checklist

- [ ] Public GitHub repo, complete open-source code
- [ ] README with install + usage
- [ ] Docs for setup, deployment, and usage
- [ ] Functional front-end
- [ ] `feedback.md` committed
- [ ] Demo video ≤ 4 minutes
- [ ] Everything on Sepolia, no mock data
- [ ] **Existing work vs. hackathon work declared** (required if any BlindPay code carries over)
- [ ] Joined iExec Discord, WTF channel
- [ ] X post published: description + video + repo, tagging @iEx_ec

---

## 16. Risks, and the fallback

| Risk | Mitigation |
|---|---|
| Nox async model forces a contract redesign | §3 — designed for it from the start |
| `proposeMatch` compute doesn't land reliably | Phase 3 is time-boxed with double budget; test on Sepolia early |
| Seaport reverts on `ZerkRWA` transfer | Allowlist Seaport. Written into `DEPLOYMENT.md` |
| Nox docs incomplete | Ask in Discord early; every gap is `feedback.md` content |
| Blind matcher is O(n²) | Fine at demo scale. Honest answer: batch proposals / encrypted sort in TEE |
| Two-desk anonymity set | Don't overclaim. The claim is pre-trade non-display, which holds at n=2 |

**The fallback.** If two-sided matching or the zone integration fights you, strip the second side and ship a **single-sided confidential conditional order**: one encrypted trigger, TEE evaluation, same Seaport settlement path. Same contracts, one less moving part, still a complete and honest submission. Decide late — but decide before you're out of time, not after.

---

## 17. Judge Q&A

**"Settlement is still public — what's actually private?"**
Limits, unfilled orders, and resting sizes — permanently. Executed fills are reported, exactly as a regulated dark pool does. Intent, not outcome.

**"Your anonymity set is two desks."**
True in a demo, and I won't pretend otherwise. The claim is pre-trade non-display, which holds at n=2. Position-level anonymity needs volume — a liquidity problem, not a protocol one.

**"Isn't this CoWSwap / a batch auction?"**
CoW batches publicly for MEV protection and price improvement. Zerk's orders are never published at all, and it targets permissioned assets that can't touch an AMM in the first place.

**"Isn't your matcher a trusted party?"**
No. It pairs order IDs blind and never sees contents. The TEE decides whether they cross. Anyone can run one.

**"Who's your first customer?"**
Tokenization platforms that already have a holder base and no secondary venue. You sell to the issuer; their holders come with them.

**"Why Seaport instead of your own escrow?"**
Because building a rail is exactly what the brief said not to do, and because Seaport's settlement logic is audited in ways a hackathon contract never will be.

---

## 18. Open items

1. **Find the deadline.** It's in the timeline strip at the top of the DoraHacks page, not the body text. The scope above assumes real time.
2. **Confirm Nox on Sepolia** and get the `NoxCompute` address.
3. **Validate the idea with iExec first.** The brief explicitly invites it: *"you can validate your project idea with us anytime."* Post in the WTF Discord channel before writing code. Free de-risking, and the organisers know your name before they judge.
4. **Decide the BlindPay question.** Reuse is permitted — only VIBE Coding Hackathon projects are disqualifying — but it must be declared, and creativity is scored on what's new.
5. **Confirm Nox Solidity type names** before phase 2. The docs are under active development.
