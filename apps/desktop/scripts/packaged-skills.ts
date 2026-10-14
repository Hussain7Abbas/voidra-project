import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { build } from "esbuild";
/** Exercise Electron's real asar filesystem with disposable installations. */
export async function verifyPackagedSkills(
  executable: string,
  bundleRoot: string,
  temporary: string,
): Promise<void> {
  const output = join(temporary, "packaged-skills-probe.cjs");
  await build({
    stdin: {
      resolveDir: resolve("."),
      contents: `
      import assert from 'node:assert/strict';
      import {mkdir,readFile,stat} from 'node:fs/promises';
      import {join} from 'node:path';
      import {SkillInstaller} from './src/main/skill-installer.ts';
      async function main(){
        const home=join(process.argv[2],'skill-home');await mkdir(home);
        const installer=new SkillInstaller(process.argv[3],home),initial=await installer.status(1);
        assert.equal(initial.length,12);
        for(const row of initial)await installer.apply(await installer.preview(row.agent,row.name,'install'),false);
        const installed=await installer.status(1);
        for(const row of installed){
          assert.equal(row.installedVersion,row.bundledVersion);assert.equal(row.installedFormat,row.bundledFormat);
          assert.equal(row.edited,false);assert.equal(row.blocked,null);assert.equal(row.compatibility,null);
          const folder=join(home,row.agent==='claude'?'.claude':'.agents','skills',row.name);
          assert.match(await readFile(join(folder,'LICENSE'),'utf8'),/GNU AFFERO GENERAL PUBLIC LICENSE/);
        }
        assert.ok((await stat(join(home,'.agents/skills/voidra-go/scripts/process-info'))).mode & 0o111);
        console.log('All six packaged skills install for both agents into a temporary home with matching versions, format/hash markers, executable helper and AGPL licenses.');
      }
      main().catch(error=>{console.error(error);process.exitCode=1});
    `,
    },
    outfile: output,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node24",
    external: ["electron", "better-sqlite3"],
    define: { "import.meta.url": "__voidraModuleURL" },
    banner: {
      js: "const __voidraModuleURL=require('node:url').pathToFileURL(__filename).href;",
    },
  });
  process.stdout.write(
    execFileSync(executable, [output, temporary, bundleRoot], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      encoding: "utf8",
      timeout: 30000,
    }),
  );
}
