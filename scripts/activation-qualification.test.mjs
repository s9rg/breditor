import assert from "node:assert/strict";
import {execFileSync, spawnSync} from "node:child_process";
import {
 chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync,
} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import test from "node:test";
import {candidateReleasePlan} from "./candidate-release/plan.mjs";
import {activationPlan, activationStageIds} from "./candidate-release/activation-shards.mjs";
import {
 checkActivationBundle, restoreActivationInputs, sealActivationInputs, verifyActivationInputs,
} from "./candidate-release/activation-inputs.mjs";
import {activationReportName, retainActivationShard, verifyActivationShards} from "./candidate-release/activation-results.mjs";
import {fileEvidence, saveEvidence, sourceEvidence} from "./candidate-release/evidence.mjs";
import {runCandidateChecks} from "./verify-candidate.mjs";

const handoverHost = "target/handover-activation-native/release/examples/native_handover_activation_sdk_functional";
const handoverReport = "target/handover-native-activation-native-build.json";
const wasm = "target/promoted-shared-web/breditor_shared_bg.wasm";
const hostInputs = [
 handoverHost,
 "target/owned-history-relay-native/release/examples/complete_cohort_control_functional",
 "target/owned-history-relay-native/release/examples/selected_suggestion_delivery_functional",
];
const packageNames = ["@breditor/browser", "@breditor/collaboration", "@breditor/experimental-rich-content"];
const write = (root, name, bytes) => {
 const path = join(root, name);
 mkdirSync(dirname(path), {recursive:true});
 writeFileSync(path, bytes);
};
const git = (cwd, ...args) => execFileSync("git", args, {cwd, stdio:"pipe"});

function fixture(t) {
 const directory = mkdtempSync(join(realpathSync(tmpdir()), "breditor-activation-qualification-"));
 t.after(() => rmSync(directory, {recursive:true, force:true}));
 const root = join(directory, "producer");
 const worker = join(directory, "worker");
 const bundleDirectory = join(directory, "bundle");
 mkdirSync(root);
 git(root, "init", "--quiet");
 write(root, ".gitignore", "target/\npackages/**/dist/\n");
 write(root, "source", "fixed tracked source");
 git(root, "add", ".");
 git(root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "--no-gpg-sign", "-m", "Fixture");
 git(directory, "clone", "--quiet", root, worker);
 for (const name of packageNames) write(root, "packages/breditor-" + name.split("/")[1] + "/dist/index.js", name);
 write(root, wasm, "Wasm bytes");
 write(root, "target/promoted-shared-web/breditor_dependency_inventory.json", "{}");
 for (const path of hostInputs) write(root, path, path);
 saveEvidence(join(root, handoverReport), {
  format:"breditor/handover-native-activation-native-build",
  source:sourceEvidence(root), complete:true, sourceUnchanged:true, exitCode:0,
  binaries:[fileEvidence(root, handoverHost)],
 });
 return {root, worker, directory, bundleDirectory};
}

test("the matrix uses exact existing stages and a shared producer receipt", () => {
 for (const profile of ["functional", "full"]) {
  const checks = candidateReleasePlan({profile}).checks;
  for (const stage of activationStageIds) {
   const [check] = activationPlan(stage).checks;
   const existing = checks.find(item => item.id === stage);
   assert.deepEqual(check, existing);
   assert.ok(check.timeoutMs < 300 * 60000);
  }
 }
 assert.throws(() => activationPlan("readiness"), /Unknown activation stage/);
 const workflow = JSON.parse(readFileSync(new URL("../.github/workflows/activation-qualification.yml", import.meta.url)));
 assert.deepEqual(workflow.on, {workflow_dispatch:{}});
 assert.deepEqual(workflow.permissions, {contents:"read"});
 const {prepare, check, verify} = workflow.jobs;
 assert.deepEqual(check.strategy, {"fail-fast":false, matrix:{stage:activationStageIds}});
 assert.equal(check.needs, "prepare");
 assert.deepEqual(verify.needs, ["prepare", "check"]);
 assert.ok(prepare.outputs.input_sha256);
 for (const job of [prepare, check, verify]) {
  for (const step of job.steps) {
   if (step.uses) assert.match(step.uses, /@[a-f0-9]{40}$/);
   if (step.run) assert.equal(spawnSync("bash", ["-n"], {input:step.run}).status, 0);
   if (step.run?.includes("qualify-activation-shard.mjs run") || step.run?.includes("qualify-activation-shard.mjs verify")) {
    assert.equal(step.env.BREDITOR_ACTIVATION_INPUT_SHA256, "${{ needs.prepare.outputs.input_sha256 }}");
   }
  }
 }
});

