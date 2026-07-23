# Zerk

**A confidential crossing network for tokenized real-world assets.**

Desks submit encrypted orders, matching runs inside a TEE, and crossed trades settle atomically
through **unmodified Seaport** on Ethereum Sepolia.

> Zerk never reveals a limit price, an unfilled order, or a resting size — it reveals executed
> fills only, which is the same disclosure regime as a regulated crossing network.

Built for the **WTF Hackathon (Write The Future, Summer Edition)** — iExec / Nox.

---

## The problem

RWA tokenization is scaling, and iExec's own RWA documentation names the reason institutions
hesitate: on a public chain, every balance and every transfer is a matter of public record. That
framing stops at **issuance**. The **secondary market** has the same disease and nobody has
treated it.

When a desk wants to move size in a tokenized T-bill, private credit note or fund share, three
things leak:

| Leak | Consequence |
|---|---|
| **Pre-trade intent** — the order is visible before it fills | The market moves against you before you're done |
| **Post-trade attribution** — counterparty pairs are legible forever | Competitors reconstruct your book and your strategy |
| **Flow patterns** — a consistent seller is identifiable | Your positioning becomes public signal |

The result isn't that institutions trade badly on-chain. It's that **they don't trade size
on-chain at all.**

Traditional finance solved this decades ago with crossing networks and dark pools. Zerk is that
venue, for tokenized RWAs, on a public chain.

---

## The privacy boundary

| | Confidential, forever | Revealed at settlement |
|---|:---:|:---:|
| Limit prices | ✅ | never |
| Orders that never cross | ✅ | never |
| Resting size before a fill | ✅ | never |
| Which desk is shopping | ✅ | never |
| The matching process itself | ✅ | never |
| Executed fill size and price | | ✅ |
| The settlement transfer | | ✅ |
| Auditor / regulator view | ACL-gated, selective | |

The defence is market structure, not hand-waving. Regulated dark pools are pre-trade opaque and
post-trade transparent **by design**. Zerk hides *intent*, not *outcome*. Critically: even when an
order crosses, **the limit price is never revealed** — only the executed price.

Settlement amounts are visible because both legs settle as standard ERC-20s. Nox ships a
documented ERC-20 → ERC-7984 wrapper; wrapping both legs as confidential tokens would hide
amounts too. That is the next milestone, and it is deliberately **not** part of this build.

---

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│  web/  (Next.js)                                               │
│    /         landing                                           │
│    /desk     submit + decrypt your own orders                  │
│    /public   what the chain actually shows                     │
│    /auditor  ACL-granted regulator view                        │
└───────────────────────────┬────────────────────────────────────┘
                            │ encryptInput()   [Nox JS SDK]
                            ▼
┌────────────────────────────────────────────────────────────────┐
│  ZerkBook.sol            — Nox confidential contract           │
│    • orders stored as handles (side, size, limit)              │
│    • proposeMatch() runs comparisons + select inside the TEE   │
│    • finalizeMatch() verifies KMS proofs, reveals fill only    │
│    • ACL grants: desk → auditor, per order                     │
└───────────────────────────┬────────────────────────────────────┘
                            │ matchId  ==  zoneHash
                            ▼
┌────────────────────────────────────────────────────────────────┐
│  ZerkZone.sol            — Seaport zone (restricted orders)    │
│    authorizeOrder()  → require(book.isApprovedMatch(zoneHash)) │
│                       + amounts must equal the approved fill   │
│    validateOrder()   → book.consumeMatch(zoneHash)             │
└───────────────────────────┬────────────────────────────────────┘
                            ▼
┌────────────────────────────────────────────────────────────────┐
│  Seaport 1.6 — UNMODIFIED, canonical Sepolia address           │
│    atomic DvP: ZerkRWA ↔ USDC                                  │
└───────────────────────────┬────────────────────────────────────┘
                            ▼
     ZerkRWA.sol (permissioned ERC-20)  +  Sepolia USDC

  ┌──────────────────────────────────────────────────────────┐
  │  matcher/  — blind keeper. Pairs candidate order IDs and  │
  │  calls proposeMatch(). Never sees order contents; the TEE │
  │  decides. Trustless with respect to privacy.              │
  └──────────────────────────────────────────────────────────┘
