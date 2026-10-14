import { resolve } from "node:path";
import { runFakeAgent, type Scenario } from "./index.ts";

const [root, scenario] = process.argv.slice(2);
if (
  !root ||
  !scenario ||
  ![
    "init",
    "sync",
    "success",
    "invalid-write",
    "crash-mid-run",
    "crash-after-commit",
    "stale-lock",
    "live-stale",
    "pause-after-start",
    "interrupted-operation",
  ].includes(scenario)
)
  throw new Error("fake-agent PROJECT SCENARIO");
process.stdout.write(
  `${JSON.stringify(await runFakeAgent(resolve(root), scenario as Scenario))}\n`,
);
if (scenario === "live-stale" || scenario === "pause-after-start")
  setInterval(() => {}, 1000);
