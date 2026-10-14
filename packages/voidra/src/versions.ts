import { VoidraError } from "./errors.ts";
import { parseRecord, serializeRecord } from "./records.ts";
import { schemas } from "./schemas.ts";
export const FORMAT_VERSION = 1;
export const PACKAGE_VERSION = "0.2.2";
/** The only legacy shape is a local, unreleased format-0 migration fixture. */
export function upgradePrototype(
  files: Map<string, Buffer>,
): Map<string, Buffer> {
  const upgraded = new Map(files);
  const raw = files.get(".voidra/voidra.json");
  if (!raw) return upgraded;
  const record = parseRecord(".voidra/voidra.json", raw);
  const metadata = schemas.project.parse(record.data);
  if (metadata.format !== 0) return upgraded;
  upgraded.set(
    ".voidra/voidra.json",
    serializeRecord(record, {
      ...metadata,
      format: FORMAT_VERSION,
      requiredVoidra: PACKAGE_VERSION,
    }),
  );
  for (const [path, bytes] of files) {
    if (!/^\.voidra\/actions\/[^/]+\/action\.md$/.test(path)) continue;
    const record = parseRecord(path, bytes);
    const data = { ...record.data };
    if (data.doneBy === "agent" && data.stage === undefined) {
      if (data.state === undefined)
        throw new VoidraError(
          "migration",
          path,
          "Prototype action is invalid: missing state",
          "state",
        );
      data.stage = data.state;
    }
    upgraded.set(path, serializeRecord(record, data));
  }
  return upgraded;
}
