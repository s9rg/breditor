/** Carry verified activation workers into a candidate run without changing its stage order. */
import assert from "node:assert/strict";
import {copyFileSync, mkdirSync} from "node:fs";
import {join, relative, resolve} from "node:path";
import {fileEvidence, saveEvidence} from "./evidence.mjs";
import {checkActivationBundle, verifyCandidateActivationBuild} from "./activation-inputs.mjs";
import {activationReportName, verifyActivationShards} from "./activation-results.mjs";
import {activationPlan, activationStageIds} from "./activation-shards.mjs";

export function retainCandidateActivationEvidence(root, directory, plan, {inputs, reports, inputSha256}) {
 for (const id of activationStageIds) {
  const check = plan.checks.find(stage => stage.id === id);
  const [original] = activationPlan(id).checks;
  assert.ok(check, "Candidate plan is missing activation stage " + id);
  assert.deepEqual(check.args, original.args);
  assert.deepEqual(check.artifacts, original.artifacts);
 }
 const bundle = checkActivationBundle(root, resolve(inputs), inputSha256);
 const expected = verifyActivationShards(resolve(reports), bundle);
 const retained = join(directory, "activation-evidence");
 mkdirSync(retained);
 copyFileSync(join(resolve(inputs), "inputs.json"), join(retained, "inputs.json"));
 assert.equal(fileEvidence(retained, "inputs.json").sha256, bundle.sha256);
 for (const {stage, installedSha256} of expected.stages) {
  const name = activationReportName(stage);
  const destination = join(retained, name);
  mkdirSync(destination);
  const files = ["result.json", "activation-shard.json", "01-" + stage + ".log"];
  if (installedSha256) files.push("installed.json");
  for (const file of files) copyFileSync(join(resolve(reports), name, file), join(destination, file));
 }
 const verified = verifyActivationShards(retained, bundle);
 assert.deepEqual(verified, expected);
 const qualification = join(retained, "activation-qualification.json");
 saveEvidence(qualification, verified);
 const stages = new Map(verified.stages.map(row => [row.stage, row]));
 const evidence = path => fileEvidence(root, relative(root, path));
 let checkedBuild = false;
 return {
  qualification:evidence(qualification),
  entry(check) {
   const proof = stages.get(check.id);
   if (!proof) return undefined;
   if (!checkedBuild) {
    verifyCandidateActivationBuild(root, bundle);
    checkedBuild = true;
   }
   const work = join(retained, activationReportName(check.id));
   const logPath = join(work, "01-" + check.id + ".log");
   const log = evidence(logPath);
   assert.equal(log.sha256, proof.logSha256, "Retained activation log changed");
   const artifacts = [];
   if (proof.installedSha256) {
    const installed = evidence(join(work, "installed.json"));
    assert.equal(installed.sha256, proof.installedSha256, "Retained installed activation report changed");
    artifacts.push(installed);
   }
   return {status:"passed", execution:"activation-shard", worker:proof, logPath, log, artifacts,
    finishedAt:new Date().toISOString()};
  },
 };
}
