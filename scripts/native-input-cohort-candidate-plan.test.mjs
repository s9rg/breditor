/** No ready-shaped replacement or small probe may replace actual parent laws. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
test('both candidate profiles require genuine cohort laws, private policy types and fixed source/installed/bundle workloads',()=>{
 for(const profile of ['functional','full']){
  const plan=candidateReleasePlan({profile}),find=id=>{const row=plan.checks.find(r=>r.id===id);assert.ok(row,id);return row;};
  assert.deepEqual(find('native-input-cohort-contracts').args,['--test','scripts/native-input-cohort.test.mjs','scripts/native-input-cohort-shape.test.mjs','scripts/native-input-cohort-candidate-plan.test.mjs']);
  assert.ok(find('native-input-cohort-type-fence').args.includes('scripts/fixtures/editor-consumer/types-native-input-cohort.ts'));
  for(const [id,script,artifact] of [['native-input-cohort','check-native-input-cohort-sdk.mjs','target/native-input-cohort-sdk.json'],['installed-native-input-cohort','check-native-input-cohort-installed.mjs','target/native-input-cohort-installed-consumer.json']]){
   const row=find(id);assert.deepEqual(row.args,['scripts/'+script]);assert.deepEqual(row.artifacts,[{path:artifact,fresh:true}]);assert.ok(row.timeoutMs>=1800000);assert.ok(plan.checks.indexOf(find('collaboration-build'))<plan.checks.indexOf(row));
  }
  for(const id of ['restored-local-participant','installed-restored-local-participant','flat-local-participant','installed-flat-local-participant','native-input-incoming-source','installed-native-input-incoming-source','physical-catalog-v3','installed-physical-catalog-v3'])find(id);
  assert.equal(plan.v1Ready,false);
 }
});
