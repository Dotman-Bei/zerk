/**
 * One process that runs both keepers — for a single always-on host (Railway, Render, a VPS).
 *
 * The blind matcher and the settlement operator are separate concerns (see their files), but on a
 * hosted worker it is convenient to run them side by side. Each is spawned as its own child so
 * they stay independent; if either dies, this launcher exits non-zero so the platform restarts the
 * whole service rather than leaving half the pipeline down.
 *
 *   npm run keeper
 *
 * Needs the same environment the two loops need: MATCHER_PRIVATE_KEY (matcher) and
 * DESK_A_PRIVATE_KEY / DESK_B_PRIVATE_KEY (settle). Contract addresses come from the committed
 * matcher/generated/deployments.ts, so none are required in the environment.
 */
import { spawn } from "node:child_process";

const children = [];

function run(name, entry) {
  // `node --import tsx <file>` runs the TypeScript entry through the tsx loader with no build step.
  const child = spawn(process.execPath, ["--import", "tsx", entry], {
    stdio: "inherit",
    env: process.env,
  });
  child.on("exit", (code, signal) => {
    console.error(`[keeper] ${name} exited (code=${code}, signal=${signal}) — stopping for restart`);
    shutdown(code ?? 1);
  });
  children.push(child);
}

let shuttingDown = false;
function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    if (!c.killed) c.kill("SIGTERM");
  }
  process.exit(code);
}

process.on("SIGTERM", () => shutdown(0));
process.on("SIGINT", () => shutdown(0));

console.log("[keeper] starting matcher + settle");
run("matcher", "matcher/index.ts");
run("settle", "matcher/settle.ts");
