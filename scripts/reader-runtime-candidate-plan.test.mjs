/** Independent read factories must qualify both installed and bundled behavior. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
test('both candidate profiles require actual independent reader-runtime contracts',()=>{
 for(const profile of ['functional','full']){
  const plan=candidateReleasePlan({profile}),find=id=>{const row=plan.checks.find(row=>row.id===id);assert.ok(row,id);return row;};
  assert.deepEqual(find('reader-runtime-contracts').args,['--test','scripts/independent-operation-reader-runtime-development.test.mjs','scripts/restored-graph-reader-runtime-development.test.mjs','scripts/reader-runtime-candidate-plan.test.mjs']);
  const types=find('reader-runtime-type-fence');for(const name of ['types-independent-operation-portable.ts','types-restored-graph.ts'])assert.ok(types.args.includes('scripts/fixtures/editor-consumer/'+name));
  for(const[id,script,path,timeout]of [['reader-runtime','check-reader-runtime-sdk.mjs','target/reader-runtime-sdk.json',900000],['installed-reader-runtime','check-reader-runtime-installed.mjs','target/reader-runtime-installed-consumer.json',1800000]]){
   const row=find(id);assert.deepEqual(row.args,['scripts/'+script]);assert.deepEqual(row.artifacts,[{path,fresh:true}]);assert.ok(row.timeoutMs>=timeout);
   assert.equal(row.requiresSharedRuntime,true);
   for(const dependency of ['paired-shared-runtime','collaboration-build','reader-runtime-contracts','reader-runtime-type-fence'])assert.ok(plan.checks.indexOf(find(dependency))<plan.checks.indexOf(row));
  }
  for(const id of ['independent-operation-portable','installed-independent-operation-portable','restored-graph','installed-restored-graph','operational-native-read','installed-operational-native-read'])find(id);
  assert.equal(plan.v1Ready,false);
 }
});
