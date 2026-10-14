import { z } from "zod";
import { compareReleaseVersions } from "../../../../tools/release-engine/src/version.ts";
import { stableVersionSchema, type UpdateNotice } from "../shared/updates.ts";

const releaseSchema = z.object({
  tag_name: z.string(),
  html_url: z.string(),
  name: z.string().nullable(),
  body: z.string().nullable(),
  draft: z.literal(false),
  prerelease: z.literal(false),
});
/** Stable release precedence is numeric; prereleases never produce notices. */
export function chooseUpdate(
  current: string,
  raw: unknown,
): UpdateNotice | null {
  const release = releaseSchema.safeParse(raw);
  if (!release.success || !stableVersionSchema.safeParse(current).success)
    return null;
  const data = release.data,
    version = data.tag_name.startsWith("v") ? data.tag_name.slice(1) : "";
  if (!stableVersionSchema.safeParse(version).success) return null;
  const url = `https://github.com/Hussain7Abbas/voidra-project/releases/tag/v${version}`;
  if (data.html_url !== url) return null;
  const newer = compareReleaseVersions(version, current) > 0;
  return newer
    ? {
        version,
        url,
        title: (data.name ?? `Voidra Project ${version}`).slice(0, 200),
        notes: (data.body ?? "").slice(0, 20000),
      }
    : null;
}
export async function fetchUpdate(
  current: string,
  endpoint: string,
  signal?: AbortSignal,
  timeout = 8000,
): Promise<UpdateNotice | null> {
  const controller = new AbortController(),
    cancel = () => controller.abort(),
    timer = setTimeout(cancel, timeout);
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    if (signal?.aborted) return null;
    const url = new URL(endpoint);
    if (
      url.username ||
      url.password ||
      url.hash ||
      url.search ||
      (url.protocol !== "https:" &&
        !(
          url.protocol === "http:" &&
          ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
        ))
    )
      return null;
    const response = await fetch(url, {
      headers: { Accept: "application/vnd.github+json" },
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok || !response.body) return null;
    const reader = response.body.getReader();
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > 512 * 1024) return null;
        chunks.push(next.value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    return chooseUpdate(
      current,
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
export class UpdateService {
  readonly current: string;
  readonly endpoint: string;
  private changed: () => void;
  private schedule: (callback: () => void) => () => void;
  private enabled = false;
  private stop: (() => void) | null = null;
  private active: AbortController | null = null;
  notice: UpdateNotice | null = null;
  constructor(
    current: string,
    endpoint: string,
    changed: () => void,
    schedule: (callback: () => void) => () => void = (callback) => {
      const timer = setInterval(callback, 86400000);
      timer.unref();
      return () => clearInterval(timer);
    },
  ) {
    this.current = current;
    this.endpoint = endpoint;
    this.changed = changed;
    this.schedule = schedule;
  }
  async setEnabled(enabled: boolean): Promise<void> {
    this.enabled = enabled;
    this.stop?.();
    this.stop = null;
    this.active?.abort();
    this.active = null;
    if (!enabled) {
      this.notice = null;
      this.changed();
      return;
    }
    this.stop = this.schedule(() => {
      void this.check();
    });
    await this.check();
  }
  async check(): Promise<void> {
    if (!this.enabled || this.active) return;
    const controller = new AbortController();
    this.active = controller;
    try {
      const notice = await fetchUpdate(
        this.current,
        this.endpoint,
        controller.signal,
      );
      if (this.active === controller && this.enabled) {
        this.notice = notice;
        this.changed();
      }
    } finally {
      if (this.active === controller) this.active = null;
    }
  }
  close(): void {
    this.enabled = false;
    this.stop?.();
    this.stop = null;
    this.active?.abort();
    this.active = null;
  }
}
