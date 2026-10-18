/** Assemble available upstream notice texts for an opt-in Wasm runtime. Never grants approval. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {existsSync,mkdirSync,readFileSync,realpathSync,writeFileSync} from "node:fs";
import {homedir} from "node:os";
import {dirname,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {candidateDependencyInventory} from "./candidate-dependencies/inventory.mjs";

export const repository=resolve(dirname(fileURLToPath(import.meta.url)),"..");
export const runtimeNoticeFiles=Object.freeze(["breditor_dependency_inventory.json","THIRD_PARTY_NOTICES.txt","RUST_COPYRIGHT-library.html"]);
const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
const rustRelease="1.98.0",rustNoticeSha256="68129500b616d5838629e68f55ff3aed5e096dacf60ce9eb41bbe599a563afa6";
/** Explicit offline target/features follow the runtime builder, never a caller's native defaults. */
export function runtimeNoticePlan(kind,environment=process.env){
 if(!["rich","shared"].includes(kind))throw Error("Choose rich or shared runtime notices");
 const bin=join(homedir(),".cargo/bin"),tool=(name,override)=>override??(existsSync(join(bin,name))?join(bin,name):name),shared=kind==="shared";
 return Object.freeze({kind,cargo:tool("cargo",environment.BREDITOR_CARGO),rustc:tool("rustc",environment.BREDITOR_RUSTC),rootName:shared?"breditor-collaboration":"breditor-wasm",lock:shared?"crates/breditor-collaboration/Cargo.lock":"Cargo.lock",output:resolve(repository,shared?"target/promoted-shared-web":"target/rich-browser-web"),args:Object.freeze(["metadata","--format-version","1","--manifest-path",shared?"crates/breditor-collaboration/Cargo.toml":"Cargo.toml","--filter-platform","wasm32-unknown-unknown","--locked","--offline",...(shared?["--no-default-features"]:["--features","experimental-rich-content"])])});
}
/** Human-readable evidence retains exact original text, including embedded component notices. */
export function renderRuntimeNotices({inventory,noticeTexts}){
 const lines=["Breditor candidate third-party notice inventory","",`Root: ${inventory.root}`,`Inventory SHA-256: ${inventory.sha256}`,"", "Available Cargo source notices and explicitly pinned upstream supplements follow.","This inventory is not publication approval or an exhaustive license-compliance certification.","Registry source verification, source-availability duties and dependency/license review remain release gates.","The separate RUST_COPYRIGHT-library.html retains the pinned toolchain's library notices.",""];
 for(const p of inventory.packages.filter(p=>p.source!=="first-party"))lines.push(`${p.key}: ${p.license} (${p.source})`);
 lines.push("",`Packages without notice text in their Cargo source: ${inventory.gaps.length}`);
 for(const gap of inventory.gaps)lines.push(`${gap.package}: ${gap.reason}`);
 for(const notice of noticeTexts)lines.push("","=".repeat(72),`${notice.package} / ${notice.path}`,`SHA-256: ${notice.sha256}`,...(notice.origin?[`Source: ${notice.origin.url}`]:[]),"",notice.text);
 return lines.join("\n")+"\n";
}
/** No staged output is written until graph, text and pinned standard-library admission finish. */
export function buildRuntimeNotices(kind,environment=process.env){
 const plan=runtimeNoticePlan(kind,environment),run=(command,args)=>execFileSync(command,args,{cwd:repository,env:environment,encoding:"utf8",maxBuffer:16*1024*1024,shell:false});
 const metadata=JSON.parse(run(plan.cargo,plan.args)),firstPartyPaths={"breditor-core":resolve(repository,"crates/breditor-core"),[plan.rootName]:resolve(repository,kind==="shared"?"crates/breditor-collaboration":"crates/breditor-wasm")};
 const upstream=JSON.parse(readFileSync(resolve(repository,"scripts/candidate-dependencies/upstream-notices.json"),"utf8"));assert.equal(upstream.format,"breditor/pinned-upstream-notices");assert.equal(upstream.formatVersion,1);
 const result=candidateDependencyInventory(metadata,plan.rootName,{firstPartyPaths,upstreamNotices:upstream.entries,vendoredPaths:{loro:resolve(repository,"crates/breditor-collaboration/vendor/loro-1.16.2"),"loro-internal":resolve(repository,"crates/breditor-collaboration/vendor/loro-internal-1.16.2")}});
 assert.equal(run(plan.rustc,["--version","--verbose"]).split("\n").find(line=>line.startsWith("release: ")),`release: ${rustRelease}`,"Runtime notices require the pinned Rust toolchain");
 const copyright=readFileSync(join(run(plan.rustc,["--print","sysroot"]).trim(),"share/doc/rust/COPYRIGHT-library.html"));assert.equal(sha256(copyright),rustNoticeSha256,"Standard-library notice differs from the reviewed pinned toolchain");
 const text=renderRuntimeNotices(result),binary=readFileSync(join(plan.output,kind==="shared"?"breditor_shared_bg.wasm":"breditor_wasm_bg.wasm"));
 const manifest={...result.inventory,runtime:plan.kind,runtimeWasmSha256:sha256(binary),noticeBundleSha256:sha256(text),cargoLockSha256:sha256(readFileSync(resolve(repository,plan.lock))),rust:{release:rustRelease,libraryNoticeSha256:rustNoticeSha256}};
 mkdirSync(plan.output,{recursive:true});
 writeFileSync(join(plan.output,runtimeNoticeFiles[0]),JSON.stringify(manifest,null,2)+"\n");writeFileSync(join(plan.output,runtimeNoticeFiles[1]),text);writeFileSync(join(plan.output,runtimeNoticeFiles[2]),copyright);
 return {kind:plan.kind,packages:manifest.packages.length,edges:manifest.edges.length,noticeTexts:result.noticeTexts.length,missingNoticeTexts:manifest.gaps,inventorySha256:manifest.sha256,licenseReview:manifest.licenseReview,publicationApproved:false};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3||!["rich","shared"].includes(process.argv[2])){console.error("Usage: node scripts/build-runtime-notices.mjs rich|shared; stages available notice texts, not release approval.");process.exitCode=2;}
 else console.log(JSON.stringify(buildRuntimeNotices(process.argv[2]),null,2));
}
