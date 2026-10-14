import { once } from "node:events";
import { createServer } from "node:http";
import { expect, test } from "vitest";
import {
  chooseUpdate,
  fetchUpdate,
  UpdateService,
} from "../src/main/updates.ts";

const current = "0.2.0",
  url = "https://github.com/Hussain7Abbas/voidra-project/releases/tag/v1.0.0";
const release = (tag = "v1.0.0") => ({
  tag_name: tag,
  html_url: `https://github.com/Hussain7Abbas/voidra-project/releases/tag/${tag}`,
  name: "First release",
  body: "Useful release notes",
  draft: false,
  prerelease: false,
});
test("update selection accepts newer stable releases, rejects older/equal/malformed and binds the download URL", () => {
  expect(chooseUpdate(current, release())).toMatchObject({
    version: "1.0.0",
    url,
    notes: "Useful release notes",
  });
  for (const tag of ["v0.2.0", "v0.1.0", "v01.2.0", "v1.0.0-beta.1", "bad"])
    expect(chooseUpdate(current, release(tag))).toBeNull();
  expect(chooseUpdate("0.9.0", release("v0.10.0"))?.version).toBe("0.10.0");
  expect(
    chooseUpdate(current, {
      ...release(),
      html_url: "https://other.example/releases",
    }),
  ).toBeNull();
  expect(chooseUpdate(current, { ...release(), draft: true })).toBeNull();
  expect(chooseUpdate(current, { ...release(), prerelease: true })).toBeNull();
  expect(chooseUpdate(current, { ...release(), body: 42 })).toBeNull();
  expect(chooseUpdate("invalid", release())).toBeNull();
});
test("HTTP failures stay silent; startup/daily requests contain no project data and opt-out cancels and hides notices", async () => {
  let mode = "valid",
    calls = 0;
  const seen: string[] = [];
  const host = createServer((request, response) => {
    calls++;
    seen.push(
      `${request.method} ${request.url} ${request.headers.authorization ?? ""}`,
    );
    if (mode === "offline") {
      response.writeHead(503);
      return response.end("offline");
    }
    if (mode === "bad") return response.end("not json");
    if (mode === "large") return response.end("x".repeat(600000));
    if (mode === "slow") return;
    response.end(JSON.stringify(release()));
  });
  host.listen(0, "127.0.0.1");
  await once(host, "listening");
  const address = host.address();
  if (!address || typeof address === "string") throw Error("Missing server");
  const endpoint = `http://127.0.0.1:${address.port}/latest`,
    controller = new AbortController();
  let tick: () => void = () => {},
    changed = 0,
    stopped = false;
  const service = new UpdateService(
    current,
    endpoint,
    () => changed++,
    (callback) => {
      tick = callback;
      return () => {
        stopped = true;
      };
    },
  );
  try {
    await service.setEnabled(true);
    expect(service.notice?.url).toBe(url);
    expect(calls).toBe(1);
    tick();
    await expect.poll(() => calls).toBe(2);
    await expect.poll(() => changed).toBeGreaterThan(1);
    await service.setEnabled(false);
    expect(service.notice).toBeNull();
    expect(stopped).toBe(true);
    tick();
    expect(calls).toBe(2);
    for (mode of ["offline", "bad", "large"])
      expect(await fetchUpdate(current, endpoint)).toBeNull();
    mode = "slow";
    const request = fetchUpdate(current, endpoint, controller.signal, 50);
    expect(await request).toBeNull();
    const cancel = fetchUpdate(current, endpoint, controller.signal);
    controller.abort();
    expect(await cancel).toBeNull();
    expect(seen.every((value) => value === "GET /latest ")).toBe(true);
    expect(
      await fetchUpdate(current, "http://outside.example/latest"),
    ).toBeNull();
  } finally {
    service.close();
    host.closeAllConnections();
    await new Promise<void>((done) => host.close(() => done()));
  }
});
