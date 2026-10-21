/** Genuine physical continuity and actual provider bytes remain separate mandatory laws. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
for(const profile of ['full','functional'])test(profile+' requires physical provider native and public consumers',()=>{
 const plan=candidateReleasePlan({profile}),ids=plan.checks.map(row=>row.id);
 for(const id of ['physical-host-assets-plan-contracts','relay-physical-host-assets-native','relay-physical-host-assets-public','relay-physical-host-native','relay-physical-host-public','relay-provider-callback-custody','relay-native','relay-no-server-lint','relay-docs'])assert.equal(ids.filter(value=>value===id).length,1,id);
 for(const [id,tail]of [['relay-physical-host-assets-native',['--lib','server::generation_recovery::tests::physical::asset_availability']],['relay-physical-host-assets-public',['--test','log_generations','physical_assets::']]]){
  const row=plan.checks.find(value=>value.id===id);
  assert.deepEqual(row.args.slice(-tail.length),tail);
  for(const flag of ['--features','server','--locked','--offline','--release'])assert.ok(row.args.includes(flag),flag);
  assert.ok(row.env.CARGO_TARGET_DIR.endsWith('/target/owned-history-relay-native'));
 }
 assert.equal(plan.v1Ready,false);
});
