/** Build the server binary and account for the matching locked native Cargo graph. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {existsSync,mkdirSync,readFileSync,realpathSync,writeFileSync} from "node:fs";
import {homedir} from "node:os";
import {join,relative,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {pinnedRustNotices,renderRuntimeNotices,repository,runtimeNoticeFiles} from "./build-runtime-notices.mjs";
import {candidateDependencyInventory} from "./candidate-dependencies/inventory.mjs";

const packageName="breditor-collab-relay";
const manifestPath="experiments/relay/Cargo.toml";
export const relayNoticePaths=runtimeNoticeFiles.map(name=>`target/relay-native-notices/${name}`);
const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");

export function selectRelayExecutable(messages,packageId){
 const binaries=messages.filter(message=>message.reason==="compiler-artifact"&&
  message.package_id===packageId&&message.target?.name===packageName&&
  message.target.kind.includes("bin")&&message.profile?.test===false&&typeof message.executable==="string");
 assert.equal(binaries.length,1,"Expected one executable from the selected relay build");
 return binaries[0].executable;
}

export function buildRelayNotices(environment=process.env){
 const tool=(name,override)=>{
  const local=join(homedir(),".cargo/bin",name);
  return override??(existsSync(local)?local:name);
 };
 const cargo=tool("cargo",environment.BREDITOR_CARGO);
 const rustc=tool("rustc",environment.BREDITOR_RUSTC);
 const run=(command,args)=>execFileSync(command,args,{
  cwd:repository,
  env:{...environment,CARGO_TARGET_DIR:environment.CARGO_TARGET_DIR??resolve(repository,"target/owned-history-relay-native")},
  encoding:"utf8",maxBuffer:16*1024*1024,
 });
 const host=run(rustc,["--version","--verbose"]).match(/^host: ([a-zA-Z0-9_-]+)$/m)?.[1];
 assert.ok(host,"Rust did not report a host target");
 const {copyright,rust}=pinnedRustNotices(rustc,run);
 const selected=["--manifest-path",manifestPath,"--features","server","--locked","--offline"];
 const metadata=JSON.parse(run(cargo,["metadata","--format-version","1","--filter-platform",host,...selected]));
 const upstream=JSON.parse(readFileSync(resolve(repository,"scripts/candidate-dependencies/upstream-notices.json"),"utf8"));
 assert.equal(upstream.format,"breditor/pinned-upstream-notices");
 assert.equal(upstream.formatVersion,1);
 const cargoLock=readFileSync(resolve(repository,"experiments/relay/Cargo.lock"),"utf8");
 const result=candidateDependencyInventory(metadata,packageName,{
  cargoLock,
  firstPartyPaths:{
   [packageName]:resolve(repository,"experiments/relay"),
   "breditor-collab-feasibility":resolve(repository,"experiments/collaboration"),
   "breditor-core":resolve(repository,"crates/breditor-core"),
  },
  vendoredPaths:{
   loro:resolve(repository,"crates/breditor-collaboration/vendor/loro-1.16.2"),
   "loro-internal":resolve(repository,"crates/breditor-collaboration/vendor/loro-internal-1.16.2"),
  },
  upstreamNotices:upstream.entries,
 });
 const messages=run(cargo,["build","--release","--target",host,"--bin",packageName,"--message-format=json",...selected])
  .trim().split("\n").map(line=>JSON.parse(line));
 const built=selectRelayExecutable(messages,metadata.resolve.root);
 const text=renderRuntimeNotices(result);
 const manifest={
  ...result.inventory,
  nativeBuild:{target:host,profile:"release",features:["server"],executableSha256:sha256(readFileSync(built))},
  noticeBundleSha256:sha256(text),
  cargoLockSha256:sha256(cargoLock),
  rust,
 };
 mkdirSync(resolve(repository,"target/relay-native-notices"),{recursive:true});
 const outputs=[JSON.stringify(manifest,null,2)+"\n",text,copyright];
 for(const [index,path] of relayNoticePaths.entries())writeFileSync(resolve(repository,path),outputs[index]);
 return {binary:relative(repository,built),nativeBuild:manifest.nativeBuild,packages:manifest.packages.length,
  missingNoticeTexts:manifest.gaps,inventorySha256:manifest.sha256,licenseReview:manifest.licenseReview};
}

if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==2){
  console.error("Usage: node scripts/build-relay-notices.mjs");
  process.exitCode=2;
 }else console.log(JSON.stringify(buildRelayNotices(),null,2));
}
