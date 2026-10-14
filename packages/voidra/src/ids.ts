import { randomBytes } from "node:crypto";
import { VoidraError } from "./errors.ts";
export const prefixes = [
  "act",
  "idea",
  "q",
  "run",
  "op",
  "prj",
  "sync",
] as const;
export type IdPrefix = (typeof prefixes)[number];
const alphabet = "0123456789abcdefghjkmnpqrstvwxyz";
export function createId(
  prefix: IdPrefix,
  existing: ReadonlySet<string> = new Set(),
  random: () => Uint8Array = () => randomBytes(6),
): string {
  if (!prefixes.includes(prefix))
    throw new VoidraError("id", "", "Unknown ID prefix");
  for (let attempt = 0; attempt < 100; attempt++) {
    const bytes = random();
    if (bytes.length !== 6)
      throw new VoidraError("id", "", "ID randomness requires six bytes");
    const candidate = `${prefix}-${Array.from(bytes, (byte) => alphabet[byte & 31]).join("")}`;
    if (!existing.has(candidate)) return candidate;
  }
  throw new VoidraError(
    "id-collision",
    "",
    "Could not generate a unique ID after 100 collision retries",
  );
}