test("same-source restore checks bytes, restores executable bits and refuses existing outputs", t => {
 const {root, worker, bundleDirectory} = fixture(t);
 const bundle = sealActivationInputs(root, bundleDirectory);
 // Artifact transfer retains bytes but may reset permissions.
 chmodSync(join(bundleDirectory, handoverHost), 0o644);
 assert.throws(() => restoreActivationInputs(worker, bundleDirectory, "0".repeat(64)), /producer's receipt/);
 assert.equal(existsSync(join(worker, "target")), false);
 assert.deepEqual(restoreActivationInputs(worker, bundleDirectory, bundle.sha256), bundle);
 verifyActivationInputs(worker, bundle);
 assert.throws(() => restoreActivationInputs(worker, bundleDirectory), /Refusing to replace/);
 write(worker, wasm, "changed by a worker");
 assert.throws(() => verifyActivationInputs(worker, bundle), /changed during qualification/);
});

test("a different candidate or altered bundle cannot seed a worker", t => {
 const {root, worker, bundleDirectory} = fixture(t);
 const bundle = sealActivationInputs(root, bundleDirectory);
 write(worker, "source", "different tracked source");
 git(worker, "add", "source");
 git(worker, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "--no-gpg-sign", "-m", "Changed");
 assert.throws(() => checkActivationBundle(worker, bundleDirectory), /another candidate/);
 write(bundleDirectory, wasm, "modified in transit");
 assert.throws(() => checkActivationBundle(root, bundleDirectory, bundle.sha256), /differs from its manifest/);
 rmSync(join(bundleDirectory, wasm));
 symlinkSync(join(root, wasm), join(bundleDirectory, wasm));
 assert.throws(() => checkActivationBundle(root, bundleDirectory), /symlinks/);
});

test("aggregation requires six matching results and checks retained logs and package identity", async t => {
 const {root, directory, bundleDirectory} = fixture(t);
 const bundle = sealActivationInputs(root, bundleDirectory);
 const reports = join(directory, "reports");
 mkdirSync(reports);
 const sourceLog = "# tests 22\n# pass 22\n# fail 0\n# cancelled 0\n# skipped 0\n";
 const installedRuntime = bundle.files.filter(file => file.path.startsWith("target/") && file.path !== handoverReport);
 const archives = packageNames.map(name => ({name, sha256:"a".repeat(64)}));
 const reportDirectory = stage => join(reports, activationReportName(stage));
 async function retain(stage, selectedArchives = archives) {
  const outcome = await runCandidateChecks(activationPlan(stage), {
   root, report:() => {}, execute:async (check, {logPath}) => {
    writeFileSync(logPath, sourceLog);
    for (const {path} of check.artifacts) saveEvidence(join(root, path), {
     source:bundle.source, complete:true, passed:true, sourceUnchanged:true, wholeRoomActivated:true,
     workspaceLinks:false, cases:22, logSha256:"c".repeat(64), runtime:installedRuntime,
     archives:selectedArchives,
    });
    return {status:"passed", exitCode:0, signal:null};
   },
  });
  assert.equal(outcome.exitCode, 0);
  retainActivationShard(root, reportDirectory(stage), stage, bundle, outcome.manifest);
 }
 for (const stage of activationStageIds.slice(0, -1)) await retain(stage);
 assert.throws(() => verifyActivationShards(reports, bundle), /ENOENT/);
 const last = activationStageIds.at(-1);
 await retain(last, archives.map(row => ({...row, sha256:"b".repeat(64)})));
 assert.throws(() => verifyActivationShards(reports, bundle), /different package archives/);
 rmSync(reportDirectory(last), {recursive:true});
 await retain(last);
 const result = verifyActivationShards(reports, bundle);
 assert.equal(result.v1Ready, false);
 assert.deepEqual(result.stages.map(row => row.stage), activationStageIds);
 assert.throws(() => verifyActivationShards(reports, {...bundle, sha256:"0".repeat(64)}), /different shard or input bundle/);
 write(reportDirectory(last), "01-" + last + ".log", "changed log");
 assert.throws(() => verifyActivationShards(reports, bundle), /shard log changed/);
});
