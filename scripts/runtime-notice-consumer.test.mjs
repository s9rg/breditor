import assert from "node:assert/strict";
import test from "node:test";
import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {createHash} from "node:crypto";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {assertRuntimeNotices} from "./fixtures/editor-consumer/runtime-notices.mjs";
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
function fixture(){
 const root=mkdtempSync(join(tmpdir(),"breditor-notice-consumer-")),binary=join(root,"runtime.wasm"),bytes="fixture binary",copyright="fixture toolchain notices";
 const body={format:"breditor/candidate-dependency-inventory",formatVersion:1,root:"fixture@1",packages:Array.from({length:22},(_,i)=>({key:`fixture-${i}@1`,source:i?"first-party":"crates.io",notices:i?[]:[{path:"LICENSE",sha256:hash("license")}]})),edges:[],gaps:[{package:"missing@1",reason:"no-notice-text-in-cargo-source"}],crateSourceVerification:"not-performed",licenseReview:"not-approved",publicationApproved:false},sha256=hash(JSON.stringify(body)),text=`Inventory SHA-256: ${sha256}\nlicense\n`;
 const record={...body,sha256,runtime:"shared",runtimeWasmSha256:hash(bytes),noticeBundleSha256:hash(text),cargoLockSha256:"1".repeat(64),rust:{release:"1.98.0",libraryNoticeSha256:hash(copyright)}};
 const save=()=>writeFileSync(join(root,"breditor_dependency_inventory.json"),JSON.stringify(record));save();writeFileSync(binary,bytes);writeFileSync(join(root,"THIRD_PARTY_NOTICES.txt"),text);writeFileSync(join(root,"RUST_COPYRIGHT-library.html"),copyright);return {root,binary,record,save};
}
test("independent consumer validates binary, graph, text and toolchain notice hashes",()=>{const f=fixture();try{assert.deepEqual(assertRuntimeNotices(f.binary,"shared"),{runtime:"shared",packages:22,openNoticeGaps:1});}finally{rmSync(f.root,{recursive:true,force:true});}});
for(const filename of ["runtime.wasm","THIRD_PARTY_NOTICES.txt","RUST_COPYRIGHT-library.html"])test(`installed ${filename} tampering is rejected`,()=>{const f=fixture();try{writeFileSync(join(f.root,filename),"tampered");assert.throws(()=>assertRuntimeNotices(f.binary,"shared"));}finally{rmSync(f.root,{recursive:true,force:true});}});
test("missing files, changed inventories and substituted runtime kinds reject",()=>{
 for(const mutate of [f=>rmSync(join(f.root,"THIRD_PARTY_NOTICES.txt")),f=>{f.record.packages.pop();f.save();},f=>{f.record.runtime="rich";f.save();},f=>{f.record.licenseReview="approved";f.save();}]){const f=fixture();try{mutate(f);assert.throws(()=>assertRuntimeNotices(f.binary,"shared"));}finally{rmSync(f.root,{recursive:true,force:true});}}
});
test("a self-consistent notice manifest cannot hide build-home paths in the installed binary",()=>{
 const f=fixture();try{const binary="fixture /Users/person/build/crate.rs";writeFileSync(f.binary,binary);f.record.runtimeWasmSha256=hash(binary);f.save();assert.throws(()=>assertRuntimeNotices(f.binary,"shared"),/build-home paths/);}finally{rmSync(f.root,{recursive:true,force:true});}
});
