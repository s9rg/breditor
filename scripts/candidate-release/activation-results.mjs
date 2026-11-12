/** Bind each finished activation check to its input bundle and retained evidence. */
import assert from "node:assert/strict";
import {copyFileSync, mkdirSync, readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileEvidence, saveEvidence} from "./evidence.mjs";
import {activationPlan, activationStageIds} from "./activation-shards.mjs";
import {activationBuildReports} from "./activation-inputs.mjs";
import {sharedRuntimeBuildReport, sharedRuntimeReceiptVariable} from "../fixtures/native-runtime/shared-runtime-receipt.mjs";

const format = "breditor/activation-qualification-shard";
const sha256Pattern = /^[a-f0-9]{64}$/;
const load = path => JSON.parse(readFileSync(path));
const logName = stage => "01-" + stage + ".log";
const digest = (directory, name) => fileEvidence(directory, name).sha256;
export const activationReportName = stage => "activation-check-" + stage;

function verifyFiles(directory, stage, bundle) {
 const check = activationPlan(stage).checks[0];
 const result = load(join(directory, "result.json"));
 assert.equal(result.format, "breditor/candidate-qualification");
 assert.equal(result.formatVersion, 1);
 assert.equal(result.profile, "functional");
 assert.equal(result.status, "passed");
 assert.equal(result.selectedChecksPassed, true);
 assert.deepEqual(result.source, bundle.source);
 assert.equal(result.stages.length, 1);
 const [entry] = result.stages;
 assert.equal(entry.id, stage);
 assert.equal(entry.status, "passed");
 assert.equal(entry.exitCode, 0);
 assert.equal(entry.signal, null);
 assert.deepEqual(entry.args, check.args);
 const runtimeReceipt = bundle.files.find(file => file.path === sharedRuntimeBuildReport);
 assert.ok(runtimeReceipt);
 assert.equal(entry.env[sharedRuntimeReceiptVariable], runtimeReceipt.sha256, "Activation worker used a different shared runtime receipt");
 const log = logName(stage);
 const logSha256 = digest(directory, log);
 assert.equal(logSha256, entry.log.sha256, "Activation shard log changed");
 const files = {resultSha256:digest(directory, "result.json"), logSha256};
 if (check.artifacts.length === 0) {
  const text = readFileSync(join(directory, log), "utf8");
  for (const [name, count] of Object.entries({tests:22, pass:22, fail:0, cancelled:0, skipped:0})) {
   assert.ok(text.split("\n").includes("# " + name + " " + count), "Incomplete source activation suite");
  }
  return {files};
 }
 const installedSha256 = digest(directory, "installed.json");
 assert.equal(entry.artifacts.length, 1);
 assert.equal(entry.artifacts[0].path, check.artifacts[0].path);
 assert.equal(installedSha256, entry.artifacts[0].sha256, "Installed activation report changed");
 const installed = load(join(directory, "installed.json"));
 assert.deepEqual(installed.source, bundle.source);
 assert.equal(installed.complete && installed.passed && installed.sourceUnchanged && installed.wholeRoomActivated, true);
 assert.equal(installed.workspaceLinks, false);
 assert.equal(installed.cases, 22);
 assert.equal(installed.sharedRuntimeReceiptSha256, runtimeReceipt.sha256);
 assert.match(installed.logSha256, sha256Pattern);
 const expected = new Map(bundle.files.map(file => [file.path, file]));
 const runtime = new Map(installed.runtime.map(file => [file.path, file]));
 for (const [path, file] of expected) {
  if (path.startsWith("target/") && !activationBuildReports.includes(path)) {
   assert.equal(runtime.get(path)?.sha256, file.sha256, "Installed activation used different input " + path);
   assert.equal(runtime.get(path)?.bytes, file.bytes);
  }
 }
 const archives = installed.archives.map(({name, sha256}) => ({name, sha256})).sort((a, b) => a.name.localeCompare(b.name));
 assert.deepEqual(archives.map(row => row.name), [
  "@breditor/browser", "@breditor/collaboration", "@breditor/experimental-rich-content",
 ]);
 assert.ok(archives.every(row => sha256Pattern.test(row.sha256)));
 return {files:{...files, installedSha256}, archives};
}

export function retainActivationShard(root, directory, stage, bundle, manifest) {
 const check = activationPlan(stage).checks[0];
 const log = logName(stage);
 mkdirSync(directory);
 copyFileSync(manifest, join(directory, "result.json"));
 copyFileSync(join(dirname(manifest), log), join(directory, log));
 if (check.artifacts.length) {
  copyFileSync(join(root, check.artifacts[0].path), join(directory, "installed.json"));
 }
 const {files} = verifyFiles(directory, stage, bundle);
 const report = {format, version:1, stage, inputSha256:bundle.sha256, ...files};
 saveEvidence(join(directory, "activation-shard.json"), report);
 return report;
}

export function verifyActivationShards(directory, bundle) {
 const stages = [];
 let archives;
 for (const stage of activationStageIds) {
  const run = join(directory, activationReportName(stage));
  const report = load(join(run, "activation-shard.json"));
  const actual = verifyFiles(run, stage, bundle);
  assert.deepEqual(report, {format, version:1, stage, inputSha256:bundle.sha256, ...actual.files},
   "Activation report belongs to a different shard or input bundle");
  if (actual.archives) {
   if (archives) assert.deepEqual(actual.archives, archives, "Installed shards used different package archives");
   archives = actual.archives;
  }
  stages.push(report);
 }
 return {
  format:"breditor/activation-qualification", version:1, source:bundle.source,
  inputSha256:bundle.sha256, stages, archives, v1Ready:false,
 };
}
