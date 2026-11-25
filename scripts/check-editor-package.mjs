/** Production bundles and Node consumers use only installed candidate archives, never workspace links. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {cpSync,mkdirSync,mkdtempSync,readFileSync} from "node:fs";
import {resolve,dirname,join} from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";
import {saveEvidence} from "./candidate-release/evidence.mjs";
import {checkInstalledStaticBundle} from "./check-installed-static-bundle.mjs";
import {installedArchiveDigests} from "./installed-archive-digests.mjs";
const root=resolve(dirname(fileURLToPath(import.meta.url)),".."),temporary=mkdtempSync(join(tmpdir(),"breditor-editor-consumer-")),archives=resolve(temporary,"archives"),minimal=resolve(temporary,"minimal"),sharedOnly=resolve(temporary,"shared-only"),consumer=resolve(temporary,"consumer");
const run=(cmd,args,cwd=root)=>execFileSync(cmd,args,{cwd,stdio:"inherit"});
run(process.execPath,["scripts/build-rich-runtime.mjs"]);run(process.execPath,["scripts/build-collaboration-runtime.mjs"]);
// Run in a child process so clock injection cannot affect packing/builds or other consumers.
run(process.execPath,["scripts/probe-shared-history-clock.mjs","--require-stable","packages/breditor-collaboration/dist/runtime"]);
run(resolve(root,"node_modules/.bin/tsc"),["-p","packages/breditor-experimental-rich-content/tsconfig.json"]);run(resolve(root,"node_modules/.bin/tsc"),["-p","packages/breditor-collaboration/tsconfig.json"]);run(resolve(root,"node_modules/.bin/tsc"),["-p","packages/breditor-editor/tsconfig.json"]);
const licenses=["LICENSE-MIT","LICENSE-APACHE"];
for(const directory of ["breditor-editor","breditor-collaboration"])for(const name of licenses)cpSync(resolve(root,name),resolve(root,"packages",directory,name));
mkdirSync(archives);for(const directory of [minimal,sharedOnly,consumer]){cpSync(resolve(root,"scripts/fixtures/editor-consumer"),directory,{recursive:true});cpSync(resolve(root,"crates/breditor-core/tests/fixtures/rich-local-root.json"),resolve(directory,"root.json"));cpSync(resolve(root,"crates/breditor-core/tests/fixtures/rich-code-exit-root.json"),resolve(directory,"code-exit-root.json"));}
const names=["@breditor/browser","@breditor/experimental-rich-content","@breditor/collaboration","@breditor/editor"],packs=JSON.parse(execFileSync("npm",["pack","--ignore-scripts","--json","--pack-destination",archives,...names.flatMap(name=>["--workspace",name])],{cwd:root,encoding:"utf8"}));
const archiveEvidence=installedArchiveDigests(archives,packs,names);
const paths=archiveEvidence.map(archive=>resolve(archives,archive.filename));
const install=["install","--offline","--ignore-scripts","--no-audit","--no-fund","--package-lock=false"];
run("npm",[...install,...paths.filter((_p,i)=>i!==2)],minimal);run(process.execPath,["minimal.mjs"],minimal);
const staticBundle=await checkInstalledStaticBundle(minimal);
console.log(`Verified the installed static publishing bundle with ${staticBundle.modules} modules and no Wasm assets`);
const types=["--noEmit","--strict","--target","ES2022","--module","NodeNext","--lib","ES2022,DOM"];
run(resolve(root,"node_modules/.bin/tsc"),[...types,"types.ts"],minimal);
run("npm",[...install,...paths],sharedOnly);run(process.execPath,["shared-only.mjs"],sharedOnly);
run(resolve(root,"node_modules/.bin/tsc"),[...types,"types-shared.ts"],sharedOnly);
run("npm",[...install,...paths,"react@19.2.8","react-dom@19.2.8","@types/react@19.2.18"],consumer);
const licenseExpression=JSON.parse(readFileSync(resolve(root,"package.json"),"utf8")).license;
const canonicalLicenses=licenses.map(filename=>[filename,readFileSync(resolve(root,filename))]);
for(const name of names){
 const installed=resolve(consumer,"node_modules",name);
 const manifest=JSON.parse(readFileSync(resolve(installed,"package.json"),"utf8"));
 assert.equal(manifest.license,licenseExpression,`${name} installed license expression differs from the workspace`);
 for(const [filename,canonical] of canonicalLicenses){
  assert.ok(canonical.equals(readFileSync(resolve(installed,filename))),`${name} installed ${filename} differs from the canonical license`);
 }
}
console.log(`Verified dual-license files in ${names.length} installed SDK packages`);
const sourceBoundary=JSON.parse(execFileSync(process.execPath,["source-boundary.mjs",resolve(root,"node_modules/typescript/bin/tsc")],{cwd:consumer,encoding:"utf8"}));
run(resolve(root,"node_modules/.bin/tsc"),[...types,"types.ts","types-full.ts","types-selection.ts","types-layout.ts","types-document.ts","types-search.ts"],consumer);run(process.execPath,["full-runtime.mjs"],consumer);
run(process.execPath,["layout-runtime.mjs"],consumer);
run(resolve(root,"node_modules/.bin/tsc"),[...types,"--lib","ES2022,DOM,ESNext.Disposable","types-wasm.ts"],consumer);
run(resolve(root,"node_modules/.bin/vite"),["build","--config","vite.config.mjs"],consumer);
assert.deepEqual(installedArchiveDigests(archives,packs,names),archiveEvidence,"Installed archives changed during qualification");
saveEvidence(resolve(root,"target/editor-installed-consumer.json"),{consumer,minimal,sharedOnly,archives:paths,archiveEvidence,staticBundle,sourceBoundary});
console.log(`Retained installed SDK proof: ${temporary}`);
