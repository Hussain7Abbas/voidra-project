import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const image = process.argv[2];
if (!image) throw new Error("Pass the built DMG path");
const temp = await mkdtemp(join(tmpdir(), "voidra-dmg-smoke-")),
  mount = join(temp, "mounted"),
  copy = join(temp, "Voidra Project.app");
await mkdir(mount);
let attached = false;
try {
  execFileSync(
    "hdiutil",
    ["attach", "-nobrowse", "-readonly", "-mountpoint", mount, resolve(image)],
    { stdio: "pipe" },
  );
  attached = true;
  execFileSync("ditto", ["--noqtn", join(mount, "Voidra Project.app"), copy], {
    stdio: "pipe",
  });
  execFileSync("hdiutil", ["detach", mount], { stdio: "pipe" });
  attached = false;
  execFileSync(process.execPath, ["scripts/packaged-smoke.ts"], {
    env: { ...process.env, VOIDRA_SMOKE_APP_PATH: copy },
    stdio: "inherit",
    timeout: 60000,
  });
  process.stdout.write(
    "Mounted DMG, copied the unsigned app, detached the image and verified startup from the independent copy with fresh data.\n",
  );
} finally {
  if (attached) execFileSync("hdiutil", ["detach", mount], { stdio: "pipe" });
  await rm(temp, { recursive: true, force: true });
}
