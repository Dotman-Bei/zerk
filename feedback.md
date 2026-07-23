# Feedback on iExec Nox

Written during the build, while the friction was fresh. Specific rather than flattering, because
a precise bug report is worth more to you than praise is.

Versions this is against:

- `@iexec-nox/nox-protocol-contracts` **0.2.4**
- `@iexec-nox/nox-confidential-contracts` **0.2.2**
- `@iexec-nox/handle` **0.1.0-beta.13**
- Target: Ethereum Sepolia (`11155111`), `NoxCompute` at `0x24Ef…77bF`

---

## 1. Discovery — the first ten minutes are the roughest part

**The npm scope is not the one you would guess.** `@iexec/nox` does not exist. The packages live
under `@iexec-nox/*`, which is a different scope from every other iExec SDK (`@iexec/dataprotector`,
`@iexec/web3telegram`, `iexec`). Anyone who reaches for the obvious name gets a 404 and has to fall
back to searching. A placeholder package under `@iexec/nox` whose README points at the real scope
would cost you nothing and save every new developer the same five minutes.

**`docs.iex.ec/nox-protocol/*` 308-redirects to `docs.noxprotocol.io/*`.** Fine for a browser,
annoying for tooling and for anything that follows links programmatically. Search results still
carry the old host.

**The docs render client-side.** The Networks page in particular does not survive a plain fetch,
which means the canonical way to answer "what is the NoxCompute address on Sepolia?" is to open a
browser. In the end I got the answer faster by reading `Nox.sol` — `noxComputeContract()` hardcodes
all three chains — and by reading `NETWORK_CONFIGS` in the JS SDK. Both are better sources than the
docs page. Consider publishing an addresses JSON.

**What actually worked:** installing the packages and reading the source. `Nox.sol`,
`INoxCompute.sol`, `ACL.sol` and the SDK's `HandleClient.ts` are well-commented and answered every
question I had faster than the documentation did. That is a real compliment to the code and a real
criticism of the docs.

---

## 2. `publicDecrypt` means two different things

This cost the most redesign time, and it is a naming problem rather than a design problem.

- **JS SDK** `client.publicDecrypt(handle)` → performs the decryption, returns
  `{ value, solidityType, decryptionProof }`.
- **Solidity** `Nox.publicDecrypt(handle, proof)` → is a **`view`** function that *verifies* a
  proof and returns the plaintext it commits to.

I designed `finalizeMatch(matchId)` on the assumption that the on-chain call would trigger
decryption and land the value later, mirroring how the rest of the async model works. It does not.
The correct shape is:

```solidity
function finalizeMatch(
    bytes32 matchId,
    bytes calldata crossedProof,
    bytes calldata fillSizeProof,
    bytes calldata fillPriceProof
) external
```

…with the client fetching all three proofs first.

**Once understood, the design is better than what I expected** — the contract re-verifies the KMS
signature itself, so a relayer cannot lie about a fill price, which removes a trust assumption I
had been prepared to accept. But the shared name actively misleads. `verifyDecryptionProof` on the
Solidity side would have communicated it immediately.

---

## 3. Missing primitives

`INoxCompute` exposes `eq / ne / lt / le / gt / ge`, `add / sub / mul / div` with `safe*` variants,
`select`, and the composite `transfer / mint / burn`. Notably absent:

**No encrypted boolean `and` / `or` / `not`.** Any predicate with more than one clause has to be
re-expressed. `select` is only overloaded for `euint16 / euint256 / eint16 / eint256` — not for
`ebool` — so the natural trick `and(a,b) = select(a, b, false)` is unavailable too. What I ended up
with is a 0/1 selector folded through `select` and then multiplied:

```solidity
euint256 flag = Nox.select(c1, _eOne, _eZero);
flag          = Nox.select(c2, flag,  _eZero);
flag          = Nox.select(c3, flag,  _eZero);
```

This works, and it is arguably clearer about its constant-time properties than a boolean chain
would be. But it costs three extra Runner round-trips versus a native `and`, and every developer
who needs a compound predicate will independently rediscover it. **Ranked #1 on my wishlist.**

**No `min` / `max`.** Composable as `select(le(a,b), a, b)`, which is one line, but it is a
sufficiently common primitive that shipping it would be kind.

**No `ebool` → `euint` cast.** This is what forces the 0/1 selector dance above. A single
`toEuint256(ebool)` would collapse the whole workaround.

**`encryptInput` supports only `bool, uint16, uint256, int16, int256`,** while
`encrypted-types/EncryptedTypes.sol` declares every width from 8 to 256. The type file suggests a
range the protocol does not implement, and you only find out at runtime via a `TypeError`. Worth a
comment in `EncryptedTypes.sol` marking which types are live.

---

