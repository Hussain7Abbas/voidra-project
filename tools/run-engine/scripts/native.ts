import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile),
  root = fileURLToPath(new URL("../../../", import.meta.url));
const source = resolve(root, "tools/run-engine/native/process-info.c"),
  target = resolve(root, "skills/voidra-go/scripts/process-info");
const flags = [
  "-std=c11",
  "-arch",
  "arm64",
  "-mmacosx-version-min=13.0",
  "-O2",
  "-Wall",
  "-Wextra",
  "-Werror",
];
const hash = createHash("sha256")
  .update(await readFile(source))
  .update(JSON.stringify(flags))
  .digest("hex");
const current = await execute(target, ["--source-hash"], { encoding: "utf8" })
  .then((r) => r.stdout.trim())
  .catch(() => null);
if (current !== hash) {
  if (process.argv.includes("--check"))
    throw new Error("Native process helper is missing or stale");
  const temp = `${target}.tmp`;
  try {
    await execute("clang", [
      ...flags,
      `-DVOIDRA_SOURCE_HASH="${hash}"`,
      source,
      "-o",
      temp,
    ]);
    await chmod(temp, 0o755);
    await rename(temp, target);
  } finally {
    await rm(temp, { force: true });
  }
}

const planningTarget = resolve(root, "skills/voidra-plan/scripts/process-info");
const binary = await readFile(target);
if (process.argv.includes("--check")) {
  if (!(await readFile(planningTarget).catch(() => null))?.equals(binary))
    throw new Error("Planning process helper is stale");
} else {
  await mkdir(resolve(root, "skills/voidra-plan/scripts"), { recursive: true });
  await writeFile(planningTarget, binary);
  await chmod(planningTarget, 0o755);
}
