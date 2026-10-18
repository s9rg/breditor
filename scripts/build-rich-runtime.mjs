/** Build the exact local Rust/Wasm runtime before assembling rich/shared archives. */
import {execFileSync} from "node:child_process";
import {cpSync,existsSync,mkdirSync,realpathSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {homedir} from "node:os";
import {fileURLToPath} from "node:url";
import {runtimeNoticeFiles} from "./build-runtime-notices.mjs";
import {candidateRuntimePaths} from "./candidate-runtime-paths.mjs";

export const repository=resolve(dirname(fileURLToPath(import.meta.url)),"..");
export const runtimeFiles=Object.freeze(["breditor_wasm.js","breditor_wasm.d.ts","breditor_wasm_bg.wasm","breditor_wasm_bg.wasm.d.ts"]);
/** Explicit feature/target pairing; no default package output, registry or publication. */
export function richRuntimeBuildPlan(environment=process.env){
 const bin=resolve(homedir(),".cargo/bin"),cargo=environment.BREDITOR_CARGO??(existsSync(resolve(bin,"cargo"))?resolve(bin,"cargo"):"cargo"),bindgen=environment.BREDITOR_WASM_BINDGEN??(existsSync(resolve(bin,"wasm-bindgen"))?resolve(bin,"wasm-bindgen"):"wasm-bindgen");
 const target=resolve(repository,"target/rich-browser-wasm"),web=resolve(repository,"target/rich-browser-web"),output=resolve(repository,"packages/breditor-experimental-rich-content/dist");
 const paths=candidateRuntimePaths(repository,target,environment);
 const step=(command,args)=>Object.freeze({command,args:Object.freeze(args)});
 return Object.freeze({target,web,output,rustEnvironment:paths.environment,steps:Object.freeze([
  step(cargo,["build","-p","breditor-wasm","--locked","--features","experimental-rich-content","--target","wasm32-unknown-unknown","--release","--offline"]),
  step(bindgen,["--target","web","--out-dir",web,resolve(target,"wasm32-unknown-unknown/release/breditor_wasm.wasm")]),
  step(process.execPath,["scripts/wasm-path-leaks.mjs",resolve(web,"breditor_wasm_bg.wasm"),...paths.forbiddenPrefixes]),
  step(process.execPath,["scripts/build-runtime-notices.mjs","rich"]),
 ])});
}
/** A failed compile/bindgen cannot copy a stale runtime into the package output. */
export function buildRichRuntime(environment=process.env,operations={run:execFileSync,copy:cpSync,mkdir:mkdirSync}){
 const plan=richRuntimeBuildPlan(environment),options={cwd:repository,env:{...environment,...plan.rustEnvironment,CARGO_TARGET_DIR:plan.target},stdio:"inherit",shell:false};
 for(const [index,step]of plan.steps.entries()){
  if(index===1)operations.mkdir(plan.web,{recursive:true});
  operations.run(step.command,step.args,options);
 }
 operations.mkdir(plan.output,{recursive:true});
 for(const file of runtimeFiles)operations.copy(resolve(plan.web,file),resolve(plan.output,file));
 operations.copy(resolve(plan.web,"snippets"),resolve(plan.output,"snippets"),{recursive:true});
 for(const file of runtimeNoticeFiles)operations.copy(resolve(plan.web,file),resolve(plan.output,file));
 return plan;
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);
 if(args.length===1&&args[0]==="--dry-run")console.log(JSON.stringify({executed:false,...richRuntimeBuildPlan()},null,2));
 else if(args.length){console.error("Usage: node scripts/build-rich-runtime.mjs [--dry-run]; builds matching local rich Wasm, never publishes.");process.exitCode=2;}
 else buildRichRuntime();
}
