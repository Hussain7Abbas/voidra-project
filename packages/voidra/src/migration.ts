import { VoidraError } from "./errors.ts";
import { hash } from "./lifecycle.ts";
import { FORMAT_VERSION, inspectFiles, readProjectFiles } from "./project.ts";
import { parseRecord } from "./records.ts";
import { schemas } from "./schemas.ts";
import { upgradePrototype } from "./versions.ts";
import {
  applyOperation,
  type WriteManifest,
  type WriteOptions,
} from "./writer.ts";
export interface MigrationResult {
  from: number;
  to: number;
  changed: boolean;
  dryRun: boolean;
  paths: string[];
  operation?: string;
}
export async function migrateProject(
  root: string,
  options: WriteOptions & { dryRun?: boolean } = {},
): Promise<MigrationResult> {
  const { files, diagnostics } = await readProjectFiles(root);
  if (diagnostics.length)
    throw new VoidraError(
      "symlink",
      diagnostics[0]?.file ?? "",
      "Project contains a symlink",
    );
  const raw = files.get(".voidra/voidra.json");
  if (!raw)
    throw new VoidraError(
      "required-file",
      ".voidra/voidra.json",
      "Project metadata is missing",
    );
  const record = parseRecord(".voidra/voidra.json", raw);
  const metadata = schemas.project.parse(record.data);
  const gate = inspectFiles(files).diagnostics.find(
    (d) => d.code === "newer-format",
  );
  if (gate) throw new VoidraError(gate.code, gate.file, gate.message);
  const result: MigrationResult = {
    from: metadata.format,
    to: FORMAT_VERSION,
    changed: metadata.format !== FORMAT_VERSION,
    dryRun: Boolean(options.dryRun),
    paths: [],
  };
  if (!result.changed) return result;
  const overlay = upgradePrototype(files);
  const changes: WriteManifest["changes"] = Array.from(overlay.entries())
    .filter(([path, bytes]) => !bytes.equals(files.get(path) as Buffer))
    .map(([path, bytes]) => ({
      path,
      expectedHash: hash(files.get(path) as Buffer),
      content: bytes.toString(),
    }));
  const checked = inspectFiles(overlay);
  if (checked.diagnostics.length)
    throw new VoidraError(
      "migration",
      checked.diagnostics[0]?.file ?? "",
      "Migration target is invalid: " +
        checked.diagnostics.map((d) => d.message).join("; "),
    );
  result.paths = changes.map((c) => c.path);
  if (!options.dryRun)
    result.operation = (
      await applyOperation(root, { changes }, options, true)
    ).id;
  return result;
}
