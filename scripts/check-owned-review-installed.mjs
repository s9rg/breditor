/** Local archives only. Runs the real mixed workflow through installed editor/collaboration
 * exports and their packaged Wasm. Fixtures/host remain local; nothing is published. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {cpSync,mkdirSync,mkdtempSync,realpathSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname,join,resolve,sep} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {probeSuggestionSyncSdk} from "./probe-suggestion-sync-sdk.mjs";
import {probeSuggestionObserverSdk} from "./probe-suggestion-observer-sdk.mjs";

export async function checkOwnedReviewInstalled(executable,{includeObserver=false}={}){
 const root=resolve(dirname(fileURLToPath(import.meta.url)),".."),temporary=mkdtempSync(join(tmpdir(),"breditor-owned-review-installed-")),archives=join(temporary,"archives"),consumer=join(temporary,"consumer");
 mkdirSync(archives);mkdirSync(consumer);writeFileSync(join(consumer,"package.json"),JSON.stringify({name:"breditor-owned-review-consumer",private:true,type:"module"}));
 const packages=["@breditor/browser","@breditor/experimental-rich-content","@breditor/collaboration","@breditor/editor"];
 const packed=JSON.parse(execFileSync("npm",["pack","--ignore-scripts","--json","--pack-destination",archives,...packages.flatMap(name=>["--workspace",name])],{cwd:root,encoding:"utf8"}));
 const paths=packed.map(pack=>join(archives,pack.filename));
 execFileSync("npm",["install","--offline","--ignore-scripts","--no-audit","--no-fund","--package-lock=false",...paths],{cwd:consumer,stdio:["ignore","ignore","pipe"]});
 const specifiers=[...packages,"@breditor/editor/collaboration","@breditor/collaboration/wasm"],resolved=JSON.parse(execFileSync(process.execPath,["--input-type=module","-e",`console.log(JSON.stringify(${JSON.stringify(specifiers)}.map(name=>import.meta.resolve(name))))`],{cwd:consumer,encoding:"utf8"})),installed=resolved.slice(0,packages.length).map(url=>realpathSync(fileURLToPath(url)));
 for(const file of installed)assert.ok(file.startsWith(realpathSync(consumer)+sep),"Production dependencies must resolve in the clean installed consumer");
 cpSync(join(root,"scripts/fixtures/editor-consumer/types-reviewed.ts"),join(consumer,"types-reviewed.ts"));
 execFileSync(join(root,"node_modules/.bin/tsc"),["--noEmit","--strict","--target","ES2022","--module","NodeNext","--lib","ES2022,DOM","types-reviewed.ts"],{cwd:consumer,stdio:["ignore","ignore","pipe"]});
 const sdkDirectory=pathToFileURL(dirname(installed[2])+sep),sdkModule=pathToFileURL(realpathSync(fileURLToPath(resolved[4]))),wasmDirectory=dirname(realpathSync(fileURLToPath(resolved[5])));
 assert.ok(fileURLToPath(sdkModule).startsWith(realpathSync(consumer)+sep));
 const result=await probeSuggestionSyncSdk(wasmDirectory,resolve(executable),{ownedHistory:true,sdkDirectory,sdkModule});
 const observer=includeObserver?await probeSuggestionObserverSdk(wasmDirectory,resolve(executable),{sdkDirectory,sdkModule}):undefined;
 const report={...result,format:"breditor/owned-review-installed-probe",consumer,archives:paths,installedProductionModules:installed,publicEntry:fileURLToPath(sdkModule),strictInstalledTypes:true,packagedWasm:true,...(observer?{observer}:{}),scope:result.scope.replace("Actual application Wasm","Clean-installed local package archives, installed editor/collaboration exports and packaged application Wasm").replace("this author-only probe does not exercise the separate observer adapter or suggestion controls.",includeObserver?"The additional observer matrix covers the non-authoring path; suggestion controls remain open.":"This installed author-only matrix does not exercise the separate observer adapter or suggestion controls.")};
 writeFileSync(join(temporary,"result.json"),JSON.stringify(report,null,2));return report;
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3)throw Error("Expected an isolated native suggestion host executable; build candidate packages first");
 console.log(JSON.stringify(await checkOwnedReviewInstalled(process.argv[2]),null,2));
}
