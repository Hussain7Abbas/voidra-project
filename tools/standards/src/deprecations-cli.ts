import { runDeprecationsCli } from "./deprecations.ts";

const result = await runDeprecationsCli(process.argv.slice(2));
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.exitCode;
