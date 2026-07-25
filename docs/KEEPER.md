# Hosting the keepers

The front-end (Vercel) is stateless — it reads chain state and lets desks submit orders. The two
things that *drive* the lifecycle are long-running processes:

- **matcher** (`matcher/index.ts`) — pairs resting orders blindly, proposes and finalizes matches.
- **settle** (`matcher/settle.ts`) — signs the seller's order and fulfils it through Seaport.

Vercel cannot run these — they poll forever, and serverless functions are short-lived. So they run
as a single always-on **worker**. Once it is up, anything a judge submits on the site is matched and
settled automatically, with no terminal on anyone's part.

`npm run keeper` (`matcher/keeper.mjs`) runs both loops in one process. `render.yaml` and
`railway.json` configure the two hosts below; pick one.

## Deploy on Render

A keeper must be a **Background Worker** — a *paid* instance on Render (~$7/mo Starter). A free web
service will not do: it sleeps after inactivity, and the keeper must poll continuously.

1. On [render.com](https://render.com): **New → Blueprint → connect this repo.** Render reads
   `render.yaml` and creates a worker named `zerk-keeper` (build `npm ci`, start `npm run keeper`).
2. When prompted, fill the three secret keys (they are `sync: false`, so Render asks for them):
   `MATCHER_PRIVATE_KEY`, `DESK_A_PRIVATE_KEY`, `DESK_B_PRIVATE_KEY`.
3. **Apply** → open the worker's **Logs** — you should see `blind matcher online` and
   `settlement operator online`.

(Manual alternative: **New → Background Worker → connect repo**, then set Build `npm ci`, Start
`npm run keeper`, and add the same env vars.)

## Deploy on Railway

1. On [railway.app](https://railway.app): **New Project → Deploy from GitHub repo → select `zerk`.**
   Railway reads `railway.json`, skips the contract build, and runs `npm run keeper`.
2. Add the environment variables below under the service's **Variables** tab (mark them secret).
3. Deploy. Open the service **Logs** — you should see `blind matcher online` and
   `settlement operator online`.

Either way, this service has no public URL by design — it is a worker, not a web app.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `MATCHER_PRIVATE_KEY` | yes | the blind keeper's gas account (holds no tokens) |
| `DESK_A_PRIVATE_KEY` | yes | buyer — settle submits its fulfilment |
| `DESK_B_PRIVATE_KEY` | yes | seller — settle signs its order |
| `SEPOLIA_RPC_URL` | no | defaults to a public endpoint; the keepers use reads + writes (no `eth_getLogs`), so the default is fine |
| `MATCHER_POLL_MS` | no | sweep interval, default 12000 |

Contract addresses are **not** environment variables — they are read from the committed
`matcher/generated/deployments.ts`, so the worker always targets the deployed instance.

⚠️ **These are testnet keys.** Set them as secrets on your host, never commit them, and never fund the
addresses with anything real. That the settle worker holds the desk keys is the deliberate trust
split described in the README: the matcher stays blind; only the settlement role touches keys, and
it can forge nothing because the zone pins every amount to the fill the TEE already approved.

## Verify it works

With the worker running, submit a crossing pair on the site (Desk A bid ≥ Desk B ask). Within a
minute the Railway logs show `proposeMatch` → `finalizeMatch` → `fulfillAdvancedOrder`, and the
trade appears on `/public`. Fund the three accounts with a little Sepolia ETH first, or the worker
will log revert/insufficient-funds errors on every sweep.
