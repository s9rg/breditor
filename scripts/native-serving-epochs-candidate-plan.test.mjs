/** Native epoch admission remains mandatory in both candidate profiles. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
for(const profile of ['functional','full'])test(profile+' requires native and external serving-epoch laws',()=>{
 const plan=candidateReleasePlan({profile}),ids=plan.checks.map(row=>row.id);
 for(const id of ['native-serving-epochs-plan-contracts','relay-serving-epochs-native','relay-serving-epochs-public','relay-native','relay-lint','relay-no-server-lint','relay-docs'])assert.equal(ids.filter(value=>value===id).length,1,id);
 const contracts=plan.checks.find(row=>row.id==='native-serving-epochs-plan-contracts');
 assert.deepEqual(contracts.args,['--test','scripts/native-serving-epochs-candidate-plan.test.mjs']);
 for(const [id,tail]of [['relay-serving-epochs-native',['--lib','server::deployment_fence','--','--nocapture']],['relay-serving-epochs-public',['--test','deployment_fence','--','--nocapture']]]){
  const row=plan.checks.find(value=>value.id===id);
  assert.deepEqual(row.args.slice(-tail.length),tail);
  for(const flag of ['--features','server','--locked','--offline','--release'])assert.ok(row.args.includes(flag),flag);
  assert.ok(row.env.CARGO_TARGET_DIR.endsWith('/target/owned-history-relay-native'));
 }
 assert.equal(plan.v1Ready,false);
});
