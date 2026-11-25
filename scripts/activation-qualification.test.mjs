import assert from "node:assert/strict";
import {execFileSync, spawnSync} from "node:child_process";
import {
 chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync,
} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import test from "node:test";
import {fileURLToPath, pathToFileURL} from "node:url";
import {candidateReleasePlan} from "./candidate-release/plan.mjs";
import {activationPlan, activationStageIds} from "./candidate-release/activation-shards.mjs";
import {
 activationBuildReports, checkActivationBundle, restoreActivationInputs, sealActivationInputs, verifyActivationInputs,
} from "./candidate-release/activation-inputs.mjs";
import {copySharedRuntimeForActivation, retainSharedRuntimeBuild, sharedRuntimeBuildReport, verifyInstalledSharedRuntime, verifySharedRuntimeBuild} from "./candidate-release/shared-runtime-evidence.mjs";
import {nativeSuggestionBuildReport, nativeSuggestionExecutable, retainNativeSuggestionBuild, verifyNativeSuggestionBuild} from "./candidate-release/native-suggestion-build-evidence.mjs";
import {metadataFixtureEvidence, metadataFixtureStageIds} from "./candidate-release/metadata-fixture-evidence.mjs";
import {sharedRuntimeReceiptVariable} from "./fixtures/native-runtime/shared-runtime-receipt.mjs";
import {activationReportName, retainActivationShard, verifyActivationShards} from "./candidate-release/activation-results.mjs";
import {fileEvidence, saveEvidence, sourceEvidence} from "./candidate-release/evidence.mjs";
import {runCandidateChecks} from "./verify-candidate.mjs";
import {candidateCoverage} from "./check-candidate-coverage.mjs";

