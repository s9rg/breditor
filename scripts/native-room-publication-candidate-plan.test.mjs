/** Publication and actual connection drainage remain mandatory in both candidates. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
for(const profile of ['functional','full'])test(profile+' requires real Native publication and cleanup checks',()=>{
 const plan=candidateReleasePlan({profile});
 for(const id of ['native-room-publication-plan-contracts','relay-native-room-publication-native','relay-durable-native-activation-native','relay-native','relay-lint','relay-docs'])assert.equal(plan.checks.filter(row=>row.id===id).length,1,id);
 const row=plan.checks.find(row=>row.id==='relay-native-room-publication-native');
 const suffix=['--lib','native_publication','--','--test-threads=2'];assert.deepEqual(row.args.slice(-suffix.length),suffix);
 for(const flag of ['--features','server','--locked','--offline','--release'])assert.ok(row.args.includes(flag),flag);
 assert.ok(row.env.CARGO_TARGET_DIR.endsWith('/target/owned-history-relay-native'));
 assert.ok(plan.checks.findIndex(row=>row.id==='relay-native-room-publication-native')>plan.checks.findIndex(row=>row.id==='relay-durable-native-activation-native'));
 assert.equal(plan.v1Ready,false);
});
