/** Source-bound receipt for the normal Native suggestion relay fixture. */
import assert from "node:assert/strict";
import {lstatSync, readFileSync, realpathSync} from "node:fs";
import {join} from "node:path";
import {fileEvidence, saveEvidence, sourceEvidence} from "./evidence.mjs";

export const nativeSuggestionExample = "selected_suggestion_delivery_functional";
export const nativeSuggestionTarget = "target/owned-history-relay-native";
const suffix = process.platform === "win32" ? ".exe" : "";
export const nativeSuggestionExecutable = nativeSuggestionTarget + "/release/examples/" + nativeSuggestionExample + suffix;
export const nativeSuggestionBuildReport = "target/native-suggestion-room-host-build.json";
const format = "breditor/native-suggestion-room-host-build";
const host = () => ({platform:process.platform, arch:process.arch});

function executableEvidence(root, transferred = false) {
 const path = join(root, nativeSuggestionExecutable);
 assert.equal(realpathSync(path), path, "Native suggestion host must use the owned build path");
 const stat = lstatSync(path);
 assert.ok(stat.isFile() && stat.size > 0, "Native suggestion host must be a nonempty file");
 if (!transferred) assert.ok((stat.mode & 0o111) !== 0, "Native suggestion host must be executable");
 const {bytes, sha256} = fileEvidence(root, nativeSuggestionExecutable);
 return {path:nativeSuggestionExecutable, bytes, sha256};
}

export function retainNativeSuggestionBuild(root, source, executable) {
 const expected = join(root, nativeSuggestionExecutable);
 assert.equal(executable, expected, "Cargo reported a different Native suggestion executable");
 const binary = executableEvidence(root);
 assert.deepEqual(sourceEvidence(root), source, "Source changed during the Native suggestion build");
 const receipt = {format, version:1, source, host:host(), binary};
 saveEvidence(join(root, nativeSuggestionBuildReport), receipt);
 return receipt;
}

export function verifyNativeSuggestionBuild(root, source, {transferred = false} = {}) {
 const {sha256} = fileEvidence(root, nativeSuggestionBuildReport);
 const receipt = JSON.parse(readFileSync(join(root, nativeSuggestionBuildReport)));
 assert.equal(receipt.format, format);
 assert.equal(receipt.version, 1);
 assert.deepEqual(receipt.host, host(), "Native suggestion host was built for a different platform");
 assert.deepEqual(receipt.source, source, "Native suggestion build belongs to another candidate");
 assert.deepEqual(receipt.binary, executableEvidence(root, transferred), "Native suggestion executable differs from its build receipt");
 assert.equal(fileEvidence(root, nativeSuggestionBuildReport).sha256, sha256, "Native suggestion receipt changed");
 return {sha256, binary:receipt.binary};
}
