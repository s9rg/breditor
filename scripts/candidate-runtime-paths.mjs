/** Canonical path remapping for opt-in application Wasm; never changes runtime protocols. */
import {existsSync,realpathSync} from "node:fs";
import {homedir} from "node:os";
import {basename,dirname,resolve} from "node:path";

/** Resolve symlinked parents without creating target/cache directories during a dry run. */
export function physicalBuildPath(path){
 let parent=resolve(path);const suffix=[];
 while(!existsSync(parent)){const next=dirname(parent);if(next===parent)throw Error("Build path has no existing ancestor");suffix.unshift(basename(parent));parent=next;}
 return resolve(realpathSync(parent),...suffix);
}
/** Match the original package's deterministic remapping, including logical and physical aliases. */
export function candidateRuntimePaths(repository,target,environment=process.env,physical=physicalBuildPath){
 if(environment.RUSTFLAGS||environment.CARGO_ENCODED_RUSTFLAGS)throw Error("Candidate Wasm builders own their Rust flags; custom Rust flags require a separate research build");
 const root=resolve(repository),cache=resolve(root,target),cargo=resolve(root,environment.CARGO_HOME||resolve(homedir(),".cargo")),mappings=new Map();
 for(const [path,replacement]of [[cache,"target"],[cargo,"cargo"],[root,"breditor"]])for(const prefix of [path,physical(path)]){
  if(prefix.includes("=")||prefix.includes("\u001f")||prefix.includes("\0")||prefix===dirname(prefix))throw Error("Unsupported path for deterministic Rust remapping");
  if(!mappings.has(prefix))mappings.set(prefix,replacement);
 }
 return Object.freeze({environment:Object.freeze({CARGO_ENCODED_RUSTFLAGS:[...mappings].map(([prefix,replacement])=>`--remap-path-prefix=${prefix}=${replacement}`).join("\u001f")}),forbiddenPrefixes:Object.freeze([...mappings.keys()])});
}
