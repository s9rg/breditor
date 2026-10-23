/** Every profile retains real legacy laws, distinct provider types and full fixed probes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
test('both candidate profiles require genuine three-family ownership and unchanged legacy native domains',()=>{
 for(const profile of ['functional','full']){
  const plan=candidateReleasePlan({profile}),find=id=>{const row=plan.checks.find(r=>r.id===id);assert.ok(row,id);return row;};
  assert.deepEqual(find('local-operation-cohort-contracts').args,['--test','scripts/local-operation-cohort.test.mjs','scripts/local-operation-publication.test.mjs','scripts/local-operation-cohort-candidate-plan.test.mjs']);
  assert.ok(find('local-operation-cohort-type-fence').args.includes('scripts/fixtures/editor-consumer/types-local-operation-cohort.ts'));
  for(const[id,script,artifact]of [['local-operation-cohort','check-local-operation-cohort-sdk.mjs','target/local-operation-cohort-sdk.json'],['installed-local-operation-cohort','check-local-operation-cohort-installed.mjs','target/local-operation-cohort-installed-consumer.json']]){
   const row=find(id);assert.deepEqual(row.args,['scripts/'+script]);assert.deepEqual(row.artifacts,[{path:artifact,fresh:true}]);assert.ok(row.timeoutMs>=1800000);assert.ok(plan.checks.indexOf(find('collaboration-build'))<plan.checks.indexOf(row));
  }
  for(const id of ['independent-local-journal','installed-independent-local-journal','independent-local-operation-participant','installed-independent-local-operation-participant','native-input-cohort','installed-native-input-cohort','native-input-incoming-source','installed-native-input-incoming-source','physical-catalog-v3','installed-physical-catalog-v3'])find(id);
  assert.equal(plan.v1Ready,false);
 }
});
