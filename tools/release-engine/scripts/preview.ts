import { fileURLToPath } from "node:url";
import { resolveReleaseRequest } from "../src/bump.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
try {
  console.log(
    JSON.stringify(
      await resolveReleaseRequest(root, {
        version: process.env.VERSION,
        bump: process.env.BUMP,
      }),
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
