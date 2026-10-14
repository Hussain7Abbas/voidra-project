import { runSync } from "./sync.ts";

const result = await runSync(process.argv.slice(2), process.cwd());
process.stdout.write(`${JSON.stringify(result.value)}\n`);
process.exitCode = result.code;
