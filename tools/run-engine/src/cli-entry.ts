import { runRuntime } from "./runtime.ts";

const result = await runRuntime(process.argv.slice(2));
process.stdout.write(`${JSON.stringify(result.value)}\n`);
process.exitCode = result.code;
