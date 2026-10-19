/** Complete named candidate checks; no publication, deployment or silent skipped stages. */
import {existsSync} from "node:fs";
import {homedir} from "node:os";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {candidateRuntimePaths} from "../candidate-runtime-paths.mjs";
export const repository=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
export const deferredFunctionalGates=Object.freeze([
 "default-package-release-matrix","installed-editor-browser-matrix",
 "native-clipboard-ime-screen-reader-mobile","performance-size-long-session",
 "public-deployment-auth-isolation","storage-lifecycle-and-restore-drills",
 "dependency-license-review","catalog-parity-and-final-rc-approval",
 "pinned-input-rule-historical-readers",
]);
/** Functional success is deliberately not V1 readiness. Full adds existing browser/default
 * release checks and the fail-closed readiness ledger; it cannot approve manual gates. */
export function candidateReleasePlan({profile="full",environment=process.env}={}){
 if(profile!=="functional"&&profile!=="full")throw Error("Choose functional or full candidate verification");
 const tool=(name,override)=>{const local=resolve(homedir(),`.cargo/bin/${name}`);return override??(existsSync(local)?local:name);};
 const cargo=tool("cargo",environment.BREDITOR_CARGO??environment.CARGO_BIN),rustc=tool("rustc",environment.BREDITOR_RUSTC??environment.RUSTC_BIN??environment.RUSTC),bindgen=tool("wasm-bindgen",environment.BREDITOR_WASM_BINDGEN??environment.WASM_BINDGEN_BIN),runner=tool("wasm-bindgen-test-runner",environment.WASM_BINDGEN_TEST_RUNNER_BIN),npm=environment.BREDITOR_NPM??environment.NPM_BIN??"npm",node=process.execPath;
 // Original scripts and newer candidate builders use distinct documented aliases.
 // Select once, then pass the same tools through every nested build and record them.
 const tools={CARGO_BIN:cargo,BREDITOR_CARGO:cargo,RUSTC_BIN:rustc,BREDITOR_RUSTC:rustc,RUSTC:rustc,WASM_BINDGEN_BIN:bindgen,BREDITOR_WASM_BINDGEN:bindgen,WASM_BINDGEN_TEST_RUNNER_BIN:runner,NPM_BIN:npm,NODE_BIN:node};
 const shared=resolve(repository,"target/historical-source-native"),relay=resolve(repository,"target/owned-history-relay-native"),wasm=resolve(repository,"target/promoted-shared-wasm");
 const executablePath=name=>`target/owned-history-relay-native/release/examples/${name}${process.platform==="win32"?".exe":""}`,executable=name=>resolve(repository,executablePath(name)),stage=(id,command,args,env={},artifacts=[],timeoutMs=1800000)=>Object.freeze({id,command,args:Object.freeze(args),env:Object.freeze({...tools,...env}),artifacts:Object.freeze(artifacts.map(value=>Object.freeze(typeof value==="string"?{path:value}:value))),timeoutMs});
 const script=(id,file,args=[],artifacts=[],timeout)=>stage(id,node,[`scripts/${file}`,...args],{},artifacts,timeout);
 const sharedCargo=(id,[command,...args])=>stage(id,cargo,[command,"--manifest-path","crates/breditor-collaboration/Cargo.toml",...args],{CARGO_TARGET_DIR:shared});
 const relayCargo=(id,[command,...args],artifacts=[])=>stage(id,cargo,[command,"--manifest-path","experiments/relay/Cargo.toml",...args],{CARGO_TARGET_DIR:relay},artifacts);
 const checks=[
  stage("candidate-runner-contracts",node,["--test","scripts/verify-candidate.test.mjs"]),
  stage("rust-toolchain",cargo,["--version","--verbose"]),
  stage("workspace-format",cargo,["fmt","--all","--","--check"]),
  stage("workspace-lint",cargo,["clippy","--workspace","--all-targets","--all-features","--locked","--offline","--release","--","-D","warnings"],{CARGO_TARGET_DIR:shared}),
  stage("workspace-native",cargo,["test","--workspace","--all-features","--locked","--offline","--release"],{CARGO_TARGET_DIR:shared}),
  stage("workspace-docs",cargo,["doc","--workspace","--all-features","--no-deps","--locked","--offline","--release"],{CARGO_TARGET_DIR:shared,RUSTDOCFLAGS:"-D warnings"}),
  sharedCargo("shared-format",["fmt","--","--check"]),
  stage("shared-lint",cargo,["clippy","--manifest-path","crates/breditor-collaboration/Cargo.toml","--all-targets","--locked","--offline","--release","--","-D","warnings"],{CARGO_TARGET_DIR:shared}),
  sharedCargo("shared-native",["test","--locked","--offline","--release"]),
  relayCargo("relay-format",["fmt","--","--check"]),
  stage("relay-lint",cargo,["clippy","--manifest-path","experiments/relay/Cargo.toml","--features","server","--all-targets","--locked","--offline","--release","--","-D","warnings"],{CARGO_TARGET_DIR:relay}),
  relayCargo("relay-native",["test","--features","server","--locked","--offline","--release"]),
  script("independent-native-consumer","check-collaboration-native-consumer.mjs",[],[{path:"target/collaboration-native-consumer.json",fresh:true}]),
  stage("default-typescript-build",npm,["run","build"]),
  script("paired-local-runtime","build-rich-runtime.mjs",[],["packages/breditor-experimental-rich-content/dist/breditor_wasm.js","packages/breditor-experimental-rich-content/dist/breditor_wasm_bg.wasm","packages/breditor-experimental-rich-content/dist/breditor_wasm.d.ts","packages/breditor-experimental-rich-content/dist/breditor_dependency_inventory.json","packages/breditor-experimental-rich-content/dist/THIRD_PARTY_NOTICES.txt","packages/breditor-experimental-rich-content/dist/RUST_COPYRIGHT-library.html"]),
  script("paired-shared-runtime","build-collaboration-runtime.mjs",[],["packages/breditor-collaboration/dist/runtime/breditor_shared.js","packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm","packages/breditor-collaboration/dist/runtime/breditor_shared.d.ts","packages/breditor-collaboration/dist/runtime/breditor_dependency_inventory.json","packages/breditor-collaboration/dist/runtime/THIRD_PARTY_NOTICES.txt","packages/breditor-collaboration/dist/runtime/RUST_COPYRIGHT-library.html"]),
  stage("shared-wasm-lint",cargo,["clippy","--manifest-path","crates/breditor-collaboration/Cargo.toml","--no-default-features","--target","wasm32-unknown-unknown","--locked","--offline","--release","--lib","--","-D","warnings"],{CARGO_TARGET_DIR:wasm,...candidateRuntimePaths(repository,wasm,environment).environment}),
  stage("rich-browser-build",node,["node_modules/typescript/bin/tsc","-p","packages/breditor-experimental-rich-content/tsconfig.json"]),
  stage("collaboration-build",npm,["run","build:candidate","--workspace","@breditor/collaboration"]),
  stage("editor-build",npm,["run","build:candidate","--workspace","@breditor/editor"]),
  script("clean-candidate-sdk-build","check-candidate-sdk-build.mjs",[],[{path:"target/candidate-sdk-build.json",fresh:true}]),
  stage("typescript-tests-and-script-contracts",npm,["test"]),
  stage("editor-sdk-tests",npm,["run","test:candidate","--workspace","@breditor/editor"]),
  stage("asset-archive-storage-contracts",node,["--test","scripts/asset-backups.test.mjs"]),
  script("search-programmatic-sdk","probe-search-sdk.mjs",["target/rich-browser-web","target/promoted-shared-web"]),
  script("search-persistent-sessions","probe-search-persistence-sdk.mjs",["target/promoted-shared-web"]),
  script("shared-session-backups","probe-session-backups.mjs",["target/promoted-shared-web"]),
  script("shared-asset-archive-history","probe-shared-asset-backups.mjs",["target/promoted-shared-web"]),
  script("paired-session-backups","probe-paired-backups.mjs",["target/promoted-shared-web"]),
  script("session-opening-upgrade-fence","probe-session-opening-upgrade.mjs",["target/promoted-shared-web"]),
  script("search-borrowed-controls","probe-search-ui.mjs",["target/rich-browser-web","target/promoted-shared-web"]),
  script("search-managed-startup","probe-search-root-sdk.mjs",["target/rich-browser-web","target/promoted-shared-web"]),
  // Portable feature acceptance is explicit; pinned historical-reader evidence remains separate.
  script("input-rules-borrowed-controls","probe-input-rules-ui.mjs",["--current-runtime-only","target/rich-browser-web","target/promoted-shared-web"]),
  script("input-rules-managed-startup","probe-input-rules-root-sdk.mjs",["target/rich-browser-web","target/promoted-shared-web"]),
  script("writing-tools-native-sdk-and-controls","probe-writing-tools.mjs",["target/rich-browser-web","target/promoted-shared-web"]),
  script("writing-tools-managed-startup","probe-writing-tools-root-sdk.mjs",["target/rich-browser-web","target/promoted-shared-web"]),
  script("placeholder-native-sdk-and-controls","probe-placeholder.mjs",["target/rich-browser-web","target/promoted-shared-web"]),
  script("fullscreen-sdk-and-controls","probe-fullscreen.mjs",["target/rich-browser-web","target/promoted-shared-web"]),
  stage("workspace-types",npm,["run","typecheck"]),
  stage("rich-browser-types",node,["node_modules/typescript/bin/tsc","-p","packages/breditor-experimental-rich-content/tsconfig.json","--noEmit"]),
  stage("collaboration-types",npm,["run","typecheck:candidate","--workspace","@breditor/collaboration"]),
  stage("editor-types",npm,["run","typecheck:candidate","--workspace","@breditor/editor"]),
  script("installed-editor-pairing","check-editor-package.mjs",[],[{path:"target/editor-installed-consumer.json",fresh:true}]),
  script("installed-search-workflows","check-search-installed.mjs",[],[{path:"target/search-installed-consumer.json",fresh:true}]),
  script("installed-input-rule-workflows","check-input-rules-installed.mjs",["--current-runtime-only"],[{path:"target/input-rules-current-installed-consumer.json",fresh:true}]),
  script("installed-writing-tools-workflows","check-writing-tools-installed.mjs",[],[{path:"target/writing-tools-installed-consumer.json",fresh:true}]),
  script("installed-placeholder-workflows","check-placeholder-installed.mjs",[],[{path:"target/placeholder-installed-consumer.json",fresh:true}]),
  script("installed-fullscreen-workflows","check-fullscreen-installed.mjs",[],[{path:"target/fullscreen-installed-consumer.json",fresh:true}]),
  script("installed-session-backups","check-session-backups-installed.mjs",[],[{path:"target/session-backups-installed-consumer.json",fresh:true}]),
  script("installed-asset-backups","check-asset-backups-installed.mjs",[],[{path:"target/asset-backups-installed-consumer.json",fresh:true}]),
  script("installed-rich-interchange","check-interchange-package.mjs",[],[{path:"target/interchange-installed-consumer.json",fresh:true}]),
  relayCargo("functional-native-fixtures",["build","--features","server","--locked","--offline","--release","--example","transport_v2_functional","--example","suggestions_functional","--example","suggestion_revisions_functional","--example","review_assets_functional"],["transport_v2_functional","suggestions_functional","suggestion_revisions_functional","review_assets_functional"].map(executablePath)),
  script("installed-everyday-mixed-workflows","check-editor-mixed-workflows.mjs",["--reuse-installed",executable("transport_v2_functional")],[{path:"target/editor-mixed-workflows.json",fresh:true}]),
  script("installed-text-review-and-readers","check-suggestion-text-rebase-installed.mjs",[executable("suggestions_functional"),executable("suggestion_revisions_functional")]),
  script("installed-formatting-review-and-readers","check-suggestion-format-rebase-installed.mjs",[executable("suggestions_functional"),executable("suggestion_revisions_functional")]),
  script("installed-assets-comments-versions","check-review-assets-installed.mjs",[executable("review_assets_functional")]),
  script("readiness-inventory","check-v1-readiness.mjs",["--json"]),
 ];
 if(profile==="full")checks.push(
  script("installed-search-browser","check-search-browser.mjs",[],[{path:"target/search-installed-browser.json",fresh:true}]),
  script("installed-placeholder-browser","check-placeholder-browser.mjs",[],[{path:"target/placeholder-installed-browser.json",fresh:true}]),
  script("installed-fullscreen-browser","check-fullscreen-browser.mjs",[],[{path:"target/fullscreen-installed-browser.json",fresh:true}]),
  script("installed-session-backups-browser","check-session-backups-browser.mjs",[],[{path:"target/session-backups-installed-browser.json",fresh:true}]),
  script("installed-asset-backups-browser","check-asset-backups-browser.mjs",[],[{path:"target/asset-backups-installed-browser.json",fresh:true}]),
  script("default-package-release-matrix","verify-release.mjs",[],[],7200000),
  script("installed-editor-browser-matrix","check-editor-browser.mjs",[],[],7200000),
  script("reviewed-v1-readiness","check-v1-readiness.mjs",["--require-ready"]),
 );
 return Object.freeze({profile,qualification:"candidate-checks-not-release-approval",v1Ready:false,deferred:profile==="functional"?deferredFunctionalGates:Object.freeze(deferredFunctionalGates.filter(id=>!["default-package-release-matrix","installed-editor-browser-matrix"].includes(id))),checks:Object.freeze(checks)});
}