## 4. The ACL model is good, and its ordering rules are invisible

Three permission levels — admin (`allow`), viewer (`addViewer`), public
(`allowPublicDecryption`) — is exactly the right decomposition, and it is what made the auditor
feature in this project cheap rather than aspirational. Handles + per-address ACLs as a combined
primitive is the single best thing in Nox.

Two rules are load-bearing and neither is documented where you would look:

**`fromExternal` grants only transient access.** `validateInputProof` ends with
`_allowTransient(handle, msg.sender)`. If a contract stores a handle without calling `allowThis`
in the same transaction, that handle is silently unusable forever — and the failure surfaces much
later, in whichever function next tries to compute on it. There is no error at storage time.

**`addViewer` requires the caller to already be allowed** (`onlyAllowed(handle)`). So inside
`submitOrder` the order must be:

```solidity
Nox.allowThis(handle);              // must come first
Nox.addViewer(handle, msg.sender);  // would revert if reversed
```

I found both by reading `ACL.sol` and `Compute.sol`. Neither is in the SDK docs. A short
"lifetime of a handle" page — transient vs persistent, who can grant what, and the failure mode
when you skip `allowThis` — would prevent a whole class of bug that is very hard to debug from the
outside.

Related, smaller: `isViewer` returns true for admins as well as viewers. Sensible, but it means
`isViewer` is not a clean test for "was this address explicitly granted a view", which is exactly
what an audit trail wants to ask.

---

## 5. Toolchain

**`pragma solidity ^0.8.35`** is very recent. Hardhat downloads it fine, but 0.8.35 postdates the
defaults of most templates and several static-analysis tools, so anything not pinned needs
updating. Worth flagging prominently, since the first thing a developer does is drop `Nox.sol` into
an existing project.

**`reference` is a reserved keyword in Solidity** and I named a variable that. Not your problem —
noting it only because the error message (`Expected ';' but got reserved keyword`) sends you looking
at the wrong line.

**Local testing needs the offchain stack.** `Nox.noxComputeContract()` hardcodes
`0x75C6…C685` for chain 31337, so a bare Hardhat chain cannot exercise any confidential path —
every Nox call reverts against an empty address. `@iexec-nox/nox-hardhat-plugin` exists for this and
is the right answer, but it means there is no *lightweight* way to unit-test matching logic.

I worked around it by extracting the crossing predicate into a plaintext TypeScript mirror and
asserting the branchless formulation equals the naive one across every edge case
(`matcher/crossing.ts`, `test/ZerkBook.match.test.ts`). That is a decent pattern and I would
recommend it to others, but **a pure in-memory mock of `INoxCompute`** — one that computes on
plaintext behind the same interface, with no Docker and no queue — would let people test contract
logic in CI in milliseconds. Ranked #2 on my wishlist.

---

## 6. What worked well

- **Handles as an opaque `bytes32` are the right abstraction.** Storing them in structs, passing
  them through functions and returning them from views all just work, because they are value types.
  Nothing about the confidentiality leaked into my data model.
- **Chain-id resolution inside `Nox.sol`.** Not having to thread a `NoxCompute` address through
  constructors and deploy scripts removed a whole category of misconfiguration.
- **Deterministic result handles.** Being able to store a result handle immediately, before the
  Runner has computed anything, is what makes the three-transaction lifecycle expressible at all.
- **The `select`-only discipline is a feature.** Being unable to branch on ciphertext forced a
  design where a failed match is indistinguishable from a successful one. I would not have written
  it that way if branching had been available, and the result is stronger.
- **Proof verification on-chain.** As above: it turned a trusted relayer into an untrusted one.

---

## 7. What I would want next, ranked

1. **Encrypted boolean logic** — `and`, `or`, `not`, or at minimum an `ebool → euint` cast. Every
   non-trivial predicate needs it and everyone will invent the same workaround.
2. **An in-memory `INoxCompute` mock for unit tests.** Plaintext behind the same interface, no
   infrastructure. This is the difference between testing confidential logic in CI and not testing
   it.
3. **Rename the Solidity `publicDecrypt`** to something that says "verify". The current name
   guarantees a redesign for anyone who reads the JS SDK first.
4. **A "lifetime of a handle" doc page** — transient vs persistent access, the `allowThis` before
   `addViewer` ordering, and what silently breaks when you skip either.
5. **`min` / `max`.** Small, common, trivially composable — which is exactly why they should ship.
6. **A machine-readable addresses endpoint** (JSON) for `NoxCompute`, the gateway and the subgraph,
   so scripts stop hardcoding what the docs render client-side.
7. **Gas guidance.** Every primitive is an external call plus an event. My `proposeMatch` issues
   roughly a dozen. I had no way to estimate that before writing it, and no guidance on what is
   considered reasonable per transaction.
