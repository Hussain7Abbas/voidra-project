import { runIntake } from "./init-runtime.ts";

let input = "";
if (!process.argv.includes("--help") && !process.argv.includes("--report"))
  for await (const chunk of process.stdin) input += String(chunk);
const result = await runIntake(process.argv.slice(2), input);
process.stdout.write(`${JSON.stringify(result.value)}\n`);
process.exitCode = result.code;
