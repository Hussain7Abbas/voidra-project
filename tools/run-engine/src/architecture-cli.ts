import { runArchitecture } from "./architecture.ts";

let input = "";
if (!process.argv.includes("--help"))
  for await (const chunk of process.stdin) input += chunk;
const result = await runArchitecture(process.argv.slice(2), input);
process.stdout.write(`${JSON.stringify(result.value)}\n`);
process.exitCode = result.code;
