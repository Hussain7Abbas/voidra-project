import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { beforeAll, it } from "vitest";
import { nativeCoverageDirectory } from "./coverage-setup.ts";

beforeAll(async () => {
  const cache = resolve(".cache");
  await mkdir(cache, { recursive: true });
  for (const name of await readdir(cache))
    if (name.startsWith("undo-native-"))
      await rm(join(cache, name), { recursive: true, force: true });
});

async function scenario(body: string, timeout = 25000): Promise<void> {
  const temp = await mkdtemp(join(tmpdir(), "voidra-undo-engine-"));
  const root = join(temp, "project");
  await cp(resolve("fixtures/new-project/project"), root, { recursive: true });
  const require = createRequire(resolve("apps/desktop/package.json"));
  const bundleDirectory = await mkdtemp(
    join(resolve(".cache"), "undo-native-"),
  );
  const bundle = join(bundleDirectory, "scenario.cjs");
  try {
    await build({
      stdin: {
        contents: `
        import assert from 'node:assert/strict';
        import {readFile,writeFile,unlink,rm} from 'node:fs/promises';
        import {join} from 'node:path';
        import {execFileSync} from 'node:child_process';
        import {UndoHistory} from ${JSON.stringify(resolve("apps/desktop/src/project-service/undo.ts"))};
        import {ProjectWorkspace} from ${JSON.stringify(resolve("apps/desktop/src/project-service/workspace.ts"))};
        import {createIdea,editIdea,createAction,replaceActionQueue,checkProject,hash,applyOperation,recoverOperation} from ${JSON.stringify(resolve("packages/voidra/src/index.ts"))};
        import {startRun} from ${JSON.stringify(resolve("tools/run-engine/src/run.ts"))};
        import {applySync,syncContext} from ${JSON.stringify(resolve("tools/run-engine/src/sync.ts"))};
        async function main() {
        const Database = require(${JSON.stringify(require.resolve("better-sqlite3"))});
        const root=process.argv[2], databasePath=process.argv[3];
        let db=new Database(databasePath), history=new UndoHistory(root,db);
        const reopen=()=>{db.close();db=new Database(databasePath);history=new UndoHistory(root,db)};
        const idea=async()=>{let id;await history.perform('Create idea',async()=>{id=await createIdea(root,{title:'Original idea',description:'Exact body\\n',by:'You'})});return id};
        const edit=async(id)=>{const p='.voidra/backlog/'+id+'.md';await history.perform('Edit idea',()=>editIdea(root,{id,revision:hash(require('node:fs').readFileSync(join(root,p))),title:'Edited idea',description:'Edited body\\n',status:'new'}));return p};
        const git=(args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
        const initGit=()=>{for(const args of [['init','-q'],['config','user.name','Tests'],['config','user.email','tests@example.test'],['add','.'],['commit','-qm','Initial']])git(args)};
        ${body}
        db.close();
        } main().catch(error => { console.error(error); process.exitCode=1 });
      `,
        resolveDir: resolve("apps/desktop"),
      },
      alias: {
        "voidra/release-preparation": resolve(
          "packages/voidra/src/release-preparation-schema.ts",
        ),
        voidra: resolve("packages/voidra/src/index.ts"),
      },
      define: {
        "import.meta.url": "__voidraModuleURL",
        __voidraProcessHelper: JSON.stringify(
          resolve("skills/voidra-go/scripts/process-info"),
        ),
        __voidraTemplatesRoot: JSON.stringify(resolve("templates")),
      },
      external: ["better-sqlite3", require.resolve("better-sqlite3")],
      outfile: bundle,
      bundle: true,
      platform: "node",
      format: "cjs",
      target: "node24",
      sourcemap: "inline",
      banner: {
        js: "const __voidraModuleURL=require('node:url').pathToFileURL(__filename).href;",
      },
    });
    execFileSync(
      require("electron") as string,
      ["--enable-source-maps", bundle, root, join(temp, "history.sqlite")],
      {
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: "1",
          NODE_PATH: resolve("apps/desktop/node_modules"),
          ...(nativeCoverageDirectory
            ? { NODE_V8_COVERAGE: nativeCoverageDirectory }
            : {}),
        },
        timeout,
        encoding: "utf8",
      },
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
    if (!nativeCoverageDirectory)
      await rm(bundleDirectory, { recursive: true, force: true });
  }
}

it("blocks edits consumed by Sync across restart while later app edits remain reversible", async () => {
  await scenario(`
    initGit(); const id=await idea(); const context=await syncContext(root);
    await applySync(root,{examinedRevision:context.examinedRevision,since:context.since,commits:context.commits.map(c=>c.hash),summary:'Reviewed outside baseline',profiles:[],ideas:[],actions:[]});
    reopen(); let state=await history.state(); assert.match(state.undo.blocked,/Sync .* consumed/);
    await assert.rejects(history.replay('undo',state.undo.revision),/consumed/);
    await edit(id); state=await history.state(); assert.equal(state.undo.blocked,null);
    await history.replay('undo',state.undo.revision);
    assert.match(await readFile(join(root,'.voidra/backlog/'+id+'.md'),'utf8'),/Original idea/);
  `);
});

