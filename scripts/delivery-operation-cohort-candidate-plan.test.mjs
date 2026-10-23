/** The five-family barrier requires real native, packet, upload and typed-owner tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
test('both candidate profiles require closed five-family custody and preserved standalone domains',()=>{
 for(const profile of ['functional','full']){
  const plan=candidateReleasePlan({profile}),find=id=>{const row=plan.checks.find(r=>r.id===id);assert.ok(row,id);return row;};
  assert.deepEqual(find('delivery-operation-cohort-contracts').args,['--test','scripts/delivery-operation-cohort.test.mjs','scripts/delivery-local-operation-cohort.test.mjs','scripts/native-signal-fence.test.mjs','scripts/delivery-operation-cohort-candidate-plan.test.mjs']);
  assert.ok(find('delivery-operation-cohort-type-fence').args.includes('scripts/fixtures/editor-consumer/types-delivery-operation-cohort.ts'));
  for(const[id,script,artifact]of [['delivery-operation-cohort','check-delivery-operation-cohort-sdk.mjs','target/delivery-operation-cohort-sdk.json'],['installed-delivery-operation-cohort','check-delivery-operation-cohort-installed.mjs','target/delivery-operation-cohort-installed-consumer.json']]){const row=find(id);assert.deepEqual(row.args,['scripts/'+script]);assert.deepEqual(row.artifacts,[{path:artifact,fresh:true}]);assert.ok(row.timeoutMs>=1800000);assert.ok(plan.checks.indexOf(find('collaboration-build'))<plan.checks.indexOf(row));}
  for(const id of ['independent-operation-journal','installed-independent-operation-journal','independent-operation-participant','installed-independent-operation-participant','restored-participant','installed-restored-participant','local-operation-cohort','installed-local-operation-cohort','native-input-cohort','installed-native-input-cohort','physical-catalog-v3','installed-physical-catalog-v3'])find(id);
  assert.equal(plan.v1Ready,false);
 }
});
