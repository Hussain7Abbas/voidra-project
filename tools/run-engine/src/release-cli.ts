import { runRelease } from "./release-intake.ts";

const result = await runRelease(process.argv.slice(2), process.cwd());
process.stdout.write(`${JSON.stringify(result.value)}\n`);
process.exitCode = result.code;
