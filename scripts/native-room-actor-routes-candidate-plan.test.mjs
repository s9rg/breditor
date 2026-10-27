import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
import {nativeRoomExecutionWorkload as prior} from './native-room-execution-workload.mjs';
import {nativeRoomActorRoutesWorkload as work} from './native-room-actor-routes-workload.mjs';
test('actual target routes preserve all previous execution and reconstruction requirements',()=>{
 assert.equal(prior.assertions,224);assert.equal(work.assertions,247);assert.equal(work.priorAssertions+work.newRouteAssertions,work.assertions);
 assert.deepEqual(work.tests,[...prior.tests,'native-actor-routes.test.mjs','native-room-actor-routes-sdk.test.mjs']);assert.deepEqual(work.types,[...prior.types,'types-native-actor-routes.ts']);
 for(const profile of ['functional','full']){const plan=candidateReleasePlan({profile}),find=id=>{const rows=plan.checks.filter(row=>row.id===id);assert.equal(rows.length,1,id);return rows[0];},position=id=>plan.checks.indexOf(find(id));
  for(const[id,script,path]of[['native-room-actor-routes','check-native-room-actor-routes-sdk.mjs','target/native-room-actor-routes-sdk.json'],['installed-native-room-actor-routes','check-native-room-actor-routes-installed.mjs','target/native-room-actor-routes-installed-consumer.json']]){
   assert.deepEqual(find(id).args,['scripts/'+script]);assert.deepEqual(find(id).artifacts,[{path,fresh:true}]);assert.equal(find(id).timeoutMs,7200000);
   for(const dependency of ['rich-browser-build','collaboration-build','native-complete-cohort','native-complete-image-cohort','native-execution','installed-native-execution','native-reconstruction','installed-native-reconstruction','native-room-execution','installed-native-room-execution','native-room-actor-routes-contracts','native-room-actor-routes-type-fence'])assert.ok(position(dependency)<position(id),dependency);
  }
  assert.equal(plan.v1Ready,false);
 }
});
