import test from 'node:test';import assert from 'node:assert/strict';import {candidateReleasePlan} from './candidate-release/plan.mjs';
import {nativeRoomRunWorkload as prior} from './native-room-run-workload.mjs';import {nativeRoomPromotionWorkload as work} from './native-room-promotion-workload.mjs';
test('usable local promotion extends staging without waiving any earlier reconstruction or release requirement',()=>{
 assert.equal(prior.assertions,267);assert.equal(work.assertions,276);assert.equal(work.priorAssertions+work.newPromotionAssertions,work.assertions);
 assert.deepEqual(work.tests,[...prior.tests,'native-room-promotion-recipient.test.mjs','native-room-promotion-sdk.test.mjs']);assert.deepEqual(work.types,[...prior.types,'types-native-room-promotion.ts']);
 for(const profile of ['functional','full']){const plan=candidateReleasePlan({profile}),find=id=>{const rows=plan.checks.filter(row=>row.id===id);assert.equal(rows.length,1,id);return rows[0];},position=id=>plan.checks.indexOf(find(id));
  for(const[id,script,path]of [['native-room-promotion','check-native-room-promotion-sdk.mjs','target/native-room-promotion-sdk.json'],['installed-native-room-promotion','check-native-room-promotion-installed.mjs','target/native-room-promotion-installed-consumer.json']]){
   assert.deepEqual(find(id).args,['scripts/'+script]);assert.deepEqual(find(id).artifacts,[{path,fresh:true}]);assert.equal(find(id).timeoutMs,7200000);
   for(const dependency of ['rich-browser-build','collaboration-build','native-complete-cohort','native-complete-image-cohort','native-execution','installed-native-execution','native-reconstruction','installed-native-reconstruction','native-room-execution','installed-native-room-execution','native-room-actor-routes','installed-native-room-actor-routes','native-actor-transfer-intrinsics','installed-native-actor-transfer-intrinsics','native-room-run','installed-native-room-run','native-room-promotion-contracts','native-room-promotion-type-fence'])assert.ok(position(dependency)<position(id),dependency);
  }assert.equal(plan.v1Ready,false);
 }
});
