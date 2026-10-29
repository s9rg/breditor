/** Actual durable source decisions cannot disappear from either candidate profile. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
for(const profile of ['functional','full'])test(profile+' requires durable source process/fault laws and public offline continuation',()=>{
 const plan=candidateReleasePlan({profile});
 for(const id of ['native-source-handover-durability-plan-contracts','relay-generation-source-durability-native','relay-generation-handover-public','relay-native','relay-lint','relay-no-server-lint','relay-docs'])assert.equal(plan.checks.filter(row=>row.id===id).length,1,id);
 const row=plan.checks.find(row=>row.id==='relay-generation-source-durability-native');
 assert.deepEqual(row.args.slice(-4),['--lib','durable_source_handover','--','--nocapture']);
 for(const flag of ['--features','server','--locked','--offline','--release'])assert.ok(row.args.includes(flag),flag);
 assert.ok(row.env.CARGO_TARGET_DIR.endsWith('/target/owned-history-relay-native'));
 assert.equal(plan.v1Ready,false);
});
