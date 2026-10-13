import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);
export interface GitIdentity {
  name: string | null;
  email: string | null;
  value: string | null;
  notice: string | null;
}
export async function readGitIdentity(
  root: string,
  environment: Record<string, string> = {},
): Promise<GitIdentity> {
  async function value(key: string): Promise<string | null> {
    try {
      const result = await execute("git", ["config", "--get", key], {
        cwd: root,
        env: { ...process.env, ...environment },
        encoding: "utf8",
      });
      return result.stdout.trim() || null;
    } catch {
      return null;
    }
  }
  const [name, email] = await Promise.all([
    value("user.name"),
    value("user.email"),
  ]);
  return {
    name,
    email,
    value: name && email ? `${name} <${email}>` : null,
    notice:
      name && email
        ? null
        : `Git ${[!name ? "name" : null, !email ? "email" : null].filter(Boolean).join(" and ")} is not configured. You can leave work unassigned.`,
  };
}
