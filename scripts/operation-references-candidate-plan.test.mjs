/** Reference discovery cannot be qualified only through a backup resolver. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
test('both candidate profiles require real reference reads in source, packages and bundle',()=>{
 for(const profile of ['functional','full']){
  const plan=candidateReleasePlan({profile}),find=id=>{const stage=plan.checks.find(row=>row.id===id);assert.ok(stage,id);return stage;};
  assert.deepEqual(find('operation-references-contracts').args,['--test','scripts/independent-operation-reference-capture-development.test.mjs','scripts/restored-graph-reference-capture-development.test.mjs','scripts/local-operation-reference-capture-development.test.mjs','scripts/local-input-reference-capture-development.test.mjs','scripts/operation-reference-disposal.test.mjs','scripts/operation-references-candidate-plan.test.mjs']);
  for(const name of ['types-independent-operation-portable.ts','types-restored-graph.ts','types-operation-references-development.ts','types-local-operation-references-development.ts','types-local-input-references-development.ts'])assert.ok(find('operation-references-type-fence').args.includes('scripts/fixtures/editor-consumer/'+name));
  for(const[id,script,path,timeout]of [['operation-references','check-operation-references-sdk.mjs','target/operation-references-sdk.json',900000],['installed-operation-references','check-operation-references-installed.mjs','target/operation-references-installed-consumer.json',1800000]]){
   const row=find(id);assert.deepEqual(row.args,['scripts/'+script]);assert.deepEqual(row.artifacts,[{path,fresh:true}]);assert.ok(row.timeoutMs>=timeout);for(const dependency of ['collaboration-build','operation-references-contracts','operation-references-type-fence'])assert.ok(plan.checks.indexOf(find(dependency))<plan.checks.indexOf(row));
  }
  for(const id of ['reader-runtime','installed-reader-runtime','restored-graph','installed-restored-graph','operational-native-read','installed-operational-native-read'])find(id);
  assert.equal(plan.v1Ready,false);
 }
});
