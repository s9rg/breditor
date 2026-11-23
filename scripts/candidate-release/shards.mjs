/** Qualification ranges and their build dependencies from the full candidate plan. */
const activationHostedBuilds = ["native-suggestion-room-host", "native-handover-activation-host-build"];
const jointHandoverBuilds = [...activationHostedBuilds, "joint-handover-cohort-host"];
const localMetadataBuilds = ["native-suggestion-room-host"];
const localRecoveryBuilds = ["selected-delivery-native-host", ...localMetadataBuilds];
const boundaries = [
 ["native", "independent-native-consumer"],
 ["runtime-packages", "collaboration-build"],
 ["local-history", "installed-flat-local-participant"],
 ["participant-cohorts", "installed-independent-operation-portable"],
 ["restored-history", "installed-reader-runtime"],
 ["record-readers", "installed-fresh-delivery-history"],
 ["owner-lifecycle", "canonical-source-readers"],
 ["managed-sdk", "native-history-read"],
 ["segmented-relay", "shared-asset-archive-history", ["editor-build"]],
 ["participant-recovery", "retained-owner-save-retries", ["editor-build"]],
 ["physical-room-catalogs", "installed-physical-catalog-v3", ["editor-build"]],
 ["physical-operation-custody", "installed-relay-quiescence", [
  "editor-build", "segmented-relay-native-host", "native-room-participant-inventory", "native-server-generation-inventory",
 ]],
 ["selected-delivery", "installed-local-review-restore", ["editor-build", "segmented-retained-native-host"]],
 ["metadata-handover", "installed-handover-native-activation", [
  "editor-build", "segmented-relay-native-host", "segmented-retained-native-host", "selected-delivery-native-host",
 ]],
 ["joint-handover-source", "joint-handover-native", activationHostedBuilds],
 ["joint-handover-installed", "installed-joint-handover", jointHandoverBuilds],
 ["cold-joint-handover-source", "cold-joint-handover-native", jointHandoverBuilds],
 ["cold-joint-handover-installed", "installed-cold-joint-handover", jointHandoverBuilds],
 ["sealed-joint-recovery-source", "sealed-joint-process-recovery-native", jointHandoverBuilds],
 ["sealed-joint-recovery-installed", "installed-sealed-joint-process-recovery", jointHandoverBuilds],
 ["native-suggestion-delivery", "installed-native-suggestion-delivery", ["metadata-native-hosts", "native-suggestion-room-host"]],
 ["native-revision-delivery", "installed-native-revision-delivery", ["metadata-native-hosts", "native-suggestion-room-host"]],
 ["local-metadata-records", "installed-local-metadata-assets-records"],
 ["local-metadata-references", "installed-local-metadata-room-references", localMetadataBuilds],
 ["local-metadata-availability", "installed-local-metadata-availability", localMetadataBuilds],
 ["local-metadata-materialization", "installed-local-metadata-materialization", localRecoveryBuilds],
 ["recoverable-metadata", "installed-recoverable-metadata", localRecoveryBuilds],
 ["metadata-server-bytes", "installed-metadata-server-bytes", localRecoveryBuilds],
];
const sdkPrerequisites = [
 "default-typescript-build",
 "paired-local-runtime",
 "paired-shared-runtime",
 "rich-browser-build",
 "collaboration-build",
];
export const candidateShardIds = Object.freeze(boundaries.map(([id]) => id));

export function candidateShardPlan(plan, id) {
 if (plan.profile !== "full" || !candidateShardIds.includes(id)) {
  throw Error("Choose a known shard of the full candidate profile");
 }
 const endIndexes = boundaries.map(([, end]) => plan.checks.findIndex(check => check.id === end));
 if (endIndexes.some((end, index) => end <= (endIndexes[index - 1] ?? -1))) {
  throw Error("Candidate shard boundaries diverged from the full plan");
 }
 const index = candidateShardIds.indexOf(id);
 const start = (endIndexes[index - 1] ?? -1) + 1;
 const checks = plan.checks.slice(start, endIndexes[index] + 1);
 const prerequisites = index < 2 ? [] : [...sdkPrerequisites, ...(boundaries[index][2] ?? [])];
 const setup = plan.checks.slice(0, start).filter(check => prerequisites.includes(check.id));
 if (setup.length !== prerequisites.length) {
  throw Error("Candidate shard is missing a preceding build prerequisite");
 }
 return {
  ...plan,
  deferred:["full-candidate-qualification"],
  checks:[...setup, ...checks],
  shard:{id, prerequisites:setup.map(check => check.id), stages:checks.map(check => check.id)},
 };
}
