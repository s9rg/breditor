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
import {probeSuggestionRevisionsSdk} from "./probe-suggestion-revisions-sdk.mjs";
import {probeReviewAssetsMatrix} from "./probe-review-assets-matrix.mjs";

export async function checkOwnedReviewInstalled(executable,{includeObserver=false,includeControls=false,revisionExecutable,formatRebase=false,assetWorkflow=false}={}){
 if(formatRebase&&(!revisionExecutable||!includeControls))throw Error("Formatting rebase qualification requires the revision fixture and paired controls");
 if(assetWorkflow&&!includeControls)throw Error("The installed asset matrix requires installed vanilla/React controls, not workspace fallbacks");
 if(assetWorkflow&&includeObserver)throw Error("The separate asset-enabled fixture does not replace the observer fixture's argument contract");
 const root=resolve(dirname(fileURLToPath(import.meta.url)),".."),temporary=mkdtempSync(join(tmpdir(),"breditor-owned-review-installed-")),archives=join(temporary,"archives"),consumer=join(temporary,"consumer");
 mkdirSync(archives);mkdirSync(consumer);writeFileSync(join(consumer,"package.json"),JSON.stringify({name:"breditor-owned-review-consumer",private:true,type:"module"}));
 const packages=["@breditor/browser","@breditor/experimental-rich-content","@breditor/collaboration","@breditor/editor"];
 const packed=JSON.parse(execFileSync("npm",["pack","--ignore-scripts","--json","--pack-destination",archives,...packages.flatMap(name=>["--workspace",name])],{cwd:root,encoding:"utf8"}));
 const paths=packed.map(pack=>join(archives,pack.filename));
 execFileSync("npm",["install","--offline","--ignore-scripts","--no-audit","--no-fund","--package-lock=false",...paths,...(includeControls?["react@19.2.8","react-dom@19.2.8","@types/react@19.2.18"]:[])],{cwd:consumer,stdio:["ignore","ignore","pipe"]});
 const specifiers=[...packages,"@breditor/editor/collaboration","@breditor/collaboration/wasm",...(includeControls?["@breditor/editor/collaboration/react","react","react-dom/client"]:[])],resolved=JSON.parse(execFileSync(process.execPath,["--input-type=module","-e",`console.log(JSON.stringify(${JSON.stringify(specifiers)}.map(name=>import.meta.resolve(name))))`],{cwd:consumer,encoding:"utf8"})),installed=resolved.slice(0,packages.length).map(url=>realpathSync(fileURLToPath(url)));
 for(const file of installed)assert.ok(file.startsWith(realpathSync(consumer)+sep),"Production dependencies must resolve in the clean installed consumer");
 cpSync(join(root,"scripts/fixtures/editor-consumer/types-reviewed.ts"),join(consumer,"types-reviewed.ts"));
 if(includeControls)cpSync(join(root,"scripts/fixtures/editor-consumer/types-suggestion-react.ts"),join(consumer,"types-suggestion-react.ts"));
 if(revisionExecutable)cpSync(join(root,"scripts/fixtures/editor-consumer/types-suggestion-revisions.ts"),join(consumer,"types-suggestion-revisions.ts"));
 if(formatRebase)cpSync(join(root,"scripts/fixtures/editor-consumer/types-suggestion-format-rebase.ts"),join(consumer,"types-suggestion-format-rebase.ts"));
 if(assetWorkflow)cpSync(join(root,"scripts/fixtures/editor-consumer/types-review-assets.ts"),join(consumer,"types-review-assets.ts"));
 execFileSync(join(root,"node_modules/.bin/tsc"),["--noEmit","--strict","--target","ES2022","--module","NodeNext","--lib","ES2022,DOM","types-reviewed.ts",...(includeControls?["types-suggestion-react.ts"]:[]),...(revisionExecutable?["types-suggestion-revisions.ts"]:[]),...(formatRebase?["types-suggestion-format-rebase.ts"]:[]),...(assetWorkflow?["types-review-assets.ts"]:[])],{cwd:consumer,stdio:["ignore","ignore","pipe"]});
 const sdkDirectory=pathToFileURL(dirname(installed[2])+sep),sdkModule=pathToFileURL(realpathSync(fileURLToPath(resolved[4]))),wasmDirectory=dirname(realpathSync(fileURLToPath(resolved[5])));
 assert.ok(fileURLToPath(sdkModule).startsWith(realpathSync(consumer)+sep));
 const reactOptions=includeControls?{controls:true,reactModule:resolved[6],reactRuntime:resolved[7],reactDomRuntime:resolved[8]}:{};
 if(includeControls)for(const url of resolved.slice(6))assert.ok(realpathSync(fileURLToPath(url)).startsWith(realpathSync(consumer)+sep),"React and its public wrapper must resolve in the installed consumer");
 const result=assetWorkflow?await probeReviewAssetsMatrix(wasmDirectory,resolve(executable),{sdkDirectory,sdkModule,...reactOptions,editorModule:resolved[3]}):await probeSuggestionSyncSdk(wasmDirectory,resolve(executable),{ownedHistory:true,sdkDirectory,sdkModule,...reactOptions});
 const observer=includeObserver?await probeSuggestionObserverSdk(wasmDirectory,resolve(executable),{sdkDirectory,sdkModule,controls:includeControls}):undefined;
 const revisions=revisionExecutable?await probeSuggestionRevisionsSdk(wasmDirectory,resolve(revisionExecutable),{sdkModule,formatRebase,...reactOptions}):undefined;
 const report={...result,format:"breditor/owned-review-installed-probe",consumer,archives:paths,installedProductionModules:installed,publicEntry:fileURLToPath(sdkModule),strictInstalledTypes:true,packagedWasm:true,...(includeControls?{installedReactModules:resolved.slice(6)}:{}),...(observer?{observer}:{}),...(revisions?{revisions}:{}),scope:result.scope.replace("Actual application Wasm","Clean-installed local package archives, installed editor/collaboration exports and packaged application Wasm")+(observer?" An additional installed permanent-observer matrix covers non-authoring Readers.":"")+(revisions?" A separate installed immutable-revision matrix uses only the opt-in revision host.":"")};
 writeFileSync(join(temporary,"result.json"),JSON.stringify(report,null,2));return report;
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3)throw Error("Expected an isolated native suggestion host executable; build candidate packages first");
 console.log(JSON.stringify(await checkOwnedReviewInstalled(process.argv[2]),null,2));
}
