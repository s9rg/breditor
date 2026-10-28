/** The standalone generation family requires genuine native AND exported consumer verification. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
for(const profile of ['full','functional'])test(profile+' requires standalone generation provider native and public consumers',()=>{
 const plan=candidateReleasePlan({profile}),ids=plan.checks.map(row=>row.id);
 for(const id of ['server-generation-assets-plan-contracts','relay-server-generation-assets-native','relay-server-generation-assets-public','physical-host-assets-plan-contracts','relay-physical-host-assets-native','relay-physical-host-assets-public','relay-native','relay-no-server-lint','relay-docs'])assert.equal(ids.filter(value=>value===id).length,1,id);
 for(const [id,tail]of [['relay-server-generation-assets-native',['--lib','generation_assets']],['relay-server-generation-assets-public',['--test','log_generations','generation_assets::']]]){
  const row=plan.checks.find(value=>value.id===id);assert.deepEqual(row.args.slice(-tail.length),tail);
  for(const flag of ['--features','server','--locked','--offline','--release'])assert.ok(row.args.includes(flag),flag);
  assert.ok(row.env.CARGO_TARGET_DIR.endsWith('/target/owned-history-relay-native'));
 }
 assert.equal(plan.v1Ready,false);
});
