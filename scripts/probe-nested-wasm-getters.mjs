// Packed installed Wasm + exact retained bridge; no browser editor runtime.
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {cp, mkdtemp, readFile, readdir, writeFile} from "node:fs/promises";
import {dirname,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {build,preview} from "vite";
import {webkit} from "playwright-core";
import {readQualifiedPair} from "./build-opt-in-nested-list-package.mjs";
import {webkitReplayTier} from "./webkit-replay-tier.mjs";
import {verifyFailureBundle,retainNestedListFailure} from "./retain-nested-list-failure.mjs";
import {waitForTerminalFixtureCompletion} from "./fixture-completion.mjs";
import {instrumentChildCountReturn,childCountSentinelSameValue,captureLastChildCountReturn,childCountUnsignedIndex} from "./child-count-return-diagnostics.mjs";
import {DIRECT_GETTER_BRIDGE} from "./direct-getter-bridge.mjs";

assert.equal(process.argv.length,3,"usage: node scripts/probe-nested-wasm-getters.mjs <private pair qualification.json>");
const repository=fileURLToPath(new URL("../",import.meta.url));
const {record,path:packageRecord}=await readQualifiedPair(process.argv[2]);
const tier=webkitReplayTier(process.env);assert.equal(tier.mode,"default");
const ownerFlag=process.env.BREDITOR_GETTER_OWNERS??"30";
assert.ok(["1","30","100","300"].includes(ownerFlag),"getter owners must be 1, 30, 100 or 300");
const ownerRepetitions=Number(ownerFlag);
const getterSequence=process.env.BREDITOR_GETTER_SEQUENCE??"all";
const treeShape=process.env.BREDITOR_GETTER_TREE??"nested";
assert.ok(["nested","flat-list","paragraphs"].includes(treeShape),"invalid getter tree shape");
assert.ok(["all","shape","child-count"].includes(getterSequence),"invalid getter sequence");
const walkFlag=process.env.BREDITOR_GETTER_WALKS??"1";
assert.ok(["1","100"].includes(walkFlag),"getter walks must be 1 or 100");
const walkRepetitions=Number(walkFlag);
const keepOwnersFlag=process.env.BREDITOR_GETTER_KEEP_OWNERS??"0";
const wordDirectory=process.env.BREDITOR_GETTER_WORD_CANDIDATE;
const wordCandidateSelected=wordDirectory!==undefined;
const wordRouting=process.env.BREDITOR_GETTER_WORD_ROUTING??"word";
assert.ok(["word","legacy"].includes(wordRouting));
assert.ok(wordRouting!=="legacy"||wordCandidateSelected,"legacy comparison requires the same private word Wasm");
const wordChildCountTransport=wordCandidateSelected&&wordRouting==="word";
const wordFields=process.env.BREDITOR_GETTER_WORD_FIELDS??"child-count";
assert.ok(["child-count","all"].includes(wordFields));
const allWordScalars=wordFields==="all";
const enrichedFlag=process.env.BREDITOR_GETTER_ENRICHED??"0";
assert.ok(["0","1"].includes(enrichedFlag));const enrichedScalars=enrichedFlag==="1";
assert.ok(!enrichedScalars||getterSequence==="all","enriched coverage requires all getters");
assert.ok(!allWordScalars||wordChildCountTransport,"all word scalars require private word Wasm");
assert.ok(["0","1"].includes(keepOwnersFlag));const keepProjectionOwners=keepOwnersFlag==="1";
const fixture=await mkdtemp(join(record.consumer,"getter-probe-"));
const rawTraceFlag=process.env.BREDITOR_GETTER_RAW_TRACE??"0";
assert.ok(["0","1"].includes(rawTraceFlag));const rawTrace=rawTraceFlag==="1";
const treatmentFlag=process.env.BREDITOR_GETTER_SENTINEL_SAMEVALUE??"0";
assert.ok(["0","1"].includes(treatmentFlag));const sentinelTreatment=treatmentFlag==="1";
assert.ok(!(rawTrace&&sentinelTreatment),"raw trace and sentinel treatment are separate experiments");
const fixedArityFlag=process.env.BREDITOR_GETTER_FIXED_ARITY??"0";
assert.ok(["0","1"].includes(fixedArityFlag));const fixedArity=fixedArityFlag==="1";
assert.ok(!(fixedArity&&(rawTrace||sentinelTreatment)),"change one boundary at a time");
const lastCaptureFlag=process.env.BREDITOR_GETTER_LAST_CAPTURE??"0";
assert.ok(["0","1"].includes(lastCaptureFlag));const lastCapture=lastCaptureFlag==="1";
assert.ok(!(lastCapture&&(fixedArity||rawTrace||sentinelTreatment)),"last capture is a separate experiment");
const directCallFlag=process.env.BREDITOR_GETTER_DIRECT_CALL??"0";
assert.ok(["0","1"].includes(directCallFlag));const directCall=directCallFlag==="1";
assert.ok(!(directCall&&(lastCapture||fixedArity||rawTrace||sentinelTreatment)),"direct calls are a separate experiment");
const unsignedFlag=process.env.BREDITOR_GETTER_UNSIGNED_INDEX??"0";
assert.ok(["0","1"].includes(unsignedFlag));const unsignedIndex=unsignedFlag==="1";
assert.ok(!(unsignedIndex&&(directCall||lastCapture||fixedArity||rawTrace||sentinelTreatment||keepProjectionOwners)),"unsigned index is a separate experiment");
await cp(join(repository,"scripts/fixtures/nested-getter-probe"),fixture,{recursive:true});
const originalMain=await readFile(join(fixture,"main.ts"),"utf8");
assert.equal(originalMain.split("const ownerRepetitions = 30;").length,2);
assert.equal(originalMain.split('const getterSequence: string = "all";').length,2);
assert.equal(originalMain.split("const walkRepetitions = 1;").length,2);
assert.equal(originalMain.split("const keepProjectionOwners = false;").length,2);
assert.equal(originalMain.split('const treeShape: string = "nested";').length,2);
assert.equal(originalMain.split("const wordChildCountTransport = false;").length,2);
assert.equal(originalMain.split("const allWordScalars = false;").length,2);
assert.equal(originalMain.split("const enrichedScalars = false;").length,2);
await writeFile(join(fixture,"main.ts"),originalMain.replace("const ownerRepetitions = 30;",`const ownerRepetitions = ${ownerRepetitions};`).replace('const getterSequence: string = "all";',`const getterSequence: string = ${JSON.stringify(getterSequence)};`).replace("const walkRepetitions = 1;",`const walkRepetitions = ${walkRepetitions};`).replace("const keepProjectionOwners = false;",`const keepProjectionOwners = ${keepProjectionOwners};`).replace('const treeShape: string = "nested";',`const treeShape: string = ${JSON.stringify(treeShape)};`).replace("const wordChildCountTransport = false;",`const wordChildCountTransport = ${wordChildCountTransport};`));
if(allWordScalars)await writeFile(join(fixture,"main.ts"),(await readFile(join(fixture,"main.ts"),"utf8")).replace("const allWordScalars = false;","const allWordScalars = true;"));
if(enrichedScalars)await writeFile(join(fixture,"main.ts"),(await readFile(join(fixture,"main.ts"),"utf8")).replace("const enrichedScalars = false;","const enrichedScalars = true;"));
// Explicitly separate diagnostic Wasm from the qualified packed control.
let diagnosticWasmAssets;
const diagnosticFiles=["breditor_wasm.js","breditor_wasm.d.ts","breditor_wasm_bg.wasm","breditor_wasm_bg.wasm.d.ts"];
const diagnosticHashes=async directory=>Object.fromEntries(await Promise.all(diagnosticFiles.map(async name=>[name,createHash("sha256").update(await readFile(join(directory,name))).digest("hex")])));
const diagnosticDirectory=process.env.BREDITOR_GETTER_RUST_DIAGNOSTIC;
const candidateDirectory=process.env.BREDITOR_GETTER_WASM_CANDIDATE;
assert.ok([diagnosticDirectory,candidateDirectory,wordDirectory].filter(value=>value!==undefined).length<=1,"private Wasm variants must be tested separately");
assert.ok(!(wordCandidateSelected&&(unsignedIndex||directCall||fixedArity||lastCapture||rawTrace||sentinelTreatment||keepProjectionOwners)),"word transport is a separate experiment");
const privateDirectory=diagnosticDirectory??candidateDirectory??wordDirectory;
assert.ok(!(unsignedIndex&&privateDirectory!==undefined),"unsigned index requires original packed Wasm");
assert.ok(!(keepProjectionOwners&&(privateDirectory!==undefined||directCall||fixedArity||lastCapture||rawTrace||sentinelTreatment)),"owner retention is tested independently on original packed Wasm");
assert.ok(!(directCall&&privateDirectory!==undefined),"direct-call experiment requires original packed Wasm");
const explicitChildCountTransport=candidateDirectory!==undefined;
let privateDestination;
let wasmModule=join(record.consumer,"node_modules/@breditor/wasm/dist/breditor_wasm.js");
if(privateDirectory!==undefined){
  assert.equal(resolve(privateDirectory),join(repository,wordCandidateSelected?"target/nested-child-count-words/pkg":explicitChildCountTransport?"target/nested-child-count-candidate/pkg":"target/nested-child-count-diagnostic/pkg"),"only isolated child-count experiment directory admitted");
  const privateFolder=explicitChildCountTransport?"rust-candidate":"rust-diagnostic";
  const destination=join(fixture,privateFolder);privateDestination=destination;await cp(resolve(privateDirectory),destination,{recursive:true});
  diagnosticWasmAssets=await diagnosticHashes(destination);
  if(wordCandidateSelected)assert.ok((await readFile(join(destination,"breditor_wasm.d.ts"),"utf8")).includes("childCountWords(index: number): Uint32Array;"),"missing word-count transport");
  else if(!explicitChildCountTransport)assert.ok((await readFile(join(destination,"breditor_wasm.d.ts"),"utf8")).includes("export function debugLastProjectionChildCount(): string;"),"missing Rust computed-result trace");
  else assert.ok((await readFile(join(destination,"breditor_wasm.d.ts"),"utf8")).includes("childCount(index: number): number | undefined;"),"candidate must preserve public JS child-count contract");
  wasmModule=join(destination,"breditor_wasm.js");
  const main=await readFile(join(fixture,"main.ts"),"utf8");
  assert.equal(main.split('from "@breditor/wasm"').length,2);
  await writeFile(join(fixture,"main.ts"),main.replace('from "@breditor/wasm"',`from "./${privateFolder}/breditor_wasm.js"`));
}
for(const name of ["package.json","tsconfig.json"])await cp(join(record.consumer,name),join(fixture,name));
const bridge='function z(e,t,...n){let r=Reflect.apply(e,t,n);if(Ph(r))throw TypeError(`generated scalar method returned a thenable`);return r}';
const guard='function Ph(e){if((typeof e!=`object`||!e)&&typeof e!=`function`)return!1;let t;try{t=e.then}catch{return!0}return t!==void 0&&(Rh(e),!0)}';
const controlPath=join(repository,"target/nested-list-reproductions/failure-WsjQQ6/measurement.json");
const controlManifest=JSON.parse(await readFile(join(dirname(controlPath),"retention.json")));
const verifiedControl=await verifyFailureBundle(controlPath,controlManifest);
const control=verifiedControl.files["bundle/assets/index-DEzwFtBf.js"].toString("utf8");
assert.ok(control.includes(bridge)&&control.includes(guard),"inspected retained bridge changed");
// Getter return values are primitive; thenable containment must remain unreachable.
const fixtureBridge=directCall?DIRECT_GETTER_BRIDGE:fixedArity?'function z(e,t,index,child){let r;if(arguments.length===3)r=Reflect.apply(e,t,[index]);else if(arguments.length===4)r=Reflect.apply(e,t,[index,child]);else throw Error("Unexpected getter arity");if(Ph(r))throw TypeError(`generated scalar method returned a thenable`);return r}':bridge;
await writeFile(join(fixture,"bridge.js"),`${fixtureBridge}\n${guard}\nfunction Rh(){throw Error("Unexpected non-primitive generated scalar");}\nexport {z as bridgeInvoke};`);
const types=spawnSync(process.execPath,[join(repository,"node_modules/typescript/bin/tsc"),"-p",join(fixture,"tsconfig.json")],{encoding:"utf8"});
assert.equal(types.status,0,`${types.stdout}\n${types.stderr}`);
let transformedModules=0;
const plugin={name:"child-count-private-experiment",enforce:"pre",transform(code,id){if(id===wasmModule){transformedModules++;return unsignedIndex?childCountUnsignedIndex(code):lastCapture?captureLastChildCountReturn(code):rawTrace?instrumentChildCountReturn(code):childCountSentinelSameValue(code);}}};
await build({configFile:false,root:fixture,logLevel:"warn",plugins:rawTrace||sentinelTreatment||lastCapture||unsignedIndex?[plugin]:[],build:{outDir:join(fixture,"bundle"),minify:true,target:"es2022",modulePreload:{polyfill:false}}});
assert.equal(transformedModules,rawTrace||sentinelTreatment||lastCapture||unsignedIndex?1:0,"getter experiment transform count");
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
const bundleAssets=Object.fromEntries(await Promise.all((await readdir(join(fixture,"bundle/assets"))).sort().map(async name=>[name,hash(await readFile(join(fixture,"bundle/assets",name)))])));
const report={status:"running",fixture,fixtureKind:"nested-getter-probe",browserName:"webkit",ownerRepetitions,getterSequence,treeShape,walkRepetitions,keepProjectionOwners,runCount:10,editTarget:"root",bundleAssets,
  packageRecord,tarballSha256:record.tarballSha256,
  bridgeSha256:hash(fixtureBridge),controlBridgeSha256:hash(bridge),fixedArityBridgeTreatment:fixedArity,directCallBridgeTreatment:directCall,guardSha256:hash(guard),fixtureSha256:hash(await readFile(join(fixture,"main.ts"))),
  releaseQualified:false,releasePerformanceQualified:false,editorLoaded:false,rawChildCountTraceEnabled:rawTrace,
  childCountSentinelSameValueTreatment:sentinelTreatment,lastChildCountCaptureEnabled:lastCapture,unsignedChildCountIndexTreatment:unsignedIndex,
  diagnosticWasmAssets,explicitChildCountTransport,wordChildCountTransport,wordCandidateSelected,wordRouting,allWordScalars,enrichedScalars,qualifiedPackedWasmUsed:diagnosticWasmAssets===undefined,
  scope:"Real generated nested projection getters through retained bridge; minified standalone consumer, no editor/renderer/history/native input",runs:[]};
const save=async()=>{const bytes=JSON.stringify({...report,measurements:report.runs},null,2);await writeFile(join(fixture,"report.json"),bytes);await writeFile(join(fixture,"measurement.json"),bytes);};await save();
console.log(JSON.stringify({fixture}));
const server=await preview({configFile:false,root:fixture,logLevel:"warn",build:{outDir:join(fixture,"bundle")},preview:{host:"127.0.0.1",port:0,strictPort:true}});
try{
  for(let run=0;run<10;run++){
    let browser;const result={run,status:"running",pageErrors:[]};report.runs.push(result);
    try{
      browser=await webkit.launch({env:tier.browserEnvironment});result.version=browser.version();
      const page=await browser.newPage();page.on("pageerror",error=>{if(result.pageErrors.length<16)result.pageErrors.push(String(error));});
      await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
      await waitForTerminalFixtureCompletion(page,60000);
      result.fixtureStatus=await page.locator("#result").getAttribute("data-status");result.details=await page.locator("#result").textContent();
      assert.equal(result.fixtureStatus,"passed",result.details);assert.deepEqual(result.pageErrors,[]);
      const details=JSON.parse(result.details);
      assert.equal(details.owners,String(3*ownerRepetitions));
      assert.equal(details.cleanupCompleted,true);
      assert.equal(details.retainedOwnerCount,String(keepProjectionOwners?6*ownerRepetitions:0));result.status="passed";
    }catch(error){result.status="failed";result.error=String(error);}
    finally{await browser?.close();await save();}
    console.log(JSON.stringify({run,status:result.status,details:result.details}));if(result.status==="failed")break;
  }
  await readQualifiedPair(process.argv[2]);
  if(diagnosticWasmAssets!==undefined)assert.deepEqual(await diagnosticHashes(privateDestination),diagnosticWasmAssets,"copied private Wasm artifacts changed during the run");
  report.status=report.runs.every(run=>run.status==="passed")?"passed":"failed";await save();
  if(report.status==="failed"){
    console.log(JSON.stringify({retained:await retainNestedListFailure(join(fixture,"measurement.json"),join(repository,"target/nested-list-reproductions"))}));
    process.exitCode=1;
  }
}finally{await new Promise(resolveClose=>server.httpServer.close(resolveClose));}
