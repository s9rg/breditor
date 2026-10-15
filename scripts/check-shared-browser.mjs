// Explicit opt-in checkpoint. Local relay tests only; no publication or default Wasm linkage.
import {execFileSync} from "node:child_process";import {mkdirSync,existsSync,cpSync} from "node:fs";import {resolve,dirname} from "node:path";import {fileURLToPath} from "node:url";import {homedir} from "node:os";
const root=resolve(dirname(fileURLToPath(import.meta.url)),".."),bin=resolve(homedir(),".cargo/bin"),cargo=process.env.BREDITOR_CARGO??(existsSync(resolve(bin,"cargo"))?resolve(bin,"cargo"):"cargo"),bindgen=process.env.BREDITOR_WASM_BINDGEN??resolve(bin,"wasm-bindgen"),manifest="experiments/collaboration/Cargo.toml",target=resolve(root,"target/collaboration-feasibility"),web=resolve(root,"target/collaboration-feasibility-web"),native={...process.env,CARGO_TARGET_DIR:resolve(root,"target/collaboration-native"),CARGO_PROFILE_DEV_DEBUG:"0",CARGO_PROFILE_TEST_DEBUG:"0",CARGO_INCREMENTAL:"0"},wasm={...process.env,CARGO_TARGET_DIR:target};
const run=(cmd,args,env=native)=>execFileSync(cmd,args,{cwd:root,env,stdio:"inherit"});
run(cargo,["fmt","--manifest-path",manifest,"--check"]);run(cargo,["clippy","--manifest-path",manifest,"--locked","--all-targets","--quiet"]);run(cargo,["test","--manifest-path",manifest,"--locked","--quiet"]);
run(cargo,["clippy","--manifest-path",manifest,"--locked","--target","wasm32-unknown-unknown","--lib","--quiet"],wasm);run(cargo,["build","--manifest-path",manifest,"--locked","--target","wasm32-unknown-unknown","--release","--quiet"],wasm);mkdirSync(web,{recursive:true});
run(bindgen,["--target","web","--out-dir",web,resolve(target,"wasm32-unknown-unknown/release/breditor_collab_feasibility.wasm")],wasm);run(cargo,["run","--manifest-path",manifest,"--locked","--example","export_vector","--quiet","--",resolve(web,"native-vector.json")]);run(cargo,["build","--manifest-path",manifest,"--locked","--example","compare_engine_exports","--quiet"]);
run(cargo,["build","--manifest-path",manifest,"--locked","--example","relay_contract_driver","--quiet"]);
run(process.execPath,["scripts/check-relay.mjs"]);
run(resolve(root,"node_modules/.bin/tsc"),["-p","packages/breditor-experimental-rich-content/tsconfig.json"]);run(resolve(root,"node_modules/.bin/tsc"),["-p","packages/breditor-experimental-collaboration/tsconfig.json"]);
run(resolve(root,"node_modules/.bin/tsc"),["--noEmit","--strict","--target","ES2022","--lib","ES2022,DOM,ESNext.Disposable","--module","NodeNext","experiments/shared-browser/types.ts"]);
for(const name of["LICENSE-MIT","LICENSE-APACHE"])cpSync(resolve(root,name),resolve(root,"packages/breditor-experimental-collaboration",name));
run(process.execPath,["--test","scripts/shared-browser-runs.test.mjs"]);
run(process.execPath,["scripts/check-shared-browser-matrix.mjs"]);
run(process.execPath,["scripts/check-shared-package.mjs"]);
