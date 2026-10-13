// Private source-only validator isolation. Never package/release qualification.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdir,mkdtemp,readFile,readdir,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {build,preview} from "vite";
import {chromium,firefox,webkit} from "playwright-core";
import {waitForFixtureCompletion} from "./fixture-completion.mjs";
import {readQualifiedPair} from "./build-opt-in-nested-list-package.mjs";

assert.ok(process.argv.length===2||process.argv.length===3&&!process.argv[2].startsWith("--"),"usage: node scripts/probe-nested-checkpoint-validator.mjs [qualified-pair.json]");
const pair=process.argv[2]?await readQualifiedPair(process.argv[2]):null;
const repository=fileURLToPath(new URL("../",import.meta.url));
await mkdir(join(repository,"target"),{recursive:true});
const output=await mkdtemp(join(repository,"target/nested-validator-probe-"));
const root=join(repository,"scripts/fixtures",pair?"nested-checkpoint-producer":"nested-checkpoint-validator"),outDir=join(output,"bundle");
await build({configFile:false,root,logLevel:"warn",...(pair?{resolve:{alias:{"@probe/wasm":join(pair.staging,"wasm/dist/breditor_wasm.js")}}}:{}),build:{outDir,emptyOutDir:false,minify:true,target:"es2022",modulePreload:{polyfill:false}}});
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const bundleAssets={};
for(const name of await readdir(join(outDir,"assets")))bundleAssets[name]=sha(await readFile(join(outDir,"assets",name)));
assert.equal(Object.keys(bundleAssets).some(name=>name.endsWith(".wasm")),!!pair);
if(pair)assert.equal(Object.entries(bundleAssets).find(([name])=>name.endsWith(".wasm"))[1],sha(await readFile(join(pair.staging,"wasm/dist/breditor_wasm_bg.wasm"))));
const report={status:"running",releaseQualified:false,sourceOnly:!pair,wasmUsed:!!pair,bundleAssets,runs:[],...(pair?{qualifiedPair:pair.path,tarballSha256:pair.record.tarballSha256}:{}),
  scope:pair?"Verified generated Rust/Wasm producer plus minified source browser layers through the public editor owner and toolbar; real select/insert/Undo/Redo/V7 restore, synthetic beforeinput insertion and keyboard history. Both declarative and bootstrap-captured runtime contracts checked. No native input or installed browser archive. Diagnostic only; not full packaged/native/performance/release qualification."
    :"Synthetic known-valid/invalid V7 nested splice corpus; minified repository source validator, no Wasm/editor/input routing. Not exact failed input, installed package, native or performance/release qualification."};
const record=join(output,"report.json");
const save=()=>writeFile(record,JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({record}));await save();
const server=await preview({configFile:false,root,logLevel:"warn",build:{outDir},preview:{host:"127.0.0.1",port:0,strictPort:true}});
try {
  const address=server.httpServer.address();assert.ok(address&&typeof address!=="string");
  for(const [name,type] of Object.entries({chromium,firefox,webkit})) {
    for(let run=0;run<3;run++) {
      let browser,page;const result={browser:name,run,status:"running",pageErrors:[]};report.runs.push(result);
      try {
        browser=await type.launch();result.version=browser.version();
        page=await browser.newPage();page.on("pageerror",error=>result.pageErrors.push(String(error)));
        await page.goto(`http://127.0.0.1:${address.port}/`);await waitForFixtureCompletion(page);
        const node=page.locator("#result");result.fixtureStatus=await node.getAttribute("data-status");
        result.fixture=JSON.parse(await node.textContent());
        assert.equal(result.fixtureStatus,"passed");assert.equal(result.fixture.checks,pair?63:240);assert.deepEqual(result.pageErrors,[]);
        if(pair){assert.equal(result.fixture.runtimeContractCaptured,true);assert.equal(result.fixture.contractChecks,126);assert.equal(result.fixture.readerChecks,63);assert.equal(result.fixture.bootstrapChecks,9);assert.equal(result.fixture.adapterChecks,27);assert.equal(result.fixture.routerChecks,27);assert.equal(result.fixture.ownerChecks,36);}
        result.status="passed";
      } catch(error) {result.status="failed";result.error=String(error);throw error;}
      finally {await browser?.close();await save();console.log(JSON.stringify({browser:name,run,status:result.status,checks:result.fixture?.checks}));}
    }
  }
  if(pair)await readQualifiedPair(pair.path);
  report.status="passed";
} catch(error) {report.status="failed";report.error=String(error);process.exitCode=1;}
finally {await save();await new Promise(resolve=>server.httpServer.close(resolve));}
