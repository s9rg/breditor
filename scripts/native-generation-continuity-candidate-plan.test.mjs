
/** Public cold/live source contracts cannot silently disappear from either profile. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
for(const profile of ['functional','full'])test(profile+' requires actual public generation handover and native continuity',()=>{
 const plan=candidateReleasePlan({profile}),ids=plan.checks.map(row=>row.id);
 for(const id of ['native-generation-continuity-plan-contracts','relay-generation-handover-public','relay-serving-epochs-native','relay-serving-epochs-public','relay-native','relay-lint','relay-no-server-lint','relay-docs'])assert.equal(ids.filter(value=>value===id).length,1,id);
 const contract=plan.checks.find(row=>row.id==='native-generation-continuity-plan-contracts');assert.deepEqual(contract.args,['--test','scripts/native-generation-continuity-candidate-plan.test.mjs']);
 const row=plan.checks.find(value=>value.id==='relay-generation-handover-public');assert.deepEqual(row.args.slice(-3),['--test','log_generations','live_handover::']);
 for(const flag of ['--features','server','--locked','--offline','--release'])assert.ok(row.args.includes(flag),flag);
 assert.ok(row.env.CARGO_TARGET_DIR.endsWith('/target/owned-history-relay-native'));assert.equal(plan.v1Ready,false);
});
