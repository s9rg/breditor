// Local archives only. No publication or registry access, and no workspace resolution in the consumer.
import {execFileSync} from "node:child_process";
import {cpSync,mkdirSync,mkdtempSync} from "node:fs";
import {resolve,dirname,join} from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),".."),temporary=mkdtempSync(join(tmpdir(),"breditor-shared-consumer-")),archives=resolve(temporary,"archives"),consumer=resolve(temporary,"consumer");
mkdirSync(archives);cpSync(resolve(root,"scripts/fixtures/shared-consumer"),consumer,{recursive:true});
const packs=JSON.parse(execFileSync("npm",["pack","--ignore-scripts","--json","--pack-destination",archives,"--workspace","@breditor/experimental-rich-content","--workspace","@breditor/experimental-collaboration"],{cwd:root,encoding:"utf8"}));
execFileSync("npm",["install","--offline","--ignore-scripts","--no-audit","--no-fund","--package-lock=false",...packs.map(pack=>resolve(archives,pack.filename))],{cwd:consumer,stdio:"inherit"});
execFileSync(resolve(root,"node_modules/.bin/tsc"),["--noEmit","--strict","--target","ES2022","--module","NodeNext","--lib","ES2022,DOM,ESNext.Disposable","types.ts"],{cwd:consumer,stdio:"inherit"});
const artifacts=resolve(root,"target/collaboration-feasibility-web");
execFileSync(process.execPath,["runtime.mjs"],{cwd:consumer,stdio:"inherit",env:{...process.env,BREDITOR_PROBE_MODULE:resolve(artifacts,"breditor_collab_feasibility.js"),BREDITOR_PROBE_BINARY:resolve(artifacts,"breditor_collab_feasibility_bg.wasm"),BREDITOR_PROBE_VECTOR:resolve(artifacts,"native-vector.json")}});
console.log(`Retained local package proof: ${temporary}`);