const handoverHost = "target/handover-activation-native/release/examples/native_handover_activation_sdk_functional";
const handoverReport = "target/handover-native-activation-native-build.json";
const wasm = "target/promoted-shared-web/breditor_shared_bg.wasm";
const hostInputs = [
 handoverHost,
 "target/owned-history-relay-native/release/examples/complete_cohort_control_functional",
 nativeSuggestionExecutable,
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
 for (const [name, bytes] of [
  ["breditor_shared_bg.wasm", "Wasm bytes"], ["breditor_shared.js", "Wasm glue"],
  ["breditor_shared.d.ts", "shared declarations"], ["breditor_shared_bg.wasm.d.ts", "Wasm declarations"],
 ]) {
  write(root, "target/promoted-shared-web/" + name, bytes);
  write(root, "packages/breditor-collaboration/dist/runtime/" + name, bytes);
 }
 write(root, "target/promoted-shared-web/breditor_dependency_inventory.json", "{}");
 for (const path of hostInputs) {
  write(root, path, path);
  chmodSync(join(root, path), 0o755);
 }
 saveEvidence(join(root, handoverReport), {
  format:"breditor/handover-native-activation-native-build",
  source:sourceEvidence(root), complete:true, sourceUnchanged:true, exitCode:0,
  binaries:[fileEvidence(root, handoverHost)],
 });
 retainSharedRuntimeBuild(root, sourceEvidence(root));
 retainNativeSuggestionBuild(root, sourceEvidence(root), join(root, nativeSuggestionExecutable));
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
 chmodSync(join(bundleDirectory, nativeSuggestionExecutable), 0o644);
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

test("shared runtime build evidence binds the generated and packaged bytes to the source", t => {
 const {root, worker, bundleDirectory} = fixture(t);
 const source = sourceEvidence(root);
 assert.equal(verifySharedRuntimeBuild(root, source).files.length, 4);
 const original = JSON.parse(readFileSync(join(root, sharedRuntimeBuildReport)));
 saveEvidence(join(root, sharedRuntimeBuildReport), {...original, source:{...source, commit:"0".repeat(40)}});
 assert.throws(() => sealActivationInputs(root, bundleDirectory), /another candidate/);
 saveEvidence(join(root, sharedRuntimeBuildReport), original);
 write(root, "packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm", "different paired bytes");
 assert.throws(() => sealActivationInputs(root, bundleDirectory), /Packaged shared runtime differs/);
 assert.equal(existsSync(bundleDirectory), false);
 assert.equal(existsSync(join(worker, "target")), false);
});

test("both candidate profiles place the Native receipt build before metadata consumers", () => {
 for (const profile of ["functional", "full"]) {
  const {checks} = candidateReleasePlan({profile});
  const host = checks.findIndex(stage => stage.id === "native-suggestion-room-host");
  assert.ok(host > 0);
  assert.deepEqual(checks[host].args, ["scripts/build-native-suggestion-room-host.mjs", "selected_suggestion_delivery_functional"]);
  assert.ok(checks[host].artifacts.some(artifact => artifact.path === nativeSuggestionBuildReport && artifact.fresh));
  for (const stage of metadataFixtureStageIds) assert.ok(checks.findIndex(check => check.id === stage) > host, stage);
 }
});

test("metadata fixtures refuse a stale Native receipt, a replaced binary and a partial receipt pair", t => {
 const {root, directory} = fixture(t);
 const source = sourceEvidence(root);
 const native = verifyNativeSuggestionBuild(root, source);
 const receipt = join(root, nativeSuggestionBuildReport);
 const original = JSON.parse(readFileSync(receipt));
 const consumer = join(directory, "metadata-consumer");
 mkdirSync(consumer);
 const evidence = metadataFixtureEvidence(root, source, consumer);
 assert.equal(evidence.nativeHostSha256, native.binary.sha256);
 assert.equal(evidence.nativeHostBuildReceiptSha256, native.sha256);
 saveEvidence(receipt, {...original, source:{...source, commit:"0".repeat(40)}});
 assert.throws(() => metadataFixtureEvidence(root, source), /another candidate/);
 saveEvidence(receipt, original);
 const binary = join(root, nativeSuggestionExecutable);
 writeFileSync(binary, "another executable");
 assert.throws(() => metadataFixtureEvidence(root, source), /executable differs/);
 writeFileSync(binary, nativeSuggestionExecutable);
 rmSync(receipt);
 assert.throws(() => metadataFixtureEvidence(root, source), /ENOENT/);
});

test("an independent fixture uses only the copied receipt pinned by its launcher", t => {
 const {root, directory} = fixture(t);
 const consumer = join(directory, "consumer");
 mkdirSync(consumer);
 const source = sourceEvidence(root), runtime = copySharedRuntimeForActivation(root, consumer, source);
 const installed = "node_modules/@breditor/collaboration/dist/runtime";
 for (const {name} of verifySharedRuntimeBuild(root, source).files) {
  write(consumer, installed + "/" + name, readFileSync(join(root, "target/promoted-shared-web", name)));
 }
 assert.equal(verifyInstalledSharedRuntime(consumer, installed, source, runtime), runtime.wasmSha256);
 write(consumer, installed + "/breditor_shared.js", "modified installed glue");
 assert.throws(() => verifyInstalledSharedRuntime(consumer, installed, source, runtime), /breditor_shared\.js/);
 for (const file of ["normal-shared-identity.mjs", "shared-runtime-receipt.mjs"]) {
  const relative = "scripts/fixtures/native-runtime/" + file;
  write(consumer, relative, readFileSync(new URL("../" + relative, import.meta.url)));
 }
 const module = pathToFileURL(join(consumer, "scripts/fixtures/native-runtime/normal-shared-identity.mjs")).href;
 const run = environment => spawnSync(process.execPath, ["--input-type=module", "-e",
  `import {NORMAL_SHARED_WASM_SHA256} from ${JSON.stringify(module)}; console.log(NORMAL_SHARED_WASM_SHA256);`],
 {cwd:consumer, env:{...process.env,...environment}, encoding:"utf8"});
 const pinned = run(runtime.environment);
 assert.equal(pinned.status, 0, pinned.stderr);
 assert.equal(pinned.stdout.trim(), runtime.wasmSha256);
 const foreign = run({[sharedRuntimeReceiptVariable]:"0".repeat(64)});
 assert.equal(foreign.status, 1);
 assert.match(foreign.stderr, /receipt differs from the verified build/);
 const receipt = join(consumer, sharedRuntimeBuildReport);
 writeFileSync(receipt, readFileSync(receipt, "utf8") + "\n");
 const changed = run(runtime.environment);
 assert.equal(changed.status, 1);
 assert.match(changed.stderr, /receipt differs from the verified build/);
});

test("shared-runtime-only stages pin the build and refuse a replacement without a Native receipt", async t => {
 const {root} = fixture(t);
 const source = sourceEvidence(root);
 rmSync(join(root, nativeSuggestionBuildReport));
 const receipt = fileEvidence(root, sharedRuntimeBuildReport).sha256;
 const plan = {profile:"functional", deferred:[], checks:[{
  id:"version-delivery-fixture", command:process.execPath, args:[], env:{}, artifacts:[], timeoutMs:1000,
  requiresSharedRuntime:true,
 }]};
 const run = replace => runCandidateChecks(plan, {
  root, report(){},
  async execute(check,{logPath}){
   assert.equal(check.env[sharedRuntimeReceiptVariable],receipt);
   writeFileSync(logPath,"completed fixture");
   if(replace){
    write(root,wasm,"replacement Wasm");
    write(root,"packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm","replacement Wasm");
    retainSharedRuntimeBuild(root,source);
   }
   return {status:"passed",exitCode:0,signal:null};
  },
 });
 const valid = await run(false);
 assert.equal(valid.exitCode,0);
 assert.equal(valid.result.stages[0].sharedRuntimeReceiptSha256,receipt);
 assert.equal(valid.result.stages[0].nativeHostBuildReceiptSha256,undefined);
 const replaced = await run(true);
 assert.equal(replaced.exitCode,1);
 assert.match(replaced.result.error,/Shared runtime build receipt changed during qualification/);
});

test("aggregation requires six matching results and checks retained logs and package identity", async t => {
 const {root, worker, directory, bundleDirectory} = fixture(t);
 const bundle = sealActivationInputs(root, bundleDirectory);
 const reports = join(directory, "reports");
 mkdirSync(reports);
 const sourceLog = "# tests 22\n# pass 22\n# fail 0\n# cancelled 0\n# skipped 0\n";
 const installedRuntime = bundle.files.filter(file => file.path.startsWith("target/") && !activationBuildReports.includes(file.path));
 const archives = packageNames.map(name => ({name, sha256:"a".repeat(64)}));
 const reportDirectory = stage => join(reports, activationReportName(stage));
 async function retain(stage, selectedArchives = archives) {
  const outcome = await runCandidateChecks(activationPlan(stage), {
   root, report:() => {}, execute:async (check, {logPath}) => {
    writeFileSync(logPath, sourceLog);
    for (const {path} of check.artifacts) {
     const report = join(root, path);
     saveEvidence(report, {
      source:bundle.source, complete:true, passed:true, sourceUnchanged:true, wholeRoomActivated:true,
      workspaceLinks:false, cases:22, logSha256:"c".repeat(64), runtime:installedRuntime,
      sharedRuntimeReceiptSha256:check.env[sharedRuntimeReceiptVariable],
      nativeHostBuildReceiptSha256:verifyNativeSuggestionBuild(root, bundle.source).sha256,
      archives:selectedArchives,
     });
     // This immediate synthetic write can share a coarse filesystem clock tick with stage startup.
     const fresh = new Date(Date.now() + 2000);
     utimesSync(report, fresh, fresh);
    }
    return {status:"passed", exitCode:0, signal:null};
   },
  });
  assert.equal(outcome.exitCode, 0, outcome.result.error);
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

 restoreActivationInputs(worker, bundleDirectory, bundle.sha256);
 const localReport = join(worker, handoverReport);
 const rebuilt = JSON.parse(readFileSync(localReport));
 saveEvidence(localReport, {...rebuilt, finishedAt:"a different producer build time"});
 const ordinary = id => ({id, command:process.execPath, args:[], env:{}, artifacts:[], timeoutMs:2000});
 const plan = {
  profile:"full", deferred:[], checks:[ordinary("before-activation"),
   ...activationStageIds.map(id => activationPlan(id).checks[0]), ordinary("after-activation")],
 };
 const executed = [];
 const options = {
  root:worker, report:() => {}, activationEvidence:{inputs:bundleDirectory, reports, inputSha256:bundle.sha256},
  execute:async (check, {logPath}) => {
   executed.push(check.id);
   writeFileSync(logPath, "ordinary check\n");
   return {status:"passed", exitCode:0, signal:null};
  },
 };
 const candidate = await runCandidateChecks(plan, options);
 assert.equal(candidate.exitCode, 0);
 assert.deepEqual(executed, ["before-activation", "after-activation"]);
 assert.deepEqual(candidate.result.stages.map(stage => stage.id), plan.checks.map(stage => stage.id));
 assert.deepEqual(candidate.result.stages.filter(stage => stage.execution === "activation-shard").map(stage => stage.id), activationStageIds);
 assert.equal(candidate.result.v1Ready, false);
 assert.ok(candidate.result.activationQualification.sha256);
 assert.equal(candidate.result.stages.find(stage => stage.id === last).artifacts.length, 1);
 assert.throws(()=>candidateCoverage(worker,[candidate.manifest]),/Review adopted workers with qualify-activation-shard verify/);

 write(worker, wasm, "changed by local build");
 write(worker, "packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm", "changed by local build");
 retainSharedRuntimeBuild(worker, sourceEvidence(worker));
 executed.length = 0;
 const mismatch = await runCandidateChecks(plan, options);
 assert.equal(mismatch.exitCode, 1);
 assert.match(mismatch.result.error, /Candidate build differs/);
 assert.deepEqual(executed, ["before-activation"]);
 assert.equal(mismatch.result.stages.at(-1).id, activationStageIds[0]);

 write(reportDirectory(last), "01-" + last + ".log", "changed log");
 assert.throws(() => verifyActivationShards(reports, bundle), /shard log changed/);
 executed.length = 0;
 const invalid = await runCandidateChecks(plan, options);
 assert.equal(invalid.exitCode, 1);
 assert.match(invalid.result.error, /shard log changed/);
 assert.deepEqual(executed, []);
});

test("candidate CLI requires both evidence paths and keeps the full stage list", () => {
 const script = fileURLToPath(new URL("./verify-candidate.mjs", import.meta.url));
 const args = [script, "--functional", "--dry-run", "--activation-evidence"];
 const invalid = spawnSync(process.execPath, [...args, "inputs"], {encoding:"utf8"});
 assert.equal(invalid.status, 2);
 const planned = spawnSync(process.execPath, [...args, "inputs", "reports"], {encoding:"utf8", maxBuffer:8 * 1024 * 1024});
 assert.equal(planned.status, 0, planned.stderr);
 const plan = JSON.parse(planned.stdout);
 assert.equal(plan.executed, false);
 assert.equal(plan.activationEvidence.inputs, "inputs");
 assert.equal(plan.activationEvidence.reports, "reports");
 assert.deepEqual(plan.checks.map(stage => stage.id), candidateReleasePlan({profile:"functional"}).checks.map(stage => stage.id));
});
