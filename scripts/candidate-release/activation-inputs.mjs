/** Exact build inputs shared by the six whole-room activation checks. */
import assert from "node:assert/strict";
import {
 constants, copyFileSync, lstatSync, mkdirSync, readFileSync, readdirSync,
 realpathSync, statSync, chmodSync, unlinkSync, rmdirSync,
} from "node:fs";
import {createHash} from "node:crypto";
import {dirname, join} from "node:path";
import {fileEvidence, saveEvidence, sourceEvidence} from "./evidence.mjs";
import {sharedRuntimeBuildReport, verifySharedRuntimeBuild} from "./shared-runtime-evidence.mjs";

const runtimeDirectories = [
 "packages/breditor-browser/dist",
 "packages/breditor-experimental-rich-content/dist",
 "packages/breditor-collaboration/dist",
 "target/promoted-shared-web",
];
const handoverHost = "target/handover-activation-native/release/examples/native_handover_activation_sdk_functional";
const nativeExecutables = [
 handoverHost,
 "target/owned-history-relay-native/release/examples/complete_cohort_control_functional",
 "target/owned-history-relay-native/release/examples/selected_suggestion_delivery_functional",
];
const handoverReport = "target/handover-native-activation-native-build.json";
export const activationBuildReports = Object.freeze([handoverReport, sharedRuntimeBuildReport]);
const inputRoots = [...runtimeDirectories, ...nativeExecutables, ...activationBuildReports];
const maxInputBytes = 256 * 1024 * 1024;
const format = "breditor/activation-qualification-inputs";

const environment = () => ({platform:process.platform, arch:process.arch, node:process.version});
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const sameBytes = ({path, bytes, sha256}) => ({path, bytes, sha256});

function assertSource(root, expected) {
 const source = sourceEvidence(root);
 assert.equal(source.dirty, false, "Activation shards require a clean candidate");
 assert.match(source.commit, /^[a-f0-9]{40,64}$/);
 if (expected) assert.deepEqual(source, expected, "Activation shard belongs to another candidate");
 return source;
}

function listFiles(root, path, files) {
 const full = join(root, path);
 const stat = lstatSync(full);
 assert.equal(realpathSync(full), full, "Activation input cannot use symlinks");
 if (stat.isDirectory()) {
  for (const name of readdirSync(full).sort()) listFiles(root, path + "/" + name, files);
 } else {
  assert.ok(stat.isFile(), "Activation input must be a regular file");
  files.push(path);
  assert.ok(files.length <= 8192, "Too many activation input files");
 }
}

function activationInputs(root) {
 const paths = [];
 for (const path of runtimeDirectories) {
  assert.ok(lstatSync(join(root, path)).isDirectory(), "Missing runtime directory " + path);
  const size = paths.length;
  listFiles(root, path, paths);
  assert.ok(paths.length > size, "Empty runtime directory " + path);
 }
 for (const path of [...nativeExecutables, ...activationBuildReports]) {
  assert.ok(lstatSync(join(root, path)).isFile(), "Missing activation input " + path);
  listFiles(root, path, paths);
 }
 const files = paths.map(path => sameBytes(fileEvidence(root, path)));
 assert.ok(files.reduce((total, file) => total + file.bytes, 0) <= maxInputBytes,
  "Activation inputs exceed their size budget");
 return files;
}

function validateBuild(root, files, source) {
 verifySharedRuntimeBuild(root, source);
 const build = JSON.parse(readFileSync(join(root, handoverReport)));
 assert.equal(build.format, "breditor/handover-native-activation-native-build");
 assert.equal(build.complete && build.sourceUnchanged, true);
 assert.equal(build.exitCode, 0);
 assert.deepEqual(build.source, source);
 const host = files.find(file => file.path === handoverHost);
 assert.equal(build.binaries.length, 1);
 assert.equal(build.binaries[0].sha256, host.sha256);
 assert.equal(build.binaries[0].bytes, host.bytes);
}

