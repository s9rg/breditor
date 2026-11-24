import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {copyFileSync,existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname,join} from "node:path";
import {pathToFileURL} from "node:url";
import test from "node:test";
import {readPinnedInputRuleArtifact} from "./input-rule-historical-references.mjs";

const json=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),"utf8"));
const artifact=(path,contents)=>({path,bytes:Buffer.byteLength(contents),sha256:createHash("sha256").update(contents).digest("hex")});

test("historical input-rule pins preserve every file from the retained reports",()=>{
 const actual=json("./input-rule-historical-pins.json");
 const earlierReport="docs/qualification/2026-10-18-native-input-rules.json";
 const programmaticReport="docs/qualification/2026-10-18-exclusive-input-rules-sdk.json";
 const declarations=[
  ["earlier",earlierReport,json(`../${earlierReport}`).verification.retainedEarlierRuntime.artifacts],
  ["programmatic",programmaticReport,json(`../${programmaticReport}`).runtimeBuild.artifacts],
 ];
 const expected=declarations.flatMap(([generation,report,artifacts])=>["local","shared"].map(runtime=>{
  const marker=`/${runtime}/`;
  const files=artifacts.filter(file=>file.path.includes(marker)).map(({path,bytes,sha256})=>({
   path:path.split(marker)[1],bytes,sha256,
  }));
  return {generation,runtime,report,files};
 }));
 assert.deepEqual(actual,expected);
});

test("historical artifact admission refuses missing, nonregular and modified files",()=>{
 const root=mkdtempSync(join(tmpdir(),"breditor-historical-pin-test-"));
 try{
  const contents="retained runtime glue";
  const pin=artifact("runtime.js",contents);
  assert.throws(()=>readPinnedInputRuleArtifact(root,pin),/Expected a regular historical input-rule artifact/);
  mkdirSync(join(root,pin.path));
  assert.throws(()=>readPinnedInputRuleArtifact(root,pin),/Expected a regular historical input-rule artifact/);
  rmSync(join(root,pin.path),{recursive:true});
  writeFileSync(join(root,pin.path),contents);
  assert.equal(readPinnedInputRuleArtifact(root,pin).toString(),contents);
  writeFileSync(join(root,pin.path),contents.slice(1));
  assert.throws(()=>readPinnedInputRuleArtifact(root,pin),/bytes, expected/);
  writeFileSync(join(root,pin.path),contents.replace("retained","modified"));
  assert.throws(()=>readPinnedInputRuleArtifact(root,pin),/digest .* does not match/);
 }finally{
  rmSync(root,{recursive:true,force:true});
 }
});

test("historical probes verify the complete pair before running glue in a private snapshot",async()=>{
 const root=mkdtempSync(join(tmpdir(),"breditor-historical-load-test-"));
 try{
  const wasm=Buffer.from([0,97,115,109,1,0,0,0]);
  const pins=[];
  const directories=["local","shared"].map(runtime=>{
   const base=runtime==="local"?"breditor_wasm":"breditor_shared";
   const glue='import { label } from "./snippets/inline.js";\nexport const location=import.meta.url;\nexport default async ({module_or_path})=>{await WebAssembly.instantiate(module_or_path);globalThis.__breditorHistoricalInputRuleTest=label;};\n';
   const files=[
    [`${base}.js`,glue], [`${base}_bg.wasm`,wasm], ["snippets/inline.js",`export const label=${JSON.stringify(runtime)};\n`],
   ];
   const directory=join(root,runtime);
   for(const [path,contents] of files){
    const destination=join(directory,path);
    mkdirSync(dirname(destination),{recursive:true});
    writeFileSync(destination,contents);
   }
   pins.push({generation:"earlier",runtime,files:files.map(([path,contents])=>artifact(path,contents))});
   return directory;
  });
  const helper=join(root,"input-rule-historical-references.mjs");
  copyFileSync(new URL("./input-rule-historical-references.mjs",import.meta.url),helper);
  writeFileSync(join(root,"input-rule-historical-pins.json"),JSON.stringify(pins));
  const {loadHistoricalInputRuleRuntimes,preflightHistoricalInputRuleRuntimes}=await import(pathToFileURL(helper));
  const sharedSnippet=join(directories[1],"snippets/inline.js");
  const original=readFileSync(sharedSnippet,"utf8");
  writeFileSync(sharedSnippet,original.replace("shared","alterd"));
  assert.throws(()=>preflightHistoricalInputRuleRuntimes(directories),/digest .* does not match/);
  await assert.rejects(loadHistoricalInputRuleRuntimes(directories),/digest .* does not match/);
  assert.equal(globalThis.__breditorHistoricalInputRuleTest,undefined);
  writeFileSync(sharedSnippet,original);
  preflightHistoricalInputRuleRuntimes(directories);
  const modules=await loadHistoricalInputRuleRuntimes(directories);
  assert.equal(globalThis.__breditorHistoricalInputRuleTest,"shared");
  assert.deepEqual(modules.map(row=>row.reference),pins);
  for(const [index,{module}] of modules.entries()){
   const declared=pathToFileURL(join(directories[index],index===0?"breditor_wasm.js":"breditor_shared.js"));
   assert.notEqual(module.location,declared.href);
   assert.equal(existsSync(new URL(module.location)),false);
  }
 }finally{
  delete globalThis.__breditorHistoricalInputRuleTest;
  rmSync(root,{recursive:true,force:true});
 }
});
