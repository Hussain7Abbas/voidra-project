import { runCli } from "voidra";

const args = process.argv.slice(2);
if (!["check", "recover", "version"].includes(args[0] ?? "")) {
  process.stderr.write(
    "Bundled Voidra validator: check [PROJECT] [--json]; recover OPERATION [--project PROJECT]; version\n",
  );
  process.exitCode = 2;
} else {
  const result = await runCli(args);
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}
