# Deployment

Everything runs on **Ethereum Sepolia**. There is no mock data anywhere in the stack.

## Fixed addresses

| Contract | Address | Notes |
|---|---|---|
| Seaport 1.6 | `0x0000000000000068F116a894984e2DB1123eB395` | CREATE2 — same as mainnet. Never deployed by us. |
| ConduitController | `0x00000000F9490004C11Cef243f5400493c00Ad63` | Not used; `conduitKey = bytes32(0)`. |
| NoxCompute (Sepolia) | `0x24Ef36Ec5b626D7DCD09a98F3083c2758F0F77bF` | Resolved automatically by the Nox SDK from `block.chainid`. |
| USDC (Sepolia) | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` | Circle test USDC, 6 decimals. |

Use **Seaport 1.6**, not 1.5: `authorizeOrder` was added to the zone interface in 1.6, and the
pre-transfer hook is the one that matters. With `conduitKey = bytes32(0)` offerers approve Seaport
directly, so there is no conduit to set up.

`ZerkBook` needs no NoxCompute address in its constructor — the Nox Solidity SDK resolves it from
the chain id internally.

---

## Accounts

| Role | Holds | Needs |
|---|---|---|
| Deployer | — | Sepolia ETH. Owns the `ZerkRWA` allowlist and the one-shot `ZerkBook.setZone`. |
| Desk A (buyer) | Sepolia USDC | ETH for gas |
| Desk B (seller) | tT-BILL float | ETH for gas |
| Matcher | — | ETH only. Never holds tokens and can never read an order. |
| Auditor | — | ETH only, and only if you demo a grant on-chain. |

---

## Sequence

```bash
cp .env.example .env      # RPC + the four private keys
npm install
npm run build             # compile; solc 0.8.35 is downloaded on first run
npm test                  # 50 tests, no network required
```

### 1. Tokens

```bash
npm run deploy:tokens
```

Deploys `ZerkRWA`, allowlists the deployer and both desks, mints a 10M tT-BILL float to Desk B.

**Then fund Desk A with Sepolia USDC** from a faucet. The demo cannot settle without it, and this
is the step most likely to be discovered late.

### 2. Book

```bash
npm run deploy:book
```

Deploys `ZerkBook(rwa, usdc, 18, PricingRule.Midpoint, deployer)`.

### 3. Zone

```bash
npm run deploy:zone
```

Deploys `ZerkZone(book, seaport)` and calls `book.setZone(zone)`. **`setZone` is one-shot** — if
you redeploy the zone you must redeploy the book too. That is intentional: a book whose zone can
be swapped is a book whose settlement gate can be swapped.

### 4. Allowlist and approvals

```bash
npm run deploy:allowlist
```

Allowlists the desks, Seaport, the zone and the book on `ZerkRWA`, then approves Seaport as
spender from Desk B (tT-BILL) and Desk A (USDC).

### 5. Wire the off-chain pieces

```bash
npm run sync-abi          # writes web/lib/generated and matcher/generated
npm run matcher           # blind keeper
cd web && npm install && npm run dev
```

### 6. Verify on Etherscan

```bash
npx hardhat verify --network sepolia <ZerkRWA>  "Zerk Tokenized T-Bill" "tT-BILL" <deployer>
npx hardhat verify --network sepolia <ZerkBook> <rwa> <usdc> 18 1 <deployer>
npx hardhat verify --network sepolia <ZerkZone> <book> 0x0000000000000068F116a894984e2DB1123eB395
```

Verified source costs ten minutes and makes the repo look finished. It also makes the `/public`
page's argument checkable by a judge rather than merely assertable by you.

---

## Failure modes worth knowing in advance

### Allowlisting and Seaport

The received wisdom is "allowlist Seaport or fulfilment reverts". **In this configuration that is
not actually the binding constraint**, and it is worth knowing which one is.

With `conduitKey = bytes32(0)`, Seaport performs `transferFrom(offerer, recipient, amount)`
directly. `ZerkRWA._update` checks `permitted[from]` and `permitted[to]` — and Seaport is
*neither*. It is the spender, not a holder.

So the real requirements are:

1. **Both desks must be allowlisted** — they are the actual `from` and `to`.
2. **Seaport must be approved as spender** on both tokens (`approve`, not the allowlist).

`04_allowlist_and_approve.ts` allowlists Seaport, the zone and the book anyway. It costs one
storage slot each and removes an entire class of demo-day failure if the settlement path ever
changes — but if a transfer reverts, look at the desks and the approvals first.

### `finalizeMatch` reverts

Almost always because the Runner has not produced the result handles yet. The gateway returns a
"not yet computed" error and the matcher retries with backoff
(`MATCHER_DECRYPT_ATTEMPTS`, `MATCHER_DECRYPT_BACKOFF_MS`). Give it time before assuming a bug —
there is real latency between `proposeMatch` and a decryptable result.

### `submitOrder` reverts with a proof error

`encryptInput(value, type, applicationContract)` binds the handle to a specific contract **and**
to the submitting address. If you change the `ZerkBook` address without re-encrypting, or submit
one desk's ciphertext from another desk's wallet, the proof check fails. Re-encrypt against the
current book address.

Proofs also expire. If a submission sat in a tab for a long time, encrypt again.

### `proposeMatch` reverts with `OrderNotOpen`

Both orders must be `Open`. A proposal locks its pair to `Pending` until `finalizeMatch` runs, so
a second concurrent proposal on the same order will bounce. This is deliberate — it stops the
keeper double-spending an order across two in-flight matches.

### The demo has latency

There is real time between submit and match. Script around it: narrate, or cut. Do not leave dead
air in a four-minute video.

---

## Front-end deployment

`web/` is a standalone Next.js app. On Vercel, set the project root to `web/` and provide:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_ZERK_BOOK` | Book address (overrides the synced deployment record) |
| `NEXT_PUBLIC_ZERK_ZONE` | Zone address |
| `NEXT_PUBLIC_ZERK_RWA` | tT-BILL address |
| `NEXT_PUBLIC_USDC` | Quote token address |
| `NEXT_PUBLIC_SEPOLIA_RPC_URL` | RPC endpoint |
| `NEXT_PUBLIC_DESK_A` / `NEXT_PUBLIC_DESK_B` / `NEXT_PUBLIC_AUDITOR` | Cosmetic labels only |
| `NEXT_PUBLIC_REPO_URL` | GitHub link in the footer |

Without the `NEXT_PUBLIC_*` overrides the app falls back to `deployments/11155111.json`, which
`npm run sync-abi` copies into `web/lib/generated/`. Committing that file is the simplest path —
the addresses are public anyway.
