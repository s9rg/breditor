/** Read-only ownership qualifies as a fixed source/package/bundle workload.
 * Existing handoff, seven-writer and old two-writer domains remain mandatory. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateReleasePlan} from './candidate-release/plan.mjs';

test('both candidate profiles require non-consuming native read contracts and installed workflows',()=>{
 for(const profile of ['functional','full']){
  const plan=candidateReleasePlan({profile}),find=id=>{const row=plan.checks.find(row=>row.id===id);assert.ok(row,id);return row;};
  assert.deepEqual(find('operational-native-read-contracts').args,['--test','scripts/operational-read-reservation-development.test.mjs','scripts/operational-read-document-only.test.mjs','scripts/operational-read-upload-custody.test.mjs','scripts/operational-native-read-runtime.test.mjs','scripts/operational-native-read-candidate-plan.test.mjs']);
  assert.ok(find('operational-native-read-type-fence').args.includes('scripts/fixtures/editor-consumer/types-operational-read-development.ts'));
  for(const [id,script,path,timeout]of[
   ['operational-native-read','check-operational-native-read-sdk.mjs','target/native-read-sdk.json',3600000],
   ['installed-operational-native-read','check-operational-native-read-installed.mjs','target/native-read-installed-consumer.json',7200000],
  ]){
   const row=find(id);assert.deepEqual(row.args,['scripts/'+script]);assert.deepEqual(row.artifacts,[{path,fresh:true}]);assert.ok(row.timeoutMs>=timeout);
   for(const dependency of ['collaboration-build','native-complete-cohort','operational-native-read-contracts','operational-native-read-type-fence'])assert.ok(plan.checks.indexOf(find(dependency))<plan.checks.indexOf(row));
  }
  for(const id of ['delivery-operation-cohort-contracts','physical-operation-v3-contracts','physical-operation-v3-seven-room','installed-physical-operation-v3-seven-room','native-server-generation-inventory','native-room-participant-inventory'])find(id);
  assert.equal(plan.v1Ready,false);
 }
});
