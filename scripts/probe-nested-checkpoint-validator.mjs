// Private source-only validator isolation. Never package/release qualification.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdir,mkdtemp,readFile,readdir,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {build,preview} from "vite";
import {chromium,firefox,webkit} from "playwright-core";
import {waitForFixtureCompletion} from "./fixture-completion.mjs";

assert.equal(process.argv.length,2,"usage: node scripts/probe-nested-checkpoint-validator.mjs");
const repository=fileURLToPath(new URL("../",import.meta.url));
await mkdir(join(repository,"target"),{recursive:true});
const output=await mkdtemp(join(repository,"target/nested-validator-probe-"));
const root=join(repository,"scripts/fixtures/nested-checkpoint-validator"),outDir=join(output,"bundle");
await build({configFile:false,root,logLevel:"warn",build:{outDir,emptyOutDir:false,minify:true,target:"es2022",modulePreload:{polyfill:false}}});
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const bundleAssets={};
for(const name of await readdir(join(outDir,"assets")))bundleAssets[name]=sha(await readFile(join(outDir,"assets",name)));
assert.equal(Object.keys(bundleAssets).some(name=>name.endsWith(".wasm")),false);
const report={status:"running",releaseQualified:false,sourceOnly:true,wasmUsed:false,bundleAssets,runs:[],
  scope:"Synthetic known-valid/invalid V7 nested splice corpus; minified repository source validator, no Wasm/editor/input routing. Not exact failed input, installed package, native or performance/release qualification."};
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
        assert.equal(result.fixtureStatus,"passed");assert.equal(result.fixture.checks,240);assert.deepEqual(result.pageErrors,[]);
        result.status="passed";
      } catch(error) {result.status="failed";result.error=String(error);throw error;}
      finally {await browser?.close();await save();console.log(JSON.stringify({browser:name,run,status:result.status,checks:result.fixture?.checks}));}
    }
  }
  report.status="passed";
} catch(error) {report.status="failed";report.error=String(error);process.exitCode=1;}
finally {await save();await new Promise(resolve=>server.httpServer.close(resolve));}
