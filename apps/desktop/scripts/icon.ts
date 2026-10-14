import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

import sharp from "sharp";

const directory = resolve("build/icon.iconset"),
  source = await readFile("build/icon.svg");
await rm(directory, { recursive: true, force: true });
await mkdir(directory, { recursive: true });
try {
  for (const size of [16, 32, 128, 256, 512])
    for (const scale of [1, 2]) {
      await sharp(source)
        .resize(size * scale)
        .png()
        .toFile(
          join(
            directory,
            `icon_${size}x${size}${scale === 2 ? "@2x" : ""}.png`,
          ),
        );
    }
  await sharp(source).resize(1024).png().toFile("build/icon.png");
  execFileSync("iconutil", ["-c", "icns", directory, "-o", "build/icon.icns"]);
} finally {
  await rm(directory, { recursive: true, force: true });
}
