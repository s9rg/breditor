import assert from "node:assert/strict";
import test from "node:test";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,symlinkSync} from "node:fs";
import {createHash} from "node:crypto";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {selectedCargoGraph,packageNotices,candidateDependencyInventory,registryReleaseSource} from "./candidate-dependencies/inventory.mjs";
const registry="registry+https://github.com/rust-lang/crates.io-index";
function fixture(){
 const root=mkdtempSync(join(tmpdir(),"breditor-notice-graph-"));
 const p=(name,source)=>{const d=join(root,name);mkdirSync(d);writeFileSync(join(d,"Cargo.toml"),"fixture");writeFileSync(join(d,".cargo-checksum.json"),JSON.stringify({package:"1".repeat(64)}));return {id:name,name,version:"1.0.0",source,manifest_path:join(d,"Cargo.toml"),license:"MIT"};};
 const packages=[p("app",null),p("vendor",null),p("dep",registry),p("build",registry),p("dev",registry)];
 const dependency=(pkg,kind=null,target=null)=>({pkg,dep_kinds:[{kind,target}]});
 const nodes=[{id:"app",deps:[dependency("vendor"),dependency("dep"),dependency("dev","dev")]},{id:"vendor",deps:[dependency("dep"),dependency("build","build","cfg(test)")]},{id:"dep",deps:[dependency("vendor")]},{id:"build",deps:[]},{id:"dev",deps:[]}];
 return {root,metadata:{packages,resolve:{nodes}},options:{firstPartyPaths:{app:join(root,"app")},vendoredPaths:{vendor:join(root,"vendor")}}};
}
test("selected closure retains target/build edges, handles cycles and excludes dev-only nodes",()=>{
 const f=fixture();try{const graph=selectedCargoGraph(f.metadata,"app",f.options);assert.equal(graph.root,"app@1.0.0");assert.equal(graph.packages.length,4);assert.equal(graph.edges.length,5);assert.equal(graph.packages.find(p=>p.name==="vendor").source,"vendored");assert.deepEqual(graph.edges.find(e=>e.kind==="build"),{from:"vendor@1.0.0",to:"build@1.0.0",kind:"build",target:"cfg(test)"});assert.ok(!graph.packages.some(p=>p.name==="dev"));}finally{rmSync(f.root,{recursive:true,force:true});}
});
test("unknown sources, local escape, duplicate or missing graph entries fail closed",()=>{
 for(const mutate of [f=>f.metadata.packages.push(f.metadata.packages[0]),f=>f.metadata.resolve.nodes.splice(3,1),f=>f.metadata.packages[2].source="git+https://example.invalid/repo",f=>f.options.vendoredPaths.vendor=join(f.root,"dep"),f=>f.metadata.resolve.nodes[0].deps[0].dep_kinds[0].kind="future",f=>f.metadata.packages[2].license=null]){
  const f=fixture();try{mutate(f);assert.throws(()=>selectedCargoGraph(f.metadata,"app",f.options));}finally{rmSync(f.root,{recursive:true,force:true});}
 }
});
test("notice scanning includes embedded licenses and exact bytes, never source symlinks",()=>{
 const f=fixture();try{const root=join(f.root,"vendor");mkdirSync(join(root,"src"));writeFileSync(join(root,"LICENSE"),"Exact MIT text\n");writeFileSync(join(root,"src/NOTICE.txt"),"Embedded copyright\n");writeFileSync(join(root,"src/not-a-notice.rs"),"source");const n=packageNotices(root);assert.deepEqual(n.map(p=>p.path),["LICENSE","src/NOTICE.txt"]);assert.equal(n[0].text,"Exact MIT text\n");symlinkSync(join(f.root,"dep"),join(root,"outside"));assert.throws(()=>packageNotices(root),/symlink/);}finally{rmSync(f.root,{recursive:true,force:true});}
});
test("notice decoding and traversal are bounded",()=>{
 for(const kind of ["binary","oversize","many"]){const f=fixture();try{const root=join(f.root,"dep");writeFileSync(join(root,"LICENSE"),kind==="binary"?Buffer.from([255]):"text");assert.throws(()=>packageNotices(root,kind==="oversize"?{maxNoticeBytes:1}:kind==="many"?{maxFiles:1}:{}));}finally{rmSync(f.root,{recursive:true,force:true});}}
});
test("reproducible inventory reports missing notice text and never grants approval",()=>{
 const f=fixture();try{
  writeFileSync(join(f.root,"dep/LICENSE-MIT"),"Dependency copyright\n");const a=candidateDependencyInventory(f.metadata,"app",f.options),b=candidateDependencyInventory(f.metadata,"app",f.options);
  assert.deepEqual(a,b);assert.equal(a.inventory.packages.length,4);assert.equal(a.inventory.licenseReview,"not-approved");assert.equal(a.inventory.publicationApproved,false);assert.equal(a.inventory.gaps.length,2);assert.equal(a.noticeTexts.length,1);assert.ok(!JSON.stringify(a.inventory).includes(f.root));assert.match(a.inventory.sha256,/^[a-f0-9]{64}$/);
  writeFileSync(join(f.root,"dep/LICENSE-MIT"),"Changed copyright\n");assert.notEqual(candidateDependencyInventory(f.metadata,"app",f.options).inventory.sha256,a.inventory.sha256);
 }finally{rmSync(f.root,{recursive:true,force:true});}
});
test("MPL source archives identify only the locked registry version reached by the selected graph",()=>{
 const f=fixture();
 try{
  f.metadata.packages.find(p=>p.name==="dep").license="(MPL-2.0+ OR MIT)";
  f.metadata.packages.find(p=>p.name==="dev").license="MPL-2.0";
  const checksum="2".repeat(64);
  const entry=`[[package]]\nname = "dep"\nversion = "1.0.0"\nsource = "${registry}"\nchecksum = "${checksum}"\n`;
  const inventory=cargoLock=>candidateDependencyInventory(f.metadata,"app",{...f.options,cargoLock}).inventory;
  assert.deepEqual(inventory(entry+entry.replace("1.0.0","2.0.0")).mplSourceArchives,[{
   package:"dep@1.0.0",url:"https://static.crates.io/crates/dep/dep-1.0.0.crate",sha256:checksum,
  }]);
  assert.notEqual(inventory(entry).sha256,inventory(entry.replace(checksum,"3".repeat(64))).sha256);
  assert.throws(()=>inventory(undefined),/requires the selected Cargo.lock/);
  assert.throws(()=>inventory(entry+entry),/ambiguous locked MPL source archive/);
  assert.throws(()=>inventory(entry.replace(checksum,"abc")),/Missing locked MPL source checksum/);
 }finally{rmSync(f.root,{recursive:true,force:true});}
});
function supplement(f){
 const revision="a".repeat(40),text="Exact upstream MIT copyright\r\nPermission text.\r\n",entry={key:"dep@1.0.0",license:"MIT",revision,pathInVcs:"component",url:`https://raw.githubusercontent.com/example/upstream/${revision}/LICENSE`,text,sha256:createHash("sha256").update(text).digest("hex")};
 writeFileSync(join(f.root,"dep/.cargo_vcs_info.json"),JSON.stringify({git:{sha1:revision},path_in_vcs:"component"}));f.options.upstreamNotices=[entry];return entry;
}
test("upstream supplements retain exact text and package revision provenance",()=>{
 const f=fixture();try{const e=supplement(f),r=candidateDependencyInventory(f.metadata,"app",f.options),p=r.inventory.packages.find(p=>p.name==="dep");assert.equal(p.notices.length,1);assert.equal(p.notices[0].origin.url,e.url);assert.equal(p.notices[0].sha256,e.sha256);assert.equal(r.noticeTexts[0].text,e.text);assert.ok(!r.inventory.gaps.some(g=>g.package===e.key));assert.equal(r.inventory.licenseReview,"not-approved");}finally{rmSync(f.root,{recursive:true,force:true});}
});
test("upstream text, license, owner and revision drift cannot silently fill a notice gap",()=>{
 for(const mutate of [(f,e)=>e.text+="changed",(f,e)=>e.license="BSD-3-Clause",(f,e)=>e.url=e.url.replace(e.revision,"main"),(f,e)=>e.pathInVcs="another",(f,e)=>f.options.upstreamNotices.push(e),(f,e)=>writeFileSync(join(f.root,"dep/.cargo_vcs_info.json"),JSON.stringify({git:{sha1:e.revision,dirty:true},path_in_vcs:e.pathInVcs})),f=>writeFileSync(join(f.root,"dep/LICENSE"),"unexpected published notice")]){
  const f=fixture();try{const e=supplement(f);mutate(f,e);assert.throws(()=>candidateDependencyInventory(f.metadata,"app",f.options));}finally{rmSync(f.root,{recursive:true,force:true});}
 }
});
test("a tagged release supplement requires every packaged source byte to match the reviewed release",()=>{
 const f=fixture();
 try{
  const entry=supplement(f),directory=join(f.root,"dep");
  writeFileSync(join(directory,"Cargo.toml.orig"),"[package]\nname = 'dep'\n");
  writeFileSync(join(directory,"source.rs"),"fn source() {}\n");
  const source=registryReleaseSource(directory),revision="d".repeat(40);
  entry.release={tag:"v1.0.0",revision,sourceFiles:source.files,sourceSha256:source.sha256};
  entry.url=`https://raw.githubusercontent.com/example/upstream/${revision}/LICENSE`;
  const {inventory}=candidateDependencyInventory(f.metadata,"app",f.options);
  const origin=inventory.packages.find(p=>p.name==="dep").notices[0].origin;
  assert.equal(origin.revision,revision);
  assert.equal(origin.packageRevision,entry.revision);
  writeFileSync(join(directory,"source.rs"),"fn changed() {}\n");
  assert.throws(()=>candidateDependencyInventory(f.metadata,"app",f.options),/differs from packaged source bytes/);
 }finally{rmSync(f.root,{recursive:true,force:true});}
});
test("checked-in upstream supplements lock their original bytes and immutable source URLs",()=>{
 const record=JSON.parse(readFileSync(new URL("./candidate-dependencies/upstream-notices.json",import.meta.url),"utf8"));assert.equal(record.format,"breditor/pinned-upstream-notices");assert.equal(record.formatVersion,1);assert.deepEqual(record.entries.map(e=>e.key),["append-only-bytes@0.1.12","arref@0.1.0","generic-btree@0.10.7","serde_columnar@0.3.14","serde_columnar_derive@0.3.7"]);
 for(const e of record.entries){assert.equal(createHash("sha256").update(e.text).digest("hex"),e.sha256);assert.match(e.revision,/^[a-f0-9]{40}$/);assert.ok(e.url.includes(`/${e.release?.revision??e.revision}/LICENSE`));assert.match(e.text,/Copyright /);}
 assert.ok(record.entries.find(e=>e.key.startsWith("serde_columnar@")).text.includes("\r\n"),"Original upstream line endings are data, not editor formatting");
});
