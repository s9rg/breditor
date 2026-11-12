/** Prepare one shared artifact set, run an exact activation check, or verify all six results. */
import {mkdirSync} from "node:fs";
import {join, resolve} from "node:path";
import {runCandidateChecks} from "./verify-candidate.mjs";
import {repository} from "./candidate-release/plan.mjs";
import {activationPlan, activationStageIds} from "./candidate-release/activation-shards.mjs";
import {
 assertActivationDestination, checkActivationBundle, restoreActivationInputs,
 sealActivationInputs, verifyActivationInputs,
} from "./candidate-release/activation-inputs.mjs";
import {activationReportName, retainActivationShard, verifyActivationShards} from "./candidate-release/activation-results.mjs";
import {saveEvidence} from "./candidate-release/evidence.mjs";

const [mode, ...args] = process.argv.slice(2);
const output = join(repository, "target/v1-candidate-runs");
const controller = new AbortController();
const interrupt = () => controller.abort();

async function main() {
 if (mode === "prepare" && args.length === 0) {
  assertActivationDestination(repository);
  const prepared = await runCandidateChecks(activationPlan("prepare"), {signal:controller.signal});
  if (prepared.exitCode !== 0) return prepared.exitCode;
  const directory = join(repository, "target/activation-qualification-inputs");
  const bundle = sealActivationInputs(repository, directory);
  console.log(JSON.stringify({directory, inputSha256:bundle.sha256}));
  return 0;
 }
 if (mode === "run" && args.length === 2 && activationStageIds.includes(args[0])) {
  const [stage, directory] = args;
  const bundle = restoreActivationInputs(repository, resolve(directory), process.env.BREDITOR_ACTIVATION_INPUT_SHA256);
  const outcome = await runCandidateChecks(activationPlan(stage), {signal:controller.signal});
  if (outcome.exitCode !== 0) return outcome.exitCode;
  verifyActivationInputs(repository, bundle);
  const evidence = join(output, "activation-shards", activationReportName(stage));
  mkdirSync(join(output, "activation-shards"), {recursive:true});
  retainActivationShard(repository, evidence, stage, bundle, outcome.manifest);
  console.log(JSON.stringify({directory:evidence, stage, inputSha256:bundle.sha256}));
  return 0;
 }
 if (mode === "verify" && args.length === 2) {
  const [directory, reports] = args;
  const bundle = checkActivationBundle(repository, resolve(directory), process.env.BREDITOR_ACTIVATION_INPUT_SHA256);
  const result = verifyActivationShards(resolve(reports), bundle);
  mkdirSync(output, {recursive:true});
  const report = join(output, "activation-qualification.json");
  saveEvidence(report, result);
  console.log(JSON.stringify({report, stages:result.stages.length, inputSha256:bundle.sha256}));
  return 0;
 }
 console.error("Usage: qualify-activation-shard.mjs prepare | run <stage> <inputs-directory> | verify <inputs-directory> <reports-directory>");
 return 2;
}

process.once("SIGINT", interrupt);
process.once("SIGTERM", interrupt);
try {
 process.exitCode = await main();
} finally {
 process.removeListener("SIGINT", interrupt);
 process.removeListener("SIGTERM", interrupt);
}
