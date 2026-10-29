/** Real source/target native activation cannot disappear from either profile. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
for(const profile of ['functional','full'])test(profile+' requires native activation laws and public socket continuation',()=>{
 const plan=candidateReleasePlan({profile});
 for(const id of ['native-generation-activation-plan-contracts','relay-native-generation-activation-native','relay-native-generation-activation-public','relay-generation-source-durability-native','relay-generation-handover-public','relay-native','relay-lint','relay-no-server-lint','relay-docs'])assert.equal(plan.checks.filter(row=>row.id===id).length,1,id);
 for(const [id,suffix]of [['relay-native-generation-activation-native',['--lib','native_activation','--','--nocapture']],['relay-native-generation-activation-public',['--test','log_generations','native_activation::','--','--nocapture']]]){
  const row=plan.checks.find(row=>row.id===id);assert.deepEqual(row.args.slice(-suffix.length),suffix);
  for(const flag of ['--features','server','--locked','--offline','--release'])assert.ok(row.args.includes(flag),flag);
  assert.ok(row.env.CARGO_TARGET_DIR.endsWith('/target/owned-history-relay-native'));
 }
 assert.equal(plan.v1Ready,false);
});
