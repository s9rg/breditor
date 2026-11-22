import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from "node:fs";
import test from "node:test";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";

test("candidate summary ranks only completed stages that ran on the job",()=>{
 const directory=mkdtempSync(join(tmpdir(),"breditor-candidate-timings-"));
 try{
  const run=join(directory,"run-Timing1");mkdirSync(run);
  const revision="3".repeat(40),startedAt="2026-11-21T00:00:00.000Z";
  writeFileSync(join(directory,"runner-context.tsv"),`revision\t${revision}\nprofile\tfull\n`);
  const stage=(id,seconds)=>({id,status:"passed",startedAt,finishedAt:new Date(Date.parse(startedAt)+seconds*1000).toISOString()});
  writeFileSync(join(run,"result.json"),JSON.stringify({
   format:"breditor/candidate-qualification",formatVersion:1,profile:"full",status:"passed",source:{commit:revision},
   stages:[stage("shortest",1),stage("third",3),stage("longest",5),stage("second",4),stage("fourth",2),stage("tie",1),
    {...stage("reused",500),execution:"activation-shard"},stage("backwards",-1),{...stage("bad",70),finishedAt:"unknown"},
    {...stage("unfinished",300),status:"running"},stage("unexpected`markup",80)],
  }));
  const executable=fileURLToPath(new URL("./summarize-candidate-run.mjs",import.meta.url));
  const result=spawnSync(process.execPath,[executable,directory],{encoding:"utf8"});
  assert.equal(result.status,0,result.stderr);
  const stageRows=result.stdout.split("\n").filter(line=>line.startsWith("  - "));
  assert.deepEqual(stageRows.map(line=>line.split("`")[1]),["longest","second","third","fourth","shortest"]);
  assert.match(stageRows[0],/took 5\.00 s/);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
