# Zerk brand assets

Vector masters for the Zerk mark and logo. The mark is the canonical geometry used in the app
([web/components/ui/logo.tsx](../web/components/ui/logo.tsx)); a crossing — four order flows
converging on a single settled fill, each stopping short of the node to mark the privacy boundary.

## Files

| File | Use |
| --- | --- |
| `zerk-mark.svg` | Mark only, white — for dark backgrounds. Transparent. |
| `zerk-mark-black.svg` | Mark only, near-black — for light backgrounds. Transparent. |
| `zerk-icon.svg` | Mark on the dark rounded tile — app icon, avatar, favicon. |
| `zerk-logo-lockup.svg` | Mark + `ZERK` wordmark, white — for dark backgrounds. |
| `zerk-logo-lockup-black.svg` | Mark + `ZERK` wordmark, near-black — for light backgrounds. |

## Colours

- Ink `#0A0A0A` · White `#FFFFFF` — the whole system is these two.

## Wordmark font

The lockup wordmark is **Inter, weight 300**, letter-spacing ≈ 0.28em. The SVG falls back to
Helvetica/Arial if Inter isn't installed, so install Inter before exporting the lockup if you
need it pixel-exact.

## Getting PNGs

No rasteriser ships with this repo, so open **`export-png.html`** in any browser
(double-click it), set a size, and click a button. It renders each asset to a transparent PNG
locally — nothing is uploaded.
