import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
import {nativeRoomActorRoutesWorkload as prior} from './native-room-actor-routes-workload.mjs';
import {nativeActorTransferIntrinsicsWorkload as work} from './native-actor-transfer-intrinsics-workload.mjs';
test('canonical source transfer preserves every previous target and reconstruction requirement',()=>{
 assert.equal(prior.assertions,247);assert.equal(work.assertions,251);assert.equal(work.priorAssertions+work.newTransferAssertions,work.assertions);
 assert.deepEqual(work.tests,[...prior.tests,'native-actor-transfer-intrinsics.test.mjs','native-actor-transfer-retirement-sdk.test.mjs']);assert.deepEqual(work.types,prior.types);
 for(const profile of ['functional','full']){const plan=candidateReleasePlan({profile}),find=id=>{const rows=plan.checks.filter(row=>row.id===id);assert.equal(rows.length,1,id);return rows[0];},position=id=>plan.checks.indexOf(find(id));
  for(const[id,script,path]of[['native-actor-transfer-intrinsics','check-native-actor-transfer-intrinsics-sdk.mjs','target/native-actor-transfer-intrinsics-sdk.json'],['installed-native-actor-transfer-intrinsics','check-native-actor-transfer-intrinsics-installed.mjs','target/native-actor-transfer-intrinsics-installed-consumer.json']]){
   assert.deepEqual(find(id).args,['scripts/'+script]);assert.deepEqual(find(id).artifacts,[{path,fresh:true}]);assert.equal(find(id).timeoutMs,7200000);
   for(const dependency of ['rich-browser-build','collaboration-build','native-complete-cohort','native-complete-image-cohort','native-execution','installed-native-execution','native-reconstruction','installed-native-reconstruction','native-room-execution','installed-native-room-execution','native-room-actor-routes','installed-native-room-actor-routes','native-actor-transfer-intrinsics-contracts','native-actor-transfer-intrinsics-type-fence'])assert.ok(position(dependency)<position(id),dependency);
  }
  assert.equal(plan.v1Ready,false);
 }
});
