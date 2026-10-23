/** Neither a development overlay nor a reduced probe can replace the actual
 * private flat family, full native domain and fresh installed consumer. */
import test from 'node:test';import assert from 'node:assert/strict';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
test('flat operational recovery requires exact contracts, types and full native consumers',()=>{
 for(const profile of['functional','full']){
  const plan=candidateReleasePlan({profile}),find=id=>{const row=plan.checks.find(row=>row.id===id);assert.ok(row,id);return row;};
  assert.deepEqual(find('flat-local-participant-contracts').args,['--test','scripts/flat-local-framing.test.mjs','scripts/flat-local-journal.test.mjs','scripts/flat-local-participant.test.mjs','scripts/flat-local-admission.test.mjs','scripts/flat-local-constructor.test.mjs','scripts/flat-local-participant-failure.test.mjs','scripts/flat-local-participant-admission.test.mjs','scripts/flat-local-participant-lifetime.test.mjs','scripts/flat-local-participant-policy.test.mjs','scripts/flat-local-participant-read-factory.test.mjs','scripts/flat-local-participant-read-runtime.test.mjs','scripts/flat-local-participant-read-policy.test.mjs','scripts/flat-local-participant-candidate-plan.test.mjs']);
  assert.ok(find('flat-local-participant-type-fence').args.includes('--noUncheckedIndexedAccess'));
  for(const file of['types-flat-local-journal.ts','types-flat-local-participant.ts'])assert.ok(find('flat-local-participant-type-fence').args.includes('scripts/fixtures/editor-consumer/'+file));
  for(const[id,script,path]of[['flat-local-participant','check-flat-local-participant-sdk.mjs','target/flat-local-operation-participant-sdk.json'],['installed-flat-local-participant','check-flat-local-participant-installed.mjs','target/flat-local-operation-participant-installed-consumer.json']]){const row=find(id);assert.ok(row.args.includes('scripts/'+script));assert.deepEqual(row.artifacts,[{path,fresh:true}]);assert.ok(plan.checks.indexOf(find('collaboration-build'))<plan.checks.indexOf(row));}
  for(const id of['restored-local-participant','installed-restored-local-participant','restored-local-journal','installed-restored-local-journal','installed-native-input-journal-family'])find(id);
  assert.equal(plan.v1Ready,false);
 }
});