it("restores exact grouped bytes across restarts and drops redo after a new edit", async () => {
  await scenario(`
    const id=await idea(), p=await edit(id), after=await readFile(join(root,p));
    reopen(); let state=await history.state(); assert.equal(state.undo.label,'Edit idea');
    await history.replay('undo',state.undo.revision); assert.match(await readFile(join(root,p),'utf8'),/Original idea/);
    reopen(); state=await history.state(); await history.replay('redo',state.redo.revision);
    assert.deepEqual(await readFile(join(root,p)),after);
    state=await history.state(); await history.replay('undo',state.undo.revision);
    await idea(); assert.equal((await history.state()).redo.label,null);
    assert.equal((await checkProject(root)).diagnostics.length,0);
  `);
});

it("records actual app creation, promotion, profile and queue edits through the same writer", async () => {
  await scenario(`
    const workspace=new ProjectWorkspace(root,databasePath);
    let value=await workspace.handle({command:'create-idea',title:'App idea',description:'An app edit'});
    assert.equal(value.editing.undo.label,'Create idea');const id=value.ideas[0].data.id;
    value=await workspace.handle({command:'promote-idea',id,revision:value.ideas[0].revision,type:'docs'});
    assert.equal(value.editing.undo.label,'Promote idea');const action=value.actions.find(a=>a.data.title==='App idea');
    value=await workspace.handle({command:'undo',revision:value.editing.undo.revision});
    assert.equal(value.actions.some(a=>a.data.id===action.data.id),false);assert.equal(value.ideas[0].data.status,'new');
    value=await workspace.handle({command:'redo',revision:value.editing.redo.revision});
    const current=value.actions.find(a=>a.data.id===action.data.id),beforeQueue=value.queue;
    value=await workspace.handle({command:'queue-action',id:current.data.id,revision:current.editRevision});
    assert.equal(value.editing.undo.label,'Queue action');
    value=await workspace.handle({command:'undo',revision:value.editing.undo.revision});assert.deepEqual(value.queue,beforeQueue);
    const profile=value.profiles.find(p=>p.data.block==='problem');
    value=await workspace.handle({command:'edit-profile-answer',block:'problem',id:'goal',value:'Edited goal',revision:profile.revision});
    assert.equal(value.editing.undo.label,'Edit profile answer');
    value=await workspace.handle({command:'undo',revision:value.editing.undo.revision});
    assert.equal(value.profiles.find(p=>p.data.block==='problem').data.answers[0].answer,'Save and reopen private project notes offline.');
    await workspace.close();
  `);
});

it("asks before outside overwrites, rejects stale confirmations and preserves Cancel", async () => {
  await scenario(`
    const id=await idea(),p=await edit(id);await writeFile(join(root,p),(await readFile(join(root,p),'utf8')).replace('Edited body','Teammate body'));
    let state=await history.state();assert.deepEqual(state.undo.conflicts,[p]);
    await assert.rejects(history.replay('undo',state.undo.revision),/changed on disk/);
    assert.match(await readFile(join(root,p),'utf8'),/Teammate body/);
    const stale=state.undo.overwriteRevision;
    await writeFile(join(root,p),(await readFile(join(root,p),'utf8')).replace('Teammate body','New teammate body'));
    await assert.rejects(history.replay('undo',state.undo.revision,stale),/changed on disk/);
    state=await history.state();await history.replay('undo',state.undo.revision,state.undo.overwriteRevision);
    assert.match(await readFile(join(root,p),'utf8'),/Original idea/);
  `);
});

it("undoes initialization to an absent shared project and can redo it after restart", async () => {
  await scenario(`
    const metadata=await readFile(join(root,'.voidra/voidra.json'),'utf8');
    await rm(join(root,'.voidra'),{recursive:true});
    await history.perform('Create planning folder',()=>applyOperation(root,{changes:[
      {path:'.voidra/voidra.json',expectedHash:null,content:metadata},
      {path:'.voidra/README.md',expectedHash:null,content:'# Planning\\n'},
      {path:'.voidra/.gitignore',expectedHash:null,content:'local/\\n'}
    ]}));
    let state=await history.state();await history.replay('undo',state.undo.revision);
    await assert.rejects(readFile(join(root,'.voidra/voidra.json')),/ENOENT/);
    reopen();state=await history.state();assert.equal(state.redo.label,'Create planning folder');
    await history.replay('redo',state.redo.revision);
    assert.equal(await readFile(join(root,'.voidra/voidra.json'),'utf8'),metadata);
    assert.equal((await checkProject(root)).diagnostics.length,0);
  `);
});

