import { fileURLToPath } from "node:url";
import { lintSkills } from "../src/skills.ts";

const errors = await lintSkills(
  fileURLToPath(new URL("../../../", import.meta.url)),
);
if (errors.length) throw new Error(errors.join("\n"));
process.stdout.write("Skill metadata, length and relative links are valid.\n");
