/** Build the optional application runtime from canonical Rust, never the research module. */
import {execFileSync} from "node:child_process";
import {cpSync,existsSync,mkdirSync,realpathSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {homedir} from "node:os";
import {fileURLToPath} from "node:url";
import {runtimeNoticeFiles} from "./build-runtime-notices.mjs";
import {candidateRuntimePaths} from "./candidate-runtime-paths.mjs";
export const repository=resolve(dirname(fileURLToPath(import.meta.url)),"..");
export const runtimeFiles=Object.freeze(["breditor_shared.js","breditor_shared.d.ts","breditor_shared_bg.wasm","breditor_shared_bg.wasm.d.ts"]);
export function collaborationRuntimeBuildPlan(environment=process.env){
 const bin=resolve(homedir(),".cargo/bin"),cargo=environment.BREDITOR_CARGO??(existsSync(resolve(bin,"cargo"))?resolve(bin,"cargo"):"cargo"),bindgen=environment.BREDITOR_WASM_BINDGEN??(existsSync(resolve(bin,"wasm-bindgen"))?resolve(bin,"wasm-bindgen"):"wasm-bindgen");
 const target=resolve(repository,"target/promoted-shared-wasm"),web=resolve(repository,"target/promoted-shared-web"),output=resolve(repository,"packages/breditor-collaboration/dist/runtime");
 const paths=candidateRuntimePaths(repository,target,environment);
 const step=(command,args)=>Object.freeze({command,args:Object.freeze(args)});
 return Object.freeze({target,web,output,rustEnvironment:paths.environment,steps:Object.freeze([
  step(cargo,["build","--manifest-path","crates/breditor-collaboration/Cargo.toml","--locked","--no-default-features","--target","wasm32-unknown-unknown","--release","--offline"]),
  step(bindgen,["--target","web","--out-name","breditor_shared","--out-dir",web,resolve(target,"wasm32-unknown-unknown/release/breditor_collaboration.wasm")]),
  step(process.execPath,["scripts/wasm-path-leaks.mjs",resolve(web,"breditor_shared_bg.wasm"),...paths.forbiddenPrefixes]),
  step(process.execPath,["scripts/check-collaboration-runtime-surface.mjs",web]),
  step(process.execPath,["scripts/build-runtime-notices.mjs","shared"]),
 ])});
}
/** Compile, bind and verify the actual export surface before copying any candidate bytes. */
export function buildCollaborationRuntime(environment=process.env,operations={run:execFileSync,copy:cpSync,mkdir:mkdirSync}){
 const plan=collaborationRuntimeBuildPlan(environment),options={cwd:repository,env:{...environment,...plan.rustEnvironment,CARGO_TARGET_DIR:plan.target},stdio:"inherit",shell:false};
 for(const[index,step]of plan.steps.entries()){if(index===1)operations.mkdir(plan.web,{recursive:true});operations.run(step.command,step.args,options);}
 operations.mkdir(plan.output,{recursive:true});for(const file of runtimeFiles)operations.copy(resolve(plan.web,file),resolve(plan.output,file));
 const snippets=resolve(plan.web,"snippets");if(existsSync(snippets))operations.copy(snippets,resolve(plan.output,"snippets"),{recursive:true});
 for(const file of runtimeNoticeFiles)operations.copy(resolve(plan.web,file),resolve(plan.output,file));
 return plan;
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);if(args.length===1&&args[0]==="--dry-run")console.log(JSON.stringify({executed:false,...collaborationRuntimeBuildPlan()},null,2));
 else if(args.length){console.error("Usage: node scripts/build-collaboration-runtime.mjs [--dry-run]; never publishes.");process.exitCode=2;}else buildCollaborationRuntime();
}