```

**The matcher is blind, and that's a feature.** It pairs order ids without knowing what is in
them and lets the TEE decide whether they cross. Anyone can run one.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full design, including why the crossing
predicate is branchless.

---

## Repo layout

```
zerk/
├── contracts/
│   ├── ZerkBook.sol           # confidential order book (Nox)
│   ├── ZerkZone.sol           # Seaport zone
│   ├── ZerkRWA.sol            # permissioned ERC-20 (ERC-3643-lite)
│   ├── interfaces/
│   └── test/MockZerkBook.sol  # test double, never deployed live
├── script/                    # 01…04 deploy sequence + sync-abi
├── test/                      # 50 local tests + a Sepolia e2e
├── matcher/                   # blind keeper + Seaport order builder
├── web/                       # Next.js front-end
├── docs/
│   ├── ARCHITECTURE.md
│   └── DEPLOYMENT.md
├── feedback.md                # friction log written during the build
└── README.md
```

---

## Quick start

```bash
git clone <this repo> && cd zerk
npm install
cp .env.example .env          # fill in RPC + keys
npm run build                 # compile contracts
npm test                      # 50 local tests, no network needed
```

### Deploy to Sepolia

```bash
npm run deploy:tokens         # ZerkRWA + mint the float to Desk B
# fund Desk A with Sepolia USDC from a faucet
npm run deploy:book           # ZerkBook (NoxCompute resolved from chainid)
npm run deploy:zone           # ZerkZone + book.setZone()
npm run deploy:allowlist      # allowlist desks, approve Seaport
npm run sync-abi              # push ABIs + addresses into web/ and matcher/
```

Full walkthrough, including the failure modes worth knowing about in advance:
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

### Run the keeper and the front-end

```bash
npm run matcher               # blind pairing loop
cd web && npm install && npm run dev
```

---

## Testing

```bash
npm test                                              # 50 tests, local, no network
RUN_SEPOLIA_E2E=1 npx hardhat test test/e2e.sepolia.test.ts   # live, spends gas
```

| Suite | What it pins down |
|---|---|
| `ZerkBook.match.test.ts` | The branchless crossing algebra equals the branching version across crossed / not crossed / partial / equal-limit / zero-size / wrong-side cases, for both pricing rules. Plus lifecycle and access control on the real contract. |
| `ZerkZone.gating.test.ts` | A fulfilment is impossible unless the book approved that exact match, at that exact size and price, exactly once. Includes replay-after-settlement. |
| `ZerkRWA.allowlist.test.ts` | The permissioned-asset argument actually bites, with correct mint/burn carve-outs. |
| `e2e.sepolia.test.ts` | Full lifecycle against live Nox. **Includes the privacy test**: pulls raw calldata and logs for both submissions and asserts neither limit price appears. |

The privacy test is the one worth putting on camera. It converts the claim from an assertion into
a demonstration.

---

## What is real, and what is scoped out

**Real:** every contract compiles and deploys to Sepolia; Seaport is the canonical unmodified
1.6 deployment; matching runs on real Nox handles through the real TEE; the front-end reads live
chain state with no mock data anywhere.

**Scoped out, deliberately:**

- **Confidential settlement amounts.** Both legs are plain ERC-20s. The ERC-7984 wrapper is the
  documented next step, not a hackathon deliverable.
- **Full ERC-3643 / T-REX.** `ZerkRWA` is a single allowlist enforced in `_update` — enough to
  make the "permissioned asset can't touch an AMM" argument credible, and no more.
- **Batching.** The keeper's pair sweep is O(n²) and proposes one pair at a time. Fine at demo
  scale; the honest production answer is batched proposals or an encrypted sort inside the TEE.
- **Anonymity set.** Two desks is two desks. The claim is pre-trade non-display, which holds at
  n = 2. Position-level anonymity needs volume — a liquidity problem, not a protocol one.

---

## Feedback to iExec

[`feedback.md`](feedback.md) is a friction log written during the build, not flattery written the
night before. It covers where the async model forced a redesign, which primitives are missing,
and which documented signatures did not match the published packages.

---

## License

MIT.