function copyInputs(from, to, files, verify) {
 const checkedDirectories = new Set([to]);
 const created = [];
 function ensureDirectory(path) {
  if (checkedDirectories.has(path)) return;
  ensureDirectory(dirname(path));
  const stat = lstatSync(path, {throwIfNoEntry:false});
  if (stat) assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), "Invalid activation input parent");
  else {
   mkdirSync(path);
   created.push({path, remove:rmdirSync});
  }
  checkedDirectories.add(path);
 }
 try {
  for (const {path} of files) {
   const output = join(to, path);
   ensureDirectory(dirname(output));
   copyFileSync(join(from, path), output, constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE);
   created.push({path:output, remove:unlinkSync});
   if (nativeExecutables.includes(path)) chmodSync(output, 0o755);
  }
  verify();
 } catch (error) {
  const failures = [error];
  for (const {path, remove} of created.reverse()) {
   try { remove(path); }
   catch (cleanupError) { if (cleanupError.code !== "ENOENT") failures.push(cleanupError); }
  }
  if (failures.length > 1) throw new AggregateError(failures, "Activation input copy and rollback failed");
  throw error;
 }
}

function assertAbsent(root, path) {
 const full = join(root, path);
 assert.equal(lstatSync(full, {throwIfNoEntry:false}), undefined,
  "Refusing to replace activation input " + path);
 // No redirected parent may receive files during restoration.
 for (let parent = dirname(full); parent !== root; parent = dirname(parent)) {
  const stat = lstatSync(parent, {throwIfNoEntry:false});
  if (stat) assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), "Invalid activation input parent");
 }
}

export function sealActivationInputs(root, directory) {
 root = realpathSync(root);
 const source = assertSource(root);
 const files = activationInputs(root);
 validateBuild(root, files, source);
 mkdirSync(directory);
 copyInputs(root, directory, files, () => {
  assert.deepEqual(activationInputs(directory), files);
  assert.deepEqual(activationInputs(root), files, "Activation inputs changed during export");
  assertSource(root, source);
 });
 saveEvidence(join(directory, "inputs.json"), {format, version:1, source, environment:environment(), files});
 return checkActivationBundle(root, directory);
}

export function checkActivationBundle(root, directory, expectedSha256) {
 directory = realpathSync(directory);
 const manifestPath = join(directory, "inputs.json");
 const stat = lstatSync(manifestPath);
 assert.ok(stat.isFile() && stat.size <= 4 * 1024 * 1024, "Invalid activation input manifest");
 const bytes = readFileSync(manifestPath);
 const sha256 = hash(bytes);
 if (expectedSha256 !== undefined) assert.equal(sha256, expectedSha256, "Activation bundle differs from the producer's receipt");
 const manifest = JSON.parse(bytes);
 assert.equal(manifest.format, format);
 assert.equal(manifest.version, 1);
 assert.deepEqual(manifest.environment, environment(), "Activation worker uses a different host or Node baseline");
 assertSource(root, manifest.source);
 const files = activationInputs(directory);
 assert.deepEqual(files, manifest.files, "Activation bundle differs from its manifest");
 validateBuild(directory, files, manifest.source);
 return {sha256, source:manifest.source, files};
}

export function restoreActivationInputs(root, directory, expectedSha256) {
 root = realpathSync(root);
 const bundle = checkActivationBundle(root, directory, expectedSha256);
 assertActivationDestination(root);
 copyInputs(realpathSync(directory), root, bundle.files, () => verifyActivationInputs(root, bundle));
 return bundle;
}

export function assertActivationDestination(root) {
 root = realpathSync(root);
 for (const path of inputRoots) assertAbsent(root, path);
}

export function verifyActivationInputs(root, bundle) {
 root = realpathSync(root);
 assertSource(root, bundle.source);
 assert.deepEqual(activationInputs(root), bundle.files, "Activation inputs changed during qualification");
 for (const path of nativeExecutables) {
  assert.ok(statSync(join(root, path)).mode & 0o100, "Activation host is not executable");
 }
}

/** A separately rebuilt candidate may have different build-report timestamps. */
export function verifyCandidateActivationBuild(root, bundle) {
 root = realpathSync(root);
 assertSource(root, bundle.source);
 const files = activationInputs(root);
 validateBuild(root, files, bundle.source);
 const runtime = rows => rows.filter(file => file.path !== handoverReport);
 assert.deepEqual(runtime(files), runtime(bundle.files), "Candidate build differs from the activation workers' inputs");
 for (const path of nativeExecutables) {
  assert.ok(statSync(join(root, path)).mode & 0o100, "Activation host is not executable");
 }
}