it("routes onboarding through history and allows a different initialization after undo", async () => {
  await scenario(`
    const baseline=await checkProject(root),answers=Object.fromEntries([...baseline.records.values()].filter(r=>r.kind==='profile').flatMap(r=>r.document.data.answers.map(a=>[r.document.data.block+'.'+a.id,a.answer])));
    await rm(join(root,'.voidra'),{recursive:true});
    const workspace=new ProjectWorkspace(root,databasePath);
    let value=await workspace.handle({command:'initialize-profile',template:'general',name:'First profile',answers});
    assert.equal(value.editing.undo.label,'Create project profile');assert.equal(value.profiles.length,9);
    value=await workspace.handle({command:'undo',revision:value.editing.undo.revision});assert.equal(value.hasVoidra,false);
    await writeFile(join(root,'.voidra/kept.txt'),'Keep this outside file');
    await assert.rejects(workspace.handle({command:'initialize-profile',template:'general',name:'Different profile',answers}),/already exists/);
    assert.equal(await readFile(join(root,'.voidra/kept.txt'),'utf8'),'Keep this outside file');await unlink(join(root,'.voidra/kept.txt'));
    value=await workspace.handle({command:'initialize-profile',template:'general',name:'Different profile',answers});
    assert.equal(value.name,'Different profile');assert.equal(value.editing.redo.label,null);assert.equal(value.profiles.length,9);
    assert.equal((await checkProject(root)).diagnostics.length,0);await workspace.close();
  `);
});

it("exposes recovery for an interrupted initialization even before metadata exists", async () => {
  await scenario(`
    const metadata=await readFile(join(root,'.voidra/voidra.json'),'utf8');await rm(join(root,'.voidra'),{recursive:true});
    await assert.rejects(history.perform('Create planning folder',()=>applyOperation(root,{id:'op-222222',changes:[
      {path:'.voidra/voidra.json',expectedHash:null,content:metadata},
      {path:'.voidra/README.md',expectedHash:null,content:'# Planning\\n'},
      {path:'.voidra/.gitignore',expectedHash:null,content:'local/\\n'}
    ]},{checkpoint:point=>{if(point==='journal-prepared')throw new Error('Interrupted')}})),/Interrupted/);
    const workspace=new ProjectWorkspace(root,databasePath),value=await workspace.snapshot();
    assert.equal(value.hasVoidra,false);assert.equal(value.recoveries[0].id,'op-222222');
    await recoverOperation(root,'op-222222');assert.equal((await workspace.snapshot()).editing.undo.label,'Create planning folder');await workspace.close();
  `);
});

for (const rollback of [false, true])
  it(`reconciles an interrupted app write after ${rollback ? "rollback" : "completion"} without losing file history`, async () => {
    await scenario(`
      const path='.voidra/README.md',before=await readFile(join(root,path),'utf8');
      await assert.rejects(history.perform('Interrupted edit',()=>applyOperation(root,{id:'op-111111',changes:[{path,expectedHash:hash(before),content:before+'\\nNew note.\\n'}]},{checkpoint:point=>{if(point==='journal-prepared')throw new Error('Interrupted')}})),/Interrupted/);
      assert.equal((await history.state()).undo.label,null);
      await recoverOperation(root,'op-111111',{rollback:${rollback}});reopen();
      const state=await history.state();
      assert.equal(state.undo.label,${rollback ? "null" : "'Interrupted edit'"});
      ${rollback ? "assert.equal(await readFile(join(root,path),'utf8'),before);" : "await history.replay('undo',state.undo.revision);assert.equal(await readFile(join(root,path),'utf8'),before);"}
    `);
  });

for (const direction of ["undo", "redo"])
  it(`blocks ${direction} from a durable consumed linked record after an interrupted run and lock removal`, async () => {
    await scenario(`
      initGit();const id=await idea();await edit(id);
      ${direction === "redo" ? "let s=await history.state();await history.replay('undo',s.undo.revision);" : ""}
      const action=await createAction(root,{type:'docs',title:'Agent work',description:'Read the planning records',by:'You'});
      const project=await checkProject(root);await replaceActionQueue(root,{ids:[action],revision:null,by:'You'});
      const ctx=await startRun(root,'codex',process.pid);assert.ok(ctx);
      await unlink(join(root,'.voidra/local/run.lock'));reopen();
      const state=await history.state();assert.match(state.${direction}.blocked,new RegExp(ctx.run));
      await assert.rejects(history.replay('${direction}',state.${direction}.revision),/consumed/);
      assert.equal(git(['rev-list','--count','HEAD']),'1');
    `);
  });

it("bounds deduplicated history and isolates corrupt history from project/index data", async () => {
  await scenario(
    `
    db.exec("create table actions (id text primary key, value text); insert into actions values ('kept','cached')");
    for(let n=0;n<105;n++)await idea();
    assert.equal(db.prepare('select count(*) as n from undo_operations').get().n,100);
    db.prepare('update undo_operations set changes = ?').run('broken');
    reopen();const state=await history.state();assert.equal(state.undo.label,null);assert.match(state.notice,/history/);
    assert.equal(db.prepare('select value from actions where id=?').get('kept').value,'cached');
    assert.equal((await checkProject(root)).diagnostics.length,0);await idea();
    assert.equal((await history.state()).undo.label,'Create idea');
  `,
    60000,
  );
}, 75000);
