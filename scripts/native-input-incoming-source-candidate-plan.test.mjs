/** The genuine source borrow has its own native/type/installed qualification.
 * Earlier recovery matrices remain required, and no data proof grants V1. */
import test from 'node:test';import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {candidateReleasePlan,repository} from './candidate-release/plan.mjs';
test('incoming native sources require actual native laws, fixed runtime and fresh installed bundle proof',()=>{
 for(const profile of['functional','full']){
  const plan=candidateReleasePlan({profile}),find=id=>{const row=plan.checks.find(row=>row.id===id);assert.ok(row,id);return row;},laws=find('native-input-incoming-source-contracts');
  assert.deepEqual(laws.args,['--test','scripts/native-input-incoming-source.test.mjs','scripts/native-input-incoming-source-candidate-plan.test.mjs']);assert.equal(laws.env.BREDITOR_NATIVE_INPUT_SOURCE_RUNTIME,resolve(repository,'target/promoted-shared-web'));
  const types=find('native-input-incoming-source-type-fence');for(const flag of['--strict','--exactOptionalPropertyTypes','--noUncheckedIndexedAccess'])assert.ok(types.args.includes(flag));assert.ok(types.args.includes('scripts/fixtures/editor-consumer/types-native-input-incoming-source.ts'));
  for(const[id,file,path]of[['native-input-incoming-source','check-native-input-incoming-source-sdk.mjs','target/native-input-incoming-source-sdk.json'],['installed-native-input-incoming-source','check-native-input-incoming-source-installed.mjs','target/native-input-incoming-source-installed-consumer.json']]){const row=find(id);assert.deepEqual(row.args,['scripts/'+file]);assert.deepEqual(row.artifacts,[{path,fresh:true}]);assert.ok(plan.checks.indexOf(find('collaboration-build'))<plan.checks.indexOf(row));}
  for(const id of['flat-local-participant','installed-flat-local-participant','restored-local-participant','installed-restored-local-participant','restored-local-journal','installed-restored-local-journal','installed-native-input-journal-family'])find(id);assert.equal(plan.v1Ready,false);
 }
});
