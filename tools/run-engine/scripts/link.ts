import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { linkSkills } from "../src/link.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const target = resolve(process.argv[2] ?? root);
await linkSkills(root, target);
process.stdout.write(`Skills linked for Claude Code and Codex in ${target}.\n`);
