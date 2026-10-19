import assert from "node:assert/strict";
import test from "node:test";
import {execFileSync,spawnSync} from "node:child_process";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync,symlinkSync,utimesSync,statSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {candidateReleasePlan,repository} from "./candidate-release/plan.mjs";
import {fileEvidence,sourceEvidence,saveEvidence} from "./candidate-release/evidence.mjs";
import {executeCandidateStage} from "./candidate-release/process.mjs";
import {runCandidateChecks} from "./verify-candidate.mjs";
const temporary=()=>mkdtempSync(join(tmpdir(),"breditor-candidate-contract-"));
const fixtureCheck=(id="fixture",script="console.log('fixture proof')")=>({id,command:process.execPath,args:["-e",script],env:{},artifacts:[],timeoutMs:4000});
const plan=checks=>({profile:"functional",deferred:["not-a-v1-certification"],checks});
const stable=()=>({commit:"1".repeat(40),dirty:true,sha256:"2".repeat(64),files:1,bytes:1});
function quiet(options={}){return {snapshot:stable,report:()=>{},...options};}

test("functional and full plans cover current candidate work without weakening the default release",()=>{
 const functional=candidateReleasePlan({profile:"functional"}),full=candidateReleasePlan();
 assert.equal(functional.v1Ready,false);assert.equal(full.v1Ready,false);
 assert.ok(Object.isFrozen(full)&&Object.isFrozen(full.checks));
 assert.deepEqual(full.checks.slice(0,functional.checks.length),functional.checks);
 const ids=full.checks.map(check=>check.id);assert.equal(new Set(ids).size,ids.length);
 for(const id of ["workspace-lint","shared-lint","relay-lint","workspace-native","shared-native","relay-native","independent-native-consumer","paired-local-runtime","paired-shared-runtime","editor-sdk-tests","installed-rich-interchange","installed-everyday-mixed-workflows","installed-text-review-and-readers","installed-formatting-review-and-readers","installed-assets-comments-versions","default-package-release-matrix","installed-editor-browser-matrix","reviewed-v1-readiness"])assert.ok(ids.includes(id),id);
 assert.equal(full.checks.at(-1).args.at(-1),"--require-ready");
 assert.ok(!functional.checks.some(check=>check.id==="reviewed-v1-readiness"));
 assert.ok(functional.deferred.includes("native-clipboard-ime-screen-reader-mobile"));
 for(const id of ["search-programmatic-sdk","search-persistent-sessions","search-borrowed-controls","search-managed-startup","installed-search-workflows"])assert.ok(functional.checks.some(check=>check.id===id),id);
 const search=functional.checks.find(check=>check.id==="installed-search-workflows");assert.deepEqual(search.args,["scripts/check-search-installed.mjs"]);assert.deepEqual(search.artifacts,[{path:"target/search-installed-consumer.json",fresh:true}]);
 assert.ok(!functional.checks.some(check=>check.id==="installed-search-browser"));const searchBrowser=full.checks.find(check=>check.id==="installed-search-browser");assert.deepEqual(searchBrowser.args,["scripts/check-search-browser.mjs"]);assert.deepEqual(searchBrowser.artifacts,[{path:"target/search-installed-browser.json",fresh:true}]);
 assert.throws(()=>candidateReleasePlan({profile:"skip-hard-parts"}));
 for(const check of full.checks){assert.ok(Object.isFrozen(check)&&Object.isFrozen(check.args)&&Object.isFrozen(check.artifacts));assert.ok(!check.args.some(arg=>/^(publish|push|tag|--skip-tests|--retries)$/.test(arg)));}
});
test("manifest flags precede formatter/linter separators and overrides stay one argv item",()=>{
 const p=candidateReleasePlan({profile:"functional",environment:{BREDITOR_CARGO:"/tool path/cargo",BREDITOR_NPM:"/tool path/npm"}});
 for(const id of ["shared-format","relay-format","shared-lint","relay-lint"]){const c=p.checks.find(c=>c.id===id);assert.equal(c.command,"/tool path/cargo");assert.ok(c.args.indexOf("--manifest-path")<c.args.indexOf("--"));}
 for(const id of ["workspace-lint","shared-lint","relay-lint"]){const c=p.checks.find(c=>c.id===id);for(const arg of ["--all-targets","--locked","--offline"])assert.ok(c.args.includes(arg));assert.deepEqual(c.args.slice(-3),["--","-D","warnings"]);}
 assert.equal(p.checks.find(c=>c.id==="editor-sdk-tests").command,"/tool path/npm");
 assert.equal(p.checks.find(c=>c.id==="functional-native-fixtures").artifacts.length,4);
 const wasm=p.checks.find(c=>c.id==="shared-wasm-lint");assert.ok(wasm.env.CARGO_ENCODED_RUSTFLAGS.includes(`--remap-path-prefix=${repository}=breditor`),"Actual-target lint must use the same canonical Rust flags as the shipped candidate");
});
test("both profiles compile shared public documentation with warnings denied",()=>{
 for(const profile of ["functional","full"]){const plan=candidateReleasePlan({profile,environment:{BREDITOR_CARGO:"/tool path/cargo"}}),docs=plan.checks.find(c=>c.id==="shared-docs"),native=plan.checks.find(c=>c.id==="shared-native");assert.ok(docs);assert.equal(docs.command,"/tool path/cargo");assert.deepEqual(docs.args,["doc","--manifest-path","crates/breditor-collaboration/Cargo.toml","--no-deps","--locked","--offline","--release"]);assert.equal(docs.env.RUSTDOCFLAGS,"-D warnings");assert.equal(docs.env.CARGO_TARGET_DIR,native.env.CARGO_TARGET_DIR);assert.ok(plan.checks.indexOf(docs)>plan.checks.indexOf(native));}
});
test("both profiles exercise public server and offline host recovery plus strict native documentation",()=>{
 for(const profile of ["functional","full"]){const plan=candidateReleasePlan({profile,environment:{BREDITOR_CARGO:"/tool path/cargo"}}),check=plan.checks.find(row=>row.id==="relay-room-backups"),offline=plan.checks.find(row=>row.id==="relay-backups-no-server"),docs=plan.checks.find(row=>row.id==="relay-docs");assert.equal(check.command,"/tool path/cargo");assert.deepEqual(check.args,["test","--manifest-path","experiments/relay/Cargo.toml","--features","server","--locked","--offline","--release","--test","room_backups"]);assert.equal(check.env.CARGO_TARGET_DIR,plan.checks.find(row=>row.id==="relay-native").env.CARGO_TARGET_DIR);assert.deepEqual(offline.args,["test","--manifest-path","experiments/relay/Cargo.toml","--locked","--offline","--release","--lib","--test","room_backups"]);assert.equal(offline.env.CARGO_TARGET_DIR,check.env.CARGO_TARGET_DIR);assert.equal(docs.env.RUSTDOCFLAGS,"-D warnings");assert.deepEqual(docs.args,["doc","--manifest-path","experiments/relay/Cargo.toml","--features","server","--no-deps","--locked","--offline","--release"]);}
});
test("both profiles require actual paired native retained-image reads without a historical cache dependency",()=>{
 for(const profile of ["functional","full"]){const plan=candidateReleasePlan({profile}),check=plan.checks.find(c=>c.id==="retained-image-references");assert.ok(check);assert.deepEqual(check.args,["scripts/probe-retained-asset-references.mjs","target/rich-browser-web","target/promoted-shared-web"]);assert.ok(plan.checks.indexOf(check)>plan.checks.findIndex(c=>c.id==="paired-shared-runtime"));}
});
test("both profiles retain server asset recovery, exact owner-path regressions and network-disabled host APIs",()=>{
 for(const profile of ["functional","full"]){const plan=candidateReleasePlan({profile,environment:{BREDITOR_CARGO:"/tool path/cargo"}}),native=plan.checks.find(row=>row.id==="relay-native");for(const [id,tail]of [["relay-asset-backups",["--features","server","--locked","--offline","--release","--test","asset_backups"]],["relay-asset-owner-paths",["--features","server","--locked","--offline","--release","--test","asset_store_paths"]],["relay-assets-no-server",["--locked","--offline","--release","--lib","--test","asset_backups","--test","asset_store_paths"]]]){const check=plan.checks.find(row=>row.id===id);assert.ok(check,id);assert.equal(check.command,"/tool path/cargo");assert.deepEqual(check.args,["test","--manifest-path","experiments/relay/Cargo.toml",...tail]);assert.equal(check.env.CARGO_TARGET_DIR,native.env.CARGO_TARGET_DIR);assert.ok(plan.checks.indexOf(check)>plan.checks.indexOf(native));}}
});
test("both profiles require current packet/source capture and version ownership checks without historical caches",()=>{
 for(const profile of ["functional","full"]){const plan=candidateReleasePlan({profile});for(const [id,file]of [["packet-asset-references","probe-packet-asset-references.mjs"],["version-source-ownership","probe-version-source-ownership.mjs"]]){const check=plan.checks.find(c=>c.id===id);assert.ok(check);assert.deepEqual(check.args,[`scripts/${file}`,"target/promoted-shared-web"]);assert.ok(plan.checks.indexOf(check)>plan.checks.findIndex(c=>c.id==="collaboration-build"));}}
});
test("both profiles require atomic source-upload cuts, the exact cancellation regression and participant native restores",()=>{
 for(const profile of ["functional","full"]){const plan=candidateReleasePlan({profile}),find=id=>{const row=plan.checks.find(s=>s.id===id);assert.ok(row,id);return row;};assert.deepEqual(find("asset-source-snapshot-contracts").args,["--test","scripts/asset-source-backups.test.mjs"]);assert.deepEqual(find("asset-source-cancellation-regression").args,["--test","--test-name-pattern=cancellation before or within","scripts/asset-source-backups.test.mjs"]);assert.deepEqual(find("participant-backups").args,["scripts/probe-participant-backups.mjs","target/promoted-shared-web"]);assert.ok(plan.checks.indexOf(find("participant-backups"))>plan.checks.indexOf(find("collaboration-build")));assert.deepEqual(find("installed-session-backups").args,["scripts/check-session-backups-installed.mjs"]);}
});
test("both profiles require joined server recovery, real host capture and the non-networked host APIs",()=>{
 for(const profile of ["functional","full"]){const plan=candidateReleasePlan({profile,environment:{BREDITOR_CARGO:"/tool path/cargo"}}),native=plan.checks.find(row=>row.id==="relay-native");for(const [id,flags]of [["relay-server-room-backups",["--features","server"]],["relay-server-backups-no-server",[]]]){const check=plan.checks.find(row=>row.id===id);assert.ok(check,id);assert.equal(check.command,"/tool path/cargo");assert.deepEqual(check.args,["test","--manifest-path","experiments/relay/Cargo.toml",...flags,"--locked","--offline","--release",...(flags.length?[]:["--lib"]),"--test","server_room_backups"]);assert.equal(check.env.CARGO_TARGET_DIR,native.env.CARGO_TARGET_DIR);assert.ok(plan.checks.indexOf(check)>plan.checks.indexOf(native));}}
});
test("both profiles require owner-authenticated participant inventory and the non-networked native API",()=>{
 for(const profile of ["functional","full"]){
  const plan=candidateReleasePlan({profile,environment:{BREDITOR_CARGO:"/tool path/cargo"}}),native=plan.checks.find(row=>row.id==="relay-native");
  for(const [id,flags]of [["relay-participant-inventory",["--features","server"]],["relay-inventory-no-server",[]]]){
   const check=plan.checks.find(row=>row.id===id);assert.ok(check,id);assert.equal(check.command,"/tool path/cargo");
   assert.deepEqual(check.args,["test","--manifest-path","experiments/relay/Cargo.toml",...flags,"--locked","--offline","--release",...(flags.length?[]:["--lib"]),"--test","participant_inventory"]);
   assert.equal(check.env.CARGO_TARGET_DIR,native.env.CARGO_TARGET_DIR);assert.ok(plan.checks.indexOf(check)>plan.checks.indexOf(native));
  }
 }
});
test("both profiles require retained-store recovery and fresh installed backup acceptance without reuse",()=>{
 for(const profile of ["functional","full"]){const p=candidateReleasePlan({profile}),check=p.checks.find(c=>c.id==="retained-store-backups"),installed=p.checks.find(c=>c.id==="installed-session-backups");assert.deepEqual(check.args,["scripts/probe-retained-store-backups.mjs","target/promoted-shared-web"]);assert.deepEqual(installed.args,["scripts/check-session-backups-installed.mjs"]);assert.ok(p.checks.indexOf(check)>p.checks.findIndex(c=>c.id==="collaboration-build"));}
});
test("both profiles require complete selected asset bytes through the current native runtime",()=>{
 for(const profile of ["functional","full"]){const plan=candidateReleasePlan({profile}),check=plan.checks.find(row=>row.id==="selected-asset-bytes");assert.deepEqual(check.args,["scripts/probe-selected-asset-bytes.mjs","target/promoted-shared-web"]);assert.ok(plan.checks.indexOf(check)>plan.checks.findIndex(row=>row.id==="collaboration-build"));}
});
test("both profiles require exact shared backups and startup upgrade admission without a runtime reuse shortcut",()=>{
 for(const profile of ["functional","full"]){const plan=candidateReleasePlan({profile}),find=id=>{const value=plan.checks.find(c=>c.id===id);assert.ok(value,id);return value;};
  for(const [id,file]of [["shared-session-backups","probe-session-backups.mjs"],["shared-asset-archive-history","probe-shared-asset-backups.mjs"],["paired-session-backups","probe-paired-backups.mjs"],["session-opening-upgrade-fence","probe-session-opening-upgrade.mjs"]])assert.deepEqual(find(id).args,[`scripts/${file}`,"target/promoted-shared-web"]);
  const installed=find("installed-session-backups");assert.deepEqual(installed.args,["scripts/check-session-backups-installed.mjs"]);assert.deepEqual(installed.artifacts,[{path:"target/session-backups-installed-consumer.json",fresh:true}]);
  const browser=plan.checks.find(c=>c.id==="installed-session-backups-browser");if(profile==="full"){assert.deepEqual(browser.args,["scripts/check-session-backups-browser.mjs"]);assert.deepEqual(browser.artifacts,[{path:"target/session-backups-installed-browser.json",fresh:true}]);}else assert.equal(browser,undefined);
 }
});
test("asset archive contracts and fresh public packages are mandatory; full additionally requires native raster/reload acceptance",()=>{
 for(const profile of ["functional","full"]){const plan=candidateReleasePlan({profile}),find=id=>{const check=plan.checks.find(c=>c.id===id);assert.ok(check,id);return check;};assert.deepEqual(find("asset-archive-storage-contracts").args,["--test","scripts/asset-backups.test.mjs"]);const installed=find("installed-asset-backups");assert.deepEqual(installed.args,["scripts/check-asset-backups-installed.mjs"]);assert.deepEqual(installed.artifacts,[{path:"target/asset-backups-installed-consumer.json",fresh:true}]);const browser=plan.checks.find(c=>c.id==="installed-asset-backups-browser");if(profile==="full"){assert.deepEqual(browser.args,["scripts/check-asset-backups-browser.mjs"]);assert.deepEqual(browser.artifacts,[{path:"target/asset-backups-installed-browser.json",fresh:true}]);}else assert.equal(browser,undefined);}
});
test("both candidate profiles require portable input rules without reusing or inventing historical fixtures",()=>{
 for(const profile of ["functional","full"]){
  const plan=candidateReleasePlan({profile}),find=id=>{const value=plan.checks.find(c=>c.id===id);assert.ok(value,id);return value;};
  assert.deepEqual(find("input-rules-borrowed-controls").args,["scripts/probe-input-rules-ui.mjs","--current-runtime-only","target/rich-browser-web","target/promoted-shared-web"]);
  assert.deepEqual(find("input-rules-managed-startup").args,["scripts/probe-input-rules-root-sdk.mjs","target/rich-browser-web","target/promoted-shared-web"]);
  const installed=find("installed-input-rule-workflows");assert.deepEqual(installed.args,["scripts/check-input-rules-installed.mjs","--current-runtime-only"]);assert.deepEqual(installed.artifacts,[{path:"target/input-rules-current-installed-consumer.json",fresh:true}]);
  assert.ok(!installed.args.includes("--reuse-runtimes"));assert.ok(plan.deferred.includes("pinned-input-rule-historical-readers"));
  const index=id=>plan.checks.findIndex(c=>c.id===id);assert.ok(index("paired-local-runtime")<index("input-rules-borrowed-controls"));assert.ok(index("paired-shared-runtime")<index("input-rules-managed-startup"));assert.ok(index("installed-input-rule-workflows")<index("readiness-inventory"));
  assert.ok(plan.checks.every(c=>c.args.every(arg=>!arg.includes("input-rule-old-readers-")&&!arg.includes("input-rules-runtime-"))),"CI has no dependency on untracked historical caches");
 }
});
test("both profiles require complete current writing utilities, actual root React and fresh installed archives",()=>{
 for(const profile of ["functional","full"]){const plan=candidateReleasePlan({profile}),find=id=>{const value=plan.checks.find(c=>c.id===id);assert.ok(value,id);return value;};
  assert.deepEqual(find("writing-tools-native-sdk-and-controls").args,["scripts/probe-writing-tools.mjs","target/rich-browser-web","target/promoted-shared-web"]);
  assert.deepEqual(find("writing-tools-managed-startup").args,["scripts/probe-writing-tools-root-sdk.mjs","target/rich-browser-web","target/promoted-shared-web"]);
  const installed=find("installed-writing-tools-workflows");assert.deepEqual(installed.args,["scripts/check-writing-tools-installed.mjs"]);assert.deepEqual(installed.artifacts,[{path:"target/writing-tools-installed-consumer.json",fresh:true}]);assert.ok(!installed.args.includes("--reuse-runtimes"));
  assert.ok(plan.checks.findIndex(c=>c.id==="paired-shared-runtime")<plan.checks.findIndex(c=>c.id==="writing-tools-native-sdk-and-controls"));assert.ok(plan.checks.findIndex(c=>c.id==="installed-writing-tools-workflows")<plan.checks.findIndex(c=>c.id==="readiness-inventory"));
 }
});
test("clean candidate SDK prerequisites and explicit rich types precede dependent checks in both profiles",()=>{
 for(const profile of ["functional","full"]){const p=candidateReleasePlan({profile}),index=id=>{const n=p.checks.findIndex(c=>c.id===id);assert.ok(n>=0,id);return n;},find=id=>p.checks[index(id)];
  assert.deepEqual(find("rich-browser-build").args,["node_modules/typescript/bin/tsc","-p","packages/breditor-experimental-rich-content/tsconfig.json"]);
  assert.deepEqual(find("rich-browser-types").args,["node_modules/typescript/bin/tsc","-p","packages/breditor-experimental-rich-content/tsconfig.json","--noEmit"]);
  assert.equal(find("rich-browser-build").command,process.execPath);assert.equal(find("rich-browser-types").command,process.execPath);
  assert.ok(index("paired-shared-runtime")<index("rich-browser-build"));assert.ok(index("rich-browser-build")<index("collaboration-build"));assert.ok(index("collaboration-build")<index("editor-build"));assert.ok(index("editor-build")<index("clean-candidate-sdk-build"));
  for(const id of ["search-programmatic-sdk","input-rules-borrowed-controls","writing-tools-native-sdk-and-controls","installed-editor-pairing"])assert.ok(index("clean-candidate-sdk-build")<index(id));
  const clean=find("clean-candidate-sdk-build");assert.deepEqual(clean.args,["scripts/check-candidate-sdk-build.mjs"]);assert.deepEqual(clean.artifacts,[{path:"target/candidate-sdk-build.json",fresh:true}]);assert.ok(index("rich-browser-types")<index("readiness-inventory"));
 }
});
test("both profiles require portable fullscreen workflows and fresh acceptance; full adds native browser activation",()=>{
 for(const profile of ["functional","full"]){const p=candidateReleasePlan({profile}),find=id=>{const row=p.checks.find(x=>x.id===id);assert.ok(row,id);return row;};assert.deepEqual(find("fullscreen-sdk-and-controls").args,["scripts/probe-fullscreen.mjs","target/rich-browser-web","target/promoted-shared-web"]);const installed=find("installed-fullscreen-workflows");assert.deepEqual(installed.args,["scripts/check-fullscreen-installed.mjs"]);assert.deepEqual(installed.artifacts,[{path:"target/fullscreen-installed-consumer.json",fresh:true}]);assert.ok(!installed.args.includes("--reuse-runtimes"));assert.ok(p.checks.findIndex(x=>x.id==="editor-build")<p.checks.findIndex(x=>x.id==="fullscreen-sdk-and-controls"));assert.ok(p.checks.findIndex(x=>x.id==="installed-fullscreen-workflows")<p.checks.findIndex(x=>x.id==="readiness-inventory"));if(profile==="full"){const browser=find("installed-fullscreen-browser");assert.deepEqual(browser.args,["scripts/check-fullscreen-browser.mjs"]);assert.deepEqual(browser.artifacts,[{path:"target/fullscreen-installed-browser.json",fresh:true}]);}else assert.ok(!p.checks.some(x=>x.id==="installed-fullscreen-browser"));}
});
test("both profiles require current native placeholder workflows and fresh isolated acceptance",()=>{
 for(const profile of ["functional","full"]){const p=candidateReleasePlan({profile}),find=id=>{const r=p.checks.find(s=>s.id===id);assert.ok(r,id);return r;};assert.deepEqual(find("placeholder-native-sdk-and-controls").args,["scripts/probe-placeholder.mjs","target/rich-browser-web","target/promoted-shared-web"]);const installed=find("installed-placeholder-workflows");assert.deepEqual(installed.args,["scripts/check-placeholder-installed.mjs"]);assert.deepEqual(installed.artifacts,[{path:"target/placeholder-installed-consumer.json",fresh:true}]);assert.ok(!installed.args.includes("--reuse-runtimes"));assert.ok(p.checks.findIndex(s=>s.id==="rich-browser-build")<p.checks.findIndex(s=>s.id==="placeholder-native-sdk-and-controls"));assert.ok(p.checks.findIndex(s=>s.id==="installed-placeholder-workflows")<p.checks.findIndex(s=>s.id==="readiness-inventory"));if(profile==="full"){const browser=find("installed-placeholder-browser");assert.deepEqual(browser.args,["scripts/check-placeholder-browser.mjs"]);assert.deepEqual(browser.artifacts,[{path:"target/placeholder-installed-browser.json",fresh:true}]);}else assert.ok(!p.checks.some(s=>s.id==="installed-placeholder-browser"));}
});
test("dry run is cwd-independent and explicitly cannot imply V1 readiness",()=>{
 const script=join(repository,"scripts/verify-candidate.mjs"),r=spawnSync(process.execPath,[script,"--functional","--dry-run"],{cwd:tmpdir(),encoding:"utf8"});assert.equal(r.status,0,r.stderr);const p=JSON.parse(r.stdout);assert.equal(p.executed,false);assert.equal(p.v1Ready,false);assert.equal(p.profile,"functional");assert.ok(p.deferred.length>0);
 for(const args of [["--skip-tests"],["--functional","--functional"],["--help","--functional"]]){const bad=spawnSync(process.execPath,[script,...args],{encoding:"utf8"});assert.equal(bad.status,2);assert.equal(bad.stdout,"");}
 const help=spawnSync(process.execPath,[script,"--help"],{encoding:"utf8"});assert.equal(help.status,0);assert.match(help.stdout,/not V1 readiness/);
});
test("nested default and candidate builds receive the same selected toolchain without a PATH requirement",()=>{
 const environment={BREDITOR_CARGO:"/tools with spaces/cargo",BREDITOR_RUSTC:"/tools with spaces/rustc",BREDITOR_WASM_BINDGEN:"/tools with spaces/bindgen",WASM_BINDGEN_TEST_RUNNER_BIN:"/tools with spaces/runner",BREDITOR_NPM:"/tools with spaces/npm"};
 for(const c of candidateReleasePlan({environment}).checks){assert.equal(c.env.CARGO_BIN,environment.BREDITOR_CARGO);assert.equal(c.env.BREDITOR_CARGO,environment.BREDITOR_CARGO);assert.equal(c.env.RUSTC,environment.BREDITOR_RUSTC);assert.equal(c.env.RUSTC_BIN,environment.BREDITOR_RUSTC);assert.equal(c.env.BREDITOR_RUSTC,environment.BREDITOR_RUSTC);assert.equal(c.env.WASM_BINDGEN_BIN,environment.BREDITOR_WASM_BINDGEN);assert.equal(c.env.BREDITOR_WASM_BINDGEN,environment.BREDITOR_WASM_BINDGEN);assert.equal(c.env.WASM_BINDGEN_TEST_RUNNER_BIN,environment.WASM_BINDGEN_TEST_RUNNER_BIN);assert.equal(c.env.NPM_BIN,environment.BREDITOR_NPM);assert.equal(c.env.NODE_BIN,process.execPath);}
 const old=candidateReleasePlan({environment:{CARGO_BIN:"/legacy/cargo",RUSTC_BIN:"/legacy/rustc",WASM_BINDGEN_BIN:"/legacy/bindgen",NPM_BIN:"/legacy/npm"}});assert.equal(old.checks[0].env.CARGO_BIN,"/legacy/cargo");assert.equal(old.checks[0].env.BREDITOR_RUSTC,"/legacy/rustc");assert.equal(old.checks[0].env.BREDITOR_WASM_BINDGEN,"/legacy/bindgen");assert.equal(old.checks.find(c=>c.id==="default-typescript-build").command,"/legacy/npm");
});
test("source identity includes dirty/untracked inputs but ignores generated cache bytes",()=>{
 const root=temporary();try{
  execFileSync("git",["init","--quiet"],{cwd:root});writeFileSync(join(root,".gitignore"),"cache/\n");writeFileSync(join(root,"input.rs"),"original source");execFileSync("git",["add","--",".gitignore","input.rs"],{cwd:root});execFileSync("git",["-c","user.name=Fixture","-c","user.email=fixture@example.invalid","commit","--quiet","-m","Fixture"],{cwd:root});
  const first=sourceEvidence(root);assert.equal(first.dirty,false);assert.equal(first.files,2);
  mkdirSync(join(root,"cache"));writeFileSync(join(root,"cache/generated.bin"),"ignored cache bytes");assert.equal(sourceEvidence(root).sha256,first.sha256);assert.equal(sourceEvidence(root).dirty,false);
  writeFileSync(join(root,"extra.ts"),"untracked candidate");const extra=sourceEvidence(root);assert.equal(extra.dirty,true);assert.equal(extra.files,3);assert.notEqual(extra.sha256,first.sha256);
  const before=extra.sha256;utimesSync(join(root,"input.rs"),new Date(),new Date());assert.equal(sourceEvidence(root).sha256,before,"Timestamps are not source content");
  writeFileSync(join(root,"input.rs"),"modified source");assert.notEqual(sourceEvidence(root).sha256,before);
  symlinkSync(join(root,"input.rs"),join(root,"unsupported-link.rs"));assert.throws(()=>sourceEvidence(root),/Unsupported/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test("artifact evidence refuses traversal, directories and escaping symbolic links",()=>{
 const root=temporary(),outside=temporary();try{writeFileSync(join(root,"result.json"),"proof");writeFileSync(join(outside,"secret"),"outside");assert.equal(fileEvidence(root,"result.json").bytes,5);assert.throws(()=>fileEvidence(root,"../secret"));assert.throws(()=>fileEvidence(root,"."));symlinkSync(join(outside,"secret"),join(root,"outside"));assert.throws(()=>fileEvidence(root,"outside"),/escapes/);}finally{rmSync(root,{recursive:true,force:true});rmSync(outside,{recursive:true,force:true});}
});
test("atomic evidence replaces only the fresh owned manifest and leaves no intermediate file",()=>{
 const root=temporary();try{const path=join(root,"result.json");saveEvidence(path,{status:"running"});saveEvidence(path,{status:"failed"});assert.deepEqual(JSON.parse(readFileSync(path,"utf8")),{status:"failed"});assert.equal(existsSync(`${path}.next`),false);assert.equal(statSync(path).mode&0o777,0o600);}finally{rmSync(root,{recursive:true,force:true});}
});
test("real child output is retained with its exact exit status, including launch failure",async()=>{
 const root=temporary();try{
  const success=await executeCandidateStage(fixtureCheck(),{root,logPath:join(root,"ok.log")});assert.equal(success.status,"passed");assert.equal(success.exitCode,0);assert.match(readFileSync(join(root,"ok.log"),"utf8"),/fixture proof/);
  const failed=await executeCandidateStage(fixtureCheck("failed","console.error('retained failure');process.exitCode=7"),{root,logPath:join(root,"bad.log")});assert.equal(failed.status,"failed");assert.equal(failed.exitCode,7);assert.match(readFileSync(join(root,"bad.log"),"utf8"),/retained failure/);
  const absent=await executeCandidateStage({...fixtureCheck(),command:join(root,"absent-executable")},{root,logPath:join(root,"absent.log")});assert.equal(absent.status,"launch-failed");assert.match(absent.error,/ENOENT/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test("timeouts, aborted execution and log exhaustion cannot pass",async()=>{
 const root=temporary();try{
  const timeout=await executeCandidateStage({...fixtureCheck("timeout","setInterval(()=>{},1000)"),timeoutMs:80},{root,logPath:join(root,"timeout.log")});assert.equal(timeout.status,"timeout");
  const limit=await executeCandidateStage(fixtureCheck("limit","console.log('x'.repeat(1000))"),{root,logPath:join(root,"limit.log"),logLimit:64});assert.equal(limit.status,"log-limit");assert.equal(statSync(join(root,"limit.log")).size,64);
  const controller=new AbortController();controller.abort();const aborted=await executeCandidateStage(fixtureCheck("aborted","throw Error('must not launch')"),{root,logPath:join(root,"aborted.log"),signal:controller.signal});assert.equal(aborted.status,"interrupted");assert.equal(aborted.logBytes,0);
  const running=new AbortController(),timer=setTimeout(()=>running.abort(),80);try{const stopped=await executeCandidateStage(fixtureCheck("cancel-running","setInterval(()=>{},1000)"),{root,logPath:join(root,"cancel.log"),signal:running.signal});assert.equal(stopped.status,"interrupted");}finally{clearTimeout(timer);}
 }finally{rmSync(root,{recursive:true,force:true});}
});
test("a completed functional run still records no V1 or publication approval",async()=>{
 const root=temporary();try{const run=await runCandidateChecks(plan([fixtureCheck()]),quiet({root}));assert.equal(run.exitCode,0);assert.equal(run.result.selectedChecksPassed,true);assert.equal(run.result.v1Ready,false);assert.equal(run.result.publicationApproved,false);assert.equal(run.result.stages[0].log.bytes,14);assert.equal(JSON.parse(readFileSync(run.manifest,"utf8")).status,"passed");}finally{rmSync(root,{recursive:true,force:true});}
});
test("first failed stage retains evidence and does not run later stages",async()=>{
 const root=temporary();try{const run=await runCandidateChecks(plan([fixtureCheck("first","process.exitCode=7"),fixtureCheck("never")]),quiet({root}));assert.equal(run.exitCode,1);assert.equal(run.result.stages.length,1);assert.equal(run.result.status,"failed");assert.equal(run.result.stages[0].exitCode,7);assert.ok(existsSync(run.result.stages[0].logPath));}finally{rmSync(root,{recursive:true,force:true});}
});
test("source inventory refusal is retained before any child launches",async()=>{
 const root=temporary();let launched=false;try{
  const run=await runCandidateChecks(plan([fixtureCheck()]),quiet({root,snapshot:()=>{throw Error("Unsupported source inventory");},execute:async()=>{launched=true;throw Error("must not launch");}}));
  assert.equal(launched,false);assert.equal(run.exitCode,1);assert.equal(run.result.source,null);assert.equal(run.result.stages.length,0);assert.match(run.result.error,/Unsupported source inventory/);assert.deepEqual(JSON.parse(readFileSync(run.manifest,"utf8")),run.result);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test("a running stage retains its start time before the child completes",async()=>{
 const root=temporary();try{const run=await runCandidateChecks(plan([fixtureCheck()]),quiet({root,execute:async(check,options)=>{const manifest=JSON.parse(readFileSync(join(options.root,"target/v1-candidate-runs",(await import("node:fs")).readdirSync(join(options.root,"target/v1-candidate-runs"))[0],"result.json"),"utf8"));assert.equal(manifest.stages[0].status,"running");assert.ok(Number.isFinite(Date.parse(manifest.stages[0].startedAt)));return executeCandidateStage(check,options);}}));assert.equal(run.exitCode,0);}finally{rmSync(root,{recursive:true,force:true});}
});
test("missing/stale declared artifacts reject a zero-exit stage",async()=>{
 for(const stale of [false,true]){const root=temporary();try{if(stale){writeFileSync(join(root,"proof.json"),"old");utimesSync(join(root,"proof.json"),new Date(0),new Date(0));}const check={...fixtureCheck(),artifacts:[{path:"proof.json",fresh:true}]},run=await runCandidateChecks(plan([check]),quiet({root}));assert.equal(run.exitCode,1);assert.equal(run.result.stages[0].status,"failed");if(stale)assert.match(run.result.error,/Stale stage report/);}finally{rmSync(root,{recursive:true,force:true});}}
});
test("a source edit during a stage invalidates its pass before later checks",async()=>{
 const root=temporary();let changed=false;try{const run=await runCandidateChecks(plan([fixtureCheck("first"),fixtureCheck("never")]),quiet({root,snapshot:()=>({...stable(),sha256:changed?"changed":"original"}),execute:async(check,options)=>{const result=await executeCandidateStage(check,options);changed=true;return result;}}));assert.equal(run.exitCode,1);assert.equal(run.result.stages.length,1);assert.equal(run.result.stages[0].status,"failed");assert.equal(run.result.stages[0].log.sha256,fileEvidence(root,run.result.stages[0].log.path).sha256,"Source changes cannot discard the completed stage log hash");assert.match(run.result.error,/Source changed/);}finally{rmSync(root,{recursive:true,force:true});}
});
test("empty, repeated or path-bearing check IDs cannot manufacture a successful run",async()=>{
 const root=temporary();try{for(const checks of [[],[fixtureCheck("same"),fixtureCheck("same")],[fixtureCheck("../outside")]])await assert.rejects(runCandidateChecks(plan(checks),quiet({root})),/Invalid candidate check plan/);}finally{rmSync(root,{recursive:true,force:true});}
});
test("workspace exposes the separate candidate verifier without changing the default verifier",()=>{
 const {scripts}=JSON.parse(readFileSync(join(repository,"package.json"),"utf8"));assert.equal(scripts["verify:release"],"node scripts/verify-release.mjs");assert.equal(scripts["verify:candidate"],"node scripts/verify-candidate.mjs");assert.equal(scripts["verify:candidate:functional"],"node scripts/verify-candidate.mjs --functional");
});
test("both profiles require durable participant attempts and all explicit native session families",()=>{
 for(const profile of ["functional","full"]){const plan=candidateReleasePlan({profile}),find=id=>{const r=plan.checks.find(s=>s.id===id);assert.ok(r,id);return r;};assert.deepEqual(find("participant-recovery-storage-contracts").args,["--test","scripts/participant-recovery-storage.test.mjs"]);assert.deepEqual(find("participant-recovery-type-fence").args,["node_modules/typescript/bin/tsc","--noEmit","--strict","--exactOptionalPropertyTypes","--target","ES2022","--module","NodeNext","--lib","ES2022,DOM","scripts/fixtures/editor-consumer/types-participant-recovery.ts"]);for(const [id,file]of [["participant-recovery","probe-participant-recovery.mjs"],["document-participant-recovery","probe-document-participant-recovery.mjs"]]){assert.deepEqual(find(id).args,[`scripts/${file}`,"target/promoted-shared-web"]);assert.ok(plan.checks.indexOf(find(id))>plan.checks.indexOf(find("collaboration-build")));}}
});
test("both profiles require exact native inventory, real SDK recovery and public immutable non-authority types",()=>{
 for(const profile of ["functional","full"]){
  const p=candidateReleasePlan({profile}),find=id=>{const row=p.checks.find(s=>s.id===id);assert.ok(row,id);return row;};
  assert.deepEqual(find("room-participant-inventory-contracts").args,["--test","scripts/room-participant-inventory.test.mjs"]);
  assert.deepEqual(find("room-participant-inventory-type-fence").args,["node_modules/typescript/bin/tsc","--noEmit","--strict","--exactOptionalPropertyTypes","--target","ES2022","--module","NodeNext","--lib","ES2022,DOM","scripts/fixtures/editor-consumer/types-room-participant-inventory.ts"]);
  for(const [id,script,path]of [["native-room-participant-inventory","check-room-participant-inventory-native.mjs","target/room-participant-inventory-native.json"],["room-participant-inventory","check-room-participant-inventory-sdk.mjs","target/room-participant-inventory-sdk.json"]]){const row=find(id);assert.deepEqual(row.args,[`scripts/${script}`]);assert.deepEqual(row.artifacts,[{path,fresh:true}]);assert.ok(p.checks.indexOf(row)>p.checks.indexOf(find("collaboration-build")));}
  assert.ok(p.checks.indexOf(find("native-room-participant-inventory"))<p.checks.indexOf(find("room-participant-inventory")));assert.deepEqual(find("installed-session-backups").args,["scripts/check-session-backups-installed.mjs"]);
 }
});
test("fresh installed backup acceptance retains old assertions and adds bare native inventory and production imports",()=>{
 const text=readFileSync(join(repository,"scripts/check-session-backups-installed.mjs"),"utf8");
 for(const required of ["types-room-participant-inventory.ts","buildRoomParticipantInventoryFixtures({saveReport:false})","room-participant-inventory-probe.mjs","room-participant-inventory.html","/node_modules/@breditor/collaboration/dist/room_participant_inventory/","acceptance.cases,20","retainedStores.storeRestores,90","participantBackups","participantRecovery","documentParticipantRecovery","registeredStreamsCovered:40","documentForkRefusals:10","reviewForkRefusals:10","futureDocumentCheckpoints:36","networkCalls:0"])assert.ok(text.includes(required),required);
 assert.ok(!text.includes('args.includes("--skip')&&!text.includes("--skip-inventory"));
});
test("both profiles require exact initial policy through native fixtures, public types and installed owners",()=>{
 for(const profile of ["functional","full"]){const p=candidateReleasePlan({profile}),find=id=>p.checks.find(row=>row.id===id),row=find("initial-read-only-recovery");assert.ok(row);assert.deepEqual(row.args,["scripts/check-initial-read-only-sdk.mjs"]);assert.deepEqual(row.artifacts,[{path:"target/initial-read-only-sdk.json",fresh:true}]);assert.ok(p.checks.indexOf(find("native-room-participant-inventory"))<p.checks.indexOf(row));assert.deepEqual(find("initial-read-only-type-fence").args,["node_modules/typescript/bin/tsc","--noEmit","--strict","--exactOptionalPropertyTypes","--target","ES2022","--module","NodeNext","--lib","ES2022,DOM","scripts/fixtures/editor-consumer/types-initial-read-only.ts"]);}
 const installed=readFileSync(join(repository,"scripts/check-session-backups-installed.mjs"),"utf8");for(const required of ["types-initial-read-only.ts","initial-read-only-probe.mjs","initialReadOnly","families:108","protectedReopens:20","initial-read-only.html","/node_modules/@breditor/collaboration/dist/initialize_read_only.js"])assert.ok(installed.includes(required),required);
});
test("both profiles require durable room catalogs with original native re-admission and retained copies",()=>{
 for(const profile of ["functional","full"]){const p=candidateReleasePlan({profile}),find=id=>p.checks.find(row=>row.id===id),row=find("room-recovery-catalog");assert.ok(row);assert.deepEqual(row.args,["scripts/check-room-recovery-catalog-sdk.mjs"]);assert.deepEqual(row.artifacts,[{path:"target/room-recovery-catalog-sdk.json",fresh:true}]);assert.ok(p.checks.indexOf(find("native-room-participant-inventory"))<p.checks.indexOf(row));assert.deepEqual(find("room-recovery-catalog-contracts").args,["--test","scripts/room-recovery-catalog-storage.test.mjs"]);assert.ok(find("room-recovery-catalog-type-fence").args.includes("scripts/fixtures/editor-consumer/types-room-recovery-catalog.ts"));}
 const installed=readFileSync(join(repository,"scripts/check-session-backups-installed.mjs"),"utf8");for(const required of ["types-room-recovery-catalog.ts","room-recovery-catalog-probe.mjs","roomRecoveryCatalog","pendingRetainedCopies:10","lostAcknowledgementResumes:3","fabricatedCompletionRefusals:1","room-recovery-catalog.html","/node_modules/@breditor/collaboration/dist/room_recovery_catalog/"])assert.ok(installed.includes(required),required);
});
test("both profiles require native recovery-origin continuity and pre-autosave storage admission",()=>{
 for(const profile of ["functional","full"]){const p=candidateReleasePlan({profile}),find=id=>{const row=p.checks.find(s=>s.id===id);assert.ok(row,id);return row;};assert.deepEqual(find("participant-origin-storage-contracts").args,["--test","scripts/participant-origin-storage.test.mjs"]);assert.ok(find("participant-origin-type-fence").args.includes("scripts/fixtures/editor-consumer/types-recovery-origin.ts"));assert.deepEqual(find("participant-native-origin").args,["scripts/probe-participant-origin.mjs","target/promoted-shared-web"]);assert.ok(p.checks.indexOf(find("participant-native-origin"))>p.checks.indexOf(find("collaboration-build")));}
});
