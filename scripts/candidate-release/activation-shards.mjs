/** Select whole-room activation commands and their build prerequisites from the candidate plan. */
import assert from "node:assert/strict";
import {candidateReleasePlan} from "./plan.mjs";

export const activationStageIds = Object.freeze([
 "joint-handover-native",
 "installed-joint-handover",
 "cold-joint-handover-native",
 "installed-cold-joint-handover",
 "sealed-joint-process-recovery-native",
 "installed-sealed-joint-process-recovery",
]);

const buildStageIds = [
 "default-typescript-build",
 "paired-local-runtime",
 "paired-shared-runtime",
 "rich-browser-build",
 "collaboration-build",
 "native-suggestion-room-host",
 "native-handover-activation-host-build",
 "joint-handover-plan-contracts",
 "joint-handover-types",
 "joint-handover-cohort-host",
];

export function activationPlan(stage) {
 const {profile, checks} = candidateReleasePlan({profile:"functional"});
 const ids = stage === "prepare" ? buildStageIds : [stage];
 assert.ok(stage === "prepare" || activationStageIds.includes(stage), "Unknown activation stage");
 const selected = checks.filter(check => ids.includes(check.id));
 assert.deepEqual(selected.map(check => check.id), ids, "Activation stages diverged from the candidate plan");
 return {profile, checks:selected, deferred:[]};
}
