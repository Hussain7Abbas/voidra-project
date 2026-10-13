import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { z } from "zod";

declare const __voidraProcessHelper: string | undefined;
const execute = promisify(execFile);
const processSchema = z.strictObject({
  pid: z.number().int().positive(),
  parentPid: z.number().int().nonnegative(),
  identity: z.string().min(1),
  command: z.string(),
});
export type ProcessInfo = z.infer<typeof processSchema>;
export async function processInfo(pid: number): Promise<ProcessInfo | null> {
  if (process.platform === "darwin") {
    const binary =
      typeof __voidraProcessHelper !== "undefined"
        ? __voidraProcessHelper
        : fileURLToPath(
            new URL(
              "../../../skills/voidra-go/scripts/process-info",
              import.meta.url,
            ),
          );
    const result = await execute(binary, [String(pid)], { encoding: "utf8" });
    const data: unknown = JSON.parse(result.stdout);
    return data === null ? null : processSchema.parse(data);
  }
  try {
    const result = await execute(
      "ps",
      ["-p", String(pid), "-o", "ppid=,lstart=,comm="],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          NODE_ENV: process.env.NODE_ENV ?? "production",
          TZ: "UTC",
          LC_ALL: "C",
        },
      },
    );
    const match = /^\s*(\d+)\s+(.{24})\s+(.+)\s*$/.exec(result.stdout);
    if (!match) return null;
    return {
      pid,
      parentPid: Number(match[1]),
      identity: match[2]?.trim() ?? "",
      command: match[3]?.trim().split("/").at(-1) ?? "",
    };
  } catch (error) {
    if ((error as { code?: unknown }).code === 1) return null;
    throw error;
  }
}
