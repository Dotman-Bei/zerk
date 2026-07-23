# Zerk UI/UX Specification

## SITEMAP
/        Landing (marketing)
/desk    The trading desk       — the product
/public  What the chain exposes — the proof
/docs    Documentation

## GLOBAL NAVIGATION
*(Sticky on scroll, `#0A0A0A` background with subtle 5px blur, 1px `#222222` hairline bottom border)*

**ZERK** *(Left, Light weight sans-serif)*

Problem &nbsp;&nbsp;&nbsp; Solution &nbsp;&nbsp;&nbsp; How It Works &nbsp;&nbsp;&nbsp; Why Zerk *(Center, `#888888` text, anchor links)*

Docs &nbsp;&nbsp;&nbsp; Public &nbsp;&nbsp;&nbsp; **`[ Open Desk ]`** *(Right, white pill button, `#000000` text)*

---

## 1. HERO
*(Background: `#0A0A0A` with a soft `#141414` radial bloom centered behind the text block. Minimum 160px top/bottom padding.)*

*(Center aligned)*

`( CONFIDENTIAL CROSSING )` *(10px, `#888888`, uppercase, wide tracking, 999px hairline border)*

# **Institutional execution.**
# **Without the leak.**

A dark pool for tokenized real-world assets on Ethereum Sepolia. 
Match large orders inside a Trusted Execution Environment. 
Absolute cryptographic privacy until the exact moment of settlement.

**`[ Open Desk ]`** *(Primary white pill button, 48px top margin)*

---

## 2. PROBLEM `[#problem]`
*(Left-aligned section header, followed by a 3-column grid of cards. 14px radii, hairline `#222222` borders, subtle `#111111` surface fill.)*

**THE LEAK** *(10px section pill)*
### **Public chains expose your book.**

| **PRE-TRADE INTENT** | **POST-TRADE ATTRIBUTION** | **FLOW PATTERNS** |
| :--- | :--- | :--- |
| **The market front-runs you.** | **Competitors map your limits.** | **Your positioning is signal.** |
| Order terms are visible in the mempool before they fill. When you trade size, the market moves against your limit price before execution. | Counterparty pairs are legible on-chain forever. Once you settle, any observer can reverse-engineer your execution strategy. | Consistent buying or selling from a known entity becomes public signal. Your liquidity needs become ammunition for the broader market. |

---

## 3. SOLUTION `[#solution]`
*(The focal point of the page. A stark 2-column layout explicitly demonstrating the contrast rule. Left column is muted and textural; Right column is high-contrast and readable.)*

**THE BOUNDARY** *(10px section pill)*
### **Zero-knowledge matching. Atomic settlement.**

| **NEVER REVEALED** *(#888888 Label)* | **REVEALED AT SETTLEMENT** *(#FFFFFF Label)* |
| :--- | :--- |
| *(Container: Flat #0A0A0A, No border)* | *(Container: #111111 surface, White hairline border)* |
| *(All text below is `#333333` Monospace)* | *(All text below is pure `#FFFFFF` Sans-serif & Monospace)* |
| limit_price: `0x7f3a...c21e` | **SETTLED FILL** |
| order_size: `0x4b21...99ad` | **SIZE:** 5,000,000 tT-BILL |
| uncrossed_liquidity: `0x11a3...44f2` | **PRICE:** 0.9998 USDC |
| cancelled_state: `0x9c44...1b8a` | **TX:** `0x8f2a...91b4` |
| side_intent: `0x3d41...77c9` | **TIME:** 12:04:08:12 UTC |

---

## 4. HOW IT WORKS `[#how-it-works]`
*(A 4-column horizontal flow. Connected by a dashed `#222222` horizontal line running through the step numbers.)*

**ARCHITECTURE** *(10px section pill)*
### **From intent to settlement.**

| `( 01 )` | `( 02 )` | `( 03 )` | `( 04 )` |
| :--- | :--- | :--- | :--- |
| **ENCRYPT** | **SUBMIT** | **MATCH** | **SETTLE** |
| Order terms are encrypted client-side into completely opaque 32-byte hex handles. | The public blockchain stores handles, never values. The mempool sees only noise. | A Trusted Execution Environment (TEE) blindly decides whether crossed orders overlap. | Matched pairs settle atomically through an unmodified Seaport contract. |

---

## 5. WHY ZERK `[#why-zerk]`
*(A 2x2 grid of wide cards. Minimalist, text-forward. `#111111` surface, hairline borders.)*

**DIFFERENTIATORS** *(10px section pill)*
### **Built for trading desks.**

**1. Perfect Price Secrecy**
Your limit price is never revealed to the public or the matching engine, even on a fully executed order.

**2. Blind Matching**
The matcher runs inside a secure enclave. It pairs compatible orders mathematically without ever seeing the underlying values.

**3. Standard Infrastructure**
Settles natively on Seaport. No proprietary rails, no fragmented liquidity, no forked settlement protocols.

**4. Selective Disclosure**
Absolute privacy from the market, with auditor-grade viewing keys. Unmask specific trades for regulators without compromising your edge.

---

## 6. FOOTER
*(Top border: 1px `#222222`. Dense, low-contrast `#888888` text.)*

**ZERK** 

**Product** &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; **Developers** &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; **Legal**
Desk &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Docs &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Terms of Service
Public Feed &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; GitHub &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Privacy Policy

*(Bottom row, vertically centered)*
Built on: **iExec Nox** &nbsp;·&nbsp; **Seaport** &nbsp;·&nbsp; **Ethereum Sepolia** &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; © 2026 Zerk Network.
