/** Early qualification ranges and their build dependencies from the full candidate plan. */
const boundaries = [
 ["native", "independent-native-consumer"],
 ["runtime-packages", "collaboration-build"],
 ["local-history", "installed-flat-local-participant"],
 ["participant-cohorts", "installed-independent-operation-portable"],
 ["restored-history", "installed-reader-runtime"],
 ["record-readers", "installed-fresh-delivery-history"],
 ["owner-lifecycle", "canonical-source-readers"],
 ["managed-sdk", "native-history-read"],
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
 const setup = index < 2 ? [] : plan.checks.slice(0, start).filter(check => sdkPrerequisites.includes(check.id));
 if (index >= 2 && (setup.length !== sdkPrerequisites.length ||
     setup.some((check, position) => check.id !== sdkPrerequisites[position]))) {
  throw Error("Candidate shard is missing a preceding SDK build");
 }
 return {
  ...plan,
  deferred:["full-candidate-qualification"],
  checks:[...setup, ...checks],
  shard:{id, prerequisites:setup.map(check => check.id), stages:checks.map(check => check.id)},
 };
}
