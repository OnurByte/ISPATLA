import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("transport removal preserves historical evidence and is repeatable", () => {
  const directory = mkdtempSync(join(tmpdir(), "ispatla-transport-migration-"));
  const database = join(directory, "state.sqlite3");
  const run = (script: string) => {
    const result = Bun.spawnSync({cmd:[process.execPath,"-e",script],cwd:process.cwd(),env:{...process.env,ISPATLA_DB:database},stdout:"pipe",stderr:"pipe"});
    expect(result.exitCode,new TextDecoder().decode(result.stderr)).toBe(0);
    return new TextDecoder().decode(result.stdout).trim();
  };
  try {
    run(`
      import {ensureDatabase,saveAccount,createDraft,createPublicationIntent} from "./src/server/db.ts";
      import schema from "./docs/migrations/legacy-transport-schema.json";
      import {Database} from "bun:sqlite";
      if(!ensureDatabase())throw Error("init failed");
      const account=saveAccount({accountKey:"historical",handle:"historical",displayName:"Historical",enabled:true,defaultAccount:true,automationMode:"manual",dailyLimit:1,capabilities:[],now:1});
      const draft=createDraft({externalId:"",accountId:account.id,format:"post",text:"Historical draft",now:1});
      const intent=createPublicationIntent({draftId:draft.id,accountId:account.id,idempotencyKey:"historical",text:draft.text,now:1});
      const db=new Database(process.env.ISPATLA_DB);
      for(const [table,columns] of Object.entries(schema.columns))for(const column of columns)db.exec('ALTER TABLE '+table+' ADD COLUMN '+column+' TEXT');
      db.query('UPDATE accounts SET '+schema.columns.accounts[0]+'=? WHERE id=?').run("historical-account",account.id);
      db.query('UPDATE publication_intents SET status=?, '+schema.columns.publication_intents[0]+'=? WHERE id=?').run(schema.intentStatus,"historical-receipt",intent.id);
      db.exec("DELETE FROM schema_migrations WHERE version=24");
      db.close();
    `);
    const inspect = `
      import {ensureDatabase,getPublicationIntent} from "./src/server/db.ts";
      import schema from "./docs/migrations/legacy-transport-schema.json";
      import {Database} from "bun:sqlite";
      if(!ensureDatabase())throw Error("upgrade failed");
      const db=new Database(process.env.ISPATLA_DB);
      const evidence=db.query("SELECT entity,metadata_json FROM legacy_transport_evidence ORDER BY entity").all();
      const remaining=Object.entries(schema.columns).flatMap(([table,columns])=>db.query('PRAGMA table_info('+table+')').all().filter(row=>columns.includes(row.name)));
      console.log(JSON.stringify({evidence:evidence.map(row=>({entity:row.entity,values:Object.values(JSON.parse(row.metadata_json))})),remaining:remaining.length,status:getPublicationIntent(1).status,migrations:db.query("SELECT count(*) AS n FROM schema_migrations WHERE version=24").get().n}));
    `;
    const expected={evidence:[{entity:"accounts",values:["historical-account"]},{entity:"publication_intents",values:["historical-receipt"]}],remaining:0,status:"reconciliation_required",migrations:1};
    expect(JSON.parse(run(inspect))).toEqual(expected);
    expect(JSON.parse(run(inspect))).toEqual(expected);
  } finally { rmSync(directory,{recursive:true,force:true}); }
});
