/** Production bundles and Node consumers use only installed candidate archives, never workspace links. */
import {execFileSync} from "node:child_process";
import {cpSync,mkdirSync,mkdtempSync,writeFileSync} from "node:fs";
import {resolve,dirname,join} from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),".."),temporary=mkdtempSync(join(tmpdir(),"breditor-editor-consumer-")),archives=resolve(temporary,"archives"),minimal=resolve(temporary,"minimal"),sharedOnly=resolve(temporary,"shared-only"),consumer=resolve(temporary,"consumer");
const run=(cmd,args,cwd=root)=>execFileSync(cmd,args,{cwd,stdio:"inherit"});
run(process.execPath,["scripts/build-rich-runtime.mjs"]);run(process.execPath,["scripts/build-collaboration-runtime.mjs"]);
run(resolve(root,"node_modules/.bin/tsc"),["-p","packages/breditor-experimental-rich-content/tsconfig.json"]);run(resolve(root,"node_modules/.bin/tsc"),["-p","packages/breditor-collaboration/tsconfig.json"]);run(resolve(root,"node_modules/.bin/tsc"),["-p","packages/breditor-editor/tsconfig.json"]);
for(const directory of ["breditor-editor","breditor-collaboration"])for(const name of ["LICENSE-MIT","LICENSE-APACHE"])cpSync(resolve(root,name),resolve(root,"packages",directory,name));
mkdirSync(archives);for(const directory of [minimal,sharedOnly,consumer]){cpSync(resolve(root,"scripts/fixtures/editor-consumer"),directory,{recursive:true});cpSync(resolve(root,"crates/breditor-core/tests/fixtures/rich-local-root.json"),resolve(directory,"root.json"));}
const names=["@breditor/browser","@breditor/experimental-rich-content","@breditor/collaboration","@breditor/editor"],packs=JSON.parse(execFileSync("npm",["pack","--ignore-scripts","--json","--pack-destination",archives,...names.flatMap(name=>["--workspace",name])],{cwd:root,encoding:"utf8"})),paths=packs.map(p=>resolve(archives,p.filename));
const install=["install","--offline","--ignore-scripts","--no-audit","--no-fund","--package-lock=false"];
run("npm",[...install,...paths.filter((_p,i)=>i!==2)],minimal);run(process.execPath,["minimal.mjs"],minimal);
const types=["--noEmit","--strict","--target","ES2022","--module","NodeNext","--lib","ES2022,DOM"];
run(resolve(root,"node_modules/.bin/tsc"),[...types,"types.ts"],minimal);
run("npm",[...install,...paths],sharedOnly);run(process.execPath,["shared-only.mjs"],sharedOnly);
run(resolve(root,"node_modules/.bin/tsc"),[...types,"types-shared.ts"],sharedOnly);
run("npm",[...install,...paths,"react@19.2.8","react-dom@19.2.8","@types/react@19.2.18"],consumer);
run(resolve(root,"node_modules/.bin/tsc"),[...types,"types.ts","types-full.ts"],consumer);run(process.execPath,["full-runtime.mjs"],consumer);
run(resolve(root,"node_modules/.bin/tsc"),[...types,"--lib","ES2022,DOM,ESNext.Disposable","types-wasm.ts"],consumer);
run(resolve(root,"node_modules/.bin/vite"),["build","--config","vite.config.mjs"],consumer);
writeFileSync(resolve(root,"target/editor-installed-consumer.json"),JSON.stringify({consumer,minimal,sharedOnly,archives:paths}));console.log(`Retained installed SDK proof: ${temporary}`);
