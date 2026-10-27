import test from 'node:test';import assert from 'node:assert/strict';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
import {nativeActorTransferIntrinsicsWorkload as prior} from './native-actor-transfer-intrinsics-workload.mjs';
import {nativeRoomRunWorkload as work} from './native-room-run-workload.mjs';
test('warm mutable execution adds complete target/asset laws without replacing any earlier native reconstruction requirement',()=>{
 assert.equal(prior.assertions,251);assert.equal(work.assertions,267);assert.equal(work.priorAssertions+work.newRunAssertions,work.assertions);
 assert.deepEqual(work.tests,[...prior.tests,'native-room-run-journal-sdk.test.mjs','native-room-run-sdk.test.mjs']);assert.deepEqual(work.types,[...prior.types,'types-native-room-run.ts']);
 for(const profile of ['functional','full']){const plan=candidateReleasePlan({profile}),find=id=>{const matches=plan.checks.filter(row=>row.id===id);assert.equal(matches.length,1,id);return matches[0];},position=id=>plan.checks.indexOf(find(id));
  for(const[id,script,path]of [['native-room-run','check-native-room-run-sdk.mjs','target/native-room-run-sdk.json'],['installed-native-room-run','check-native-room-run-installed.mjs','target/native-room-run-installed-consumer.json']]){
   assert.deepEqual(find(id).args,['scripts/'+script]);assert.deepEqual(find(id).artifacts,[{path,fresh:true}]);assert.equal(find(id).timeoutMs,7200000);
   for(const dependency of ['rich-browser-build','collaboration-build','native-complete-cohort','native-complete-image-cohort','native-execution','installed-native-execution','native-reconstruction','installed-native-reconstruction','native-room-execution','installed-native-room-execution','native-room-actor-routes','installed-native-room-actor-routes','native-actor-transfer-intrinsics','installed-native-actor-transfer-intrinsics','native-room-run-contracts','native-room-run-type-fence'])assert.ok(position(dependency)<position(id),dependency);
  }assert.equal(plan.v1Ready,false);
 }
});
