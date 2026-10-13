import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { beforeAll, it } from "vitest";
import { nativeCoverageDirectory } from "./coverage-setup.ts";

beforeAll(async () => {
  await mkdir(resolve(".cache"), { recursive: true });
  for (const name of await readdir(resolve(".cache")))
    if (name.startsWith("knowledge-native-"))
      await rm(resolve(".cache", name), { recursive: true, force: true });
});
it("searches actual SQLite FTS with ranking, kind/action/date filters and literal input, and rebuilds from sources", async () => {
  const temp = await mkdtemp(join(tmpdir(), "voidra-knowledge-db-")),
    bundleDirectory = await mkdtemp(resolve(".cache/knowledge-native-")),
    bundle = join(bundleDirectory, "scenario.cjs"),
    require = createRequire(resolve("apps/desktop/package.json"));
  try {
    await build({
      stdin: {
        contents: `
      import assert from 'node:assert/strict';
      import {KnowledgeIndex} from ${JSON.stringify(resolve("apps/desktop/src/project-service/knowledge.ts"))};
      const Database=require(${JSON.stringify(require.resolve("better-sqlite3"))});
      const db=new Database(process.argv[2]),index=new KnowledgeIndex(db);
      const base={assumed:false,path:'.voidra/actions/act-000000/questions.md',anchor:'q-000000',action:'act-000000',at:'2026-10-13T12:00:00Z',by:'You',revision:'a'.repeat(64),state:'recorded'};
      index.replace([
        {...base,id:'question:first',kind:'question',title:'Export notes',text:'Choose a private backup'},
        {...base,id:'question:second',kind:'question',title:'Backup strategy',text:'Export all notes',assumed:true,at:'2026-10-12T12:00:00Z'},
        {...base,id:'adr:storage',kind:'adr',title:'Local storage',text:'Keep notes private',action:null,path:'docs/adr/storage.md'},
      ]);
      assert.equal(index.search({q:'Export'}).items[0].id,'question:first');
      assert.equal(index.search({kind:'assumption'}).total,1);
      assert.equal(index.search({kind:'adr'}).items[0].path,'docs/adr/storage.md');
      assert.equal(index.search({action:'act-000000'}).total,2);
      assert.equal(index.search({from:'2026-10-13',through:'2026-10-13'}).total,2);
      assert.equal(index.search({q:'" OR 1=1 --'}).total,0);
      assert.equal(index.search({limit:1,offset:1}).items.length,1);
      assert.equal(index.search({q:'unavailable'}).total,0);
      index.replace([]);assert.equal(index.search({}).total,0);
      db.close();
    `,
        resolveDir: resolve("apps/desktop"),
      },
      alias: { voidra: resolve("packages/voidra/src/index.ts") },
      external: ["better-sqlite3", require.resolve("better-sqlite3")],
      outfile: bundle,
      bundle: true,
      platform: "node",
      format: "cjs",
      target: "node24",
      sourcemap: "inline",
      define: { "import.meta.url": "__voidraModuleURL" },
      banner: {
        js: "const __voidraModuleURL=require('node:url').pathToFileURL(__filename).href;",
      },
    });
    execFileSync(
      require("electron") as string,
      ["--enable-source-maps", bundle, join(temp, "index.sqlite")],
      {
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: "1",
          NODE_PATH: resolve("apps/desktop/node_modules"),
          ...(nativeCoverageDirectory
            ? { NODE_V8_COVERAGE: nativeCoverageDirectory }
            : {}),
        },
        encoding: "utf8",
        timeout: 25000,
      },
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
    if (!nativeCoverageDirectory)
      await rm(bundleDirectory, { recursive: true, force: true });
  }
});
