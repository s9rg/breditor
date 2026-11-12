/** Build and pin the actual Cargo artifact consumed by metadata fixtures. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {realpathSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {sourceEvidence} from "./candidate-release/evidence.mjs";
import {
 nativeSuggestionExample, nativeSuggestionTarget, retainNativeSuggestionBuild,
} from "./candidate-release/native-suggestion-build-evidence.mjs";

assert.deepEqual(process.argv.slice(2), [nativeSuggestionExample], "Select the normal Native suggestion fixture");
const root = realpathSync(fileURLToPath(new URL("../", import.meta.url)));
const source = sourceEvidence(root);
const cargo = process.env.BREDITOR_CARGO ?? process.env.CARGO_BIN ?? "cargo";
const args = [
 "build", "--manifest-path", "experiments/relay/Cargo.toml", "--features", "server",
 "--locked", "--offline", "--release", "--example", nativeSuggestionExample, "--message-format=json",
];
const log = execFileSync(cargo, args, {
 cwd:root, env:{...process.env,CARGO_TARGET_DIR:join(root,nativeSuggestionTarget)},
 encoding:"utf8", maxBuffer:32 * 1024 * 1024, stdio:["ignore","pipe","inherit"],
});
const messages = log.split("\n").filter(Boolean).map(line => JSON.parse(line));
const artifacts = messages.filter(row => row.reason === "compiler-artifact" && row.executable &&
 row.target.name === nativeSuggestionExample && row.target.kind.includes("example"));
assert.equal(artifacts.length, 1, "Cargo must report exactly one Native suggestion executable");
const receipt = retainNativeSuggestionBuild(root, source, artifacts[0].executable);
console.log(JSON.stringify(receipt));
