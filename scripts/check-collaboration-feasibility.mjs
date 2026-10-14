// Reproducible isolated checkpoint. No publishing, packing or shipping entry edits.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cargoBin = resolve(homedir(), ".cargo", "bin");
const cargo = process.env.BREDITOR_CARGO ?? (existsSync(resolve(cargoBin, "cargo")) ? resolve(cargoBin, "cargo") : "cargo");
const bindgen = process.env.BREDITOR_WASM_BINDGEN ?? (existsSync(resolve(cargoBin, "wasm-bindgen")) ? resolve(cargoBin, "wasm-bindgen") : "wasm-bindgen");
const nativeTarget = resolve(root, "target/collaboration-native");
const wasmTarget = resolve(root, "target/collaboration-feasibility");
const web = resolve(root, "target/collaboration-feasibility-web");
const manifest = "experiments/collaboration/Cargo.toml";
const nativeEnv = { ...process.env, CARGO_TARGET_DIR: nativeTarget, CARGO_PROFILE_DEV_DEBUG: "0", CARGO_PROFILE_TEST_DEBUG: "0", CARGO_INCREMENTAL: "0" };
const wasmEnv = { ...process.env, CARGO_TARGET_DIR: wasmTarget };

function run(command, args, env = nativeEnv) {
  execFileSync(command, args, { cwd: root, env, stdio: "inherit" });
}

run(cargo, ["fmt", "--all", "--check"]);
run(cargo, ["fmt", "--manifest-path", manifest, "--check"]);
run(cargo, ["clippy", "--manifest-path", manifest, "--locked", "--all-targets", "--quiet"]);
run(cargo, ["test", "--manifest-path", manifest, "--locked", "--quiet"]);
run(cargo, ["clippy", "-p", "breditor-core", "--locked", "--features", "experimental-rich-content", "--lib", "--test", "rich_content_contracts", "--test", "rich_ast_contracts", "--test", "rich_table_actions", "--quiet"]);
run(cargo, ["test", "-p", "breditor-core", "--locked", "--lib", "--quiet"]);
run(cargo, ["test", "-p", "breditor-core", "--locked", "--features", "experimental-rich-content", "--lib", "--quiet"]);
run(cargo, ["test", "-p", "breditor-core", "--locked", "--features", "experimental-rich-content", "--doc", "--quiet"]);
run(cargo, ["test", "-p", "breditor-core", "--locked", "--features", "experimental-rich-content", "--test", "rich_content_contracts", "--quiet"]);
run(cargo, ["test", "-p", "breditor-core", "--locked", "--features", "experimental-rich-content", "--test", "rich_ast_contracts", "--quiet"]);
run(cargo, ["test", "-p", "breditor-core", "--locked", "--features", "experimental-rich-content", "--test", "rich_table_actions", "--quiet"]);
run(cargo, ["clippy", "--manifest-path", manifest, "--locked", "--target", "wasm32-unknown-unknown", "--lib", "--quiet"], wasmEnv);
run(cargo, ["build", "--manifest-path", manifest, "--locked", "--target", "wasm32-unknown-unknown", "--release", "--quiet"], wasmEnv);
mkdirSync(web, { recursive: true });
run(bindgen, ["--target", "web", "--out-dir", web, resolve(wasmTarget, "wasm32-unknown-unknown/release/breditor_collab_feasibility.wasm")], wasmEnv);
run(cargo, ["run", "--manifest-path", manifest, "--locked", "--example", "export_vector", "--quiet", "--", resolve(web, "native-vector.json")]);
run(resolve(root, "node_modules/.bin/playwright"), ["test", "--config", "experiments/collaboration/browser/playwright.config.mjs"]);
const wasm = readFileSync(resolve(web, "breditor_collab_feasibility_bg.wasm"));
console.log(JSON.stringify({ checkpoint: "collaboration-feasibility", wasmBytes: wasm.length, gzipBytes: gzipSync(wasm).length, sha256: createHash("sha256").update(wasm).digest("hex") }));
