import test from 'node:test';import assert from 'node:assert/strict';import {candidateReleasePlan} from './candidate-release/plan.mjs';
for(const profile of ['functional','full'])test(profile+': complete recoverable union remains required alongside original V1 qualification',()=>{
 const plan=candidateReleasePlan({profile}),rows=new Map(plan.checks.map((row,index)=>[row.id,{...row,index}]));
 for(const id of ['recoverable-metadata-plan-contracts','recoverable-metadata-private-types','recoverable-metadata-frame-contracts','recoverable-metadata-local-only-native','installed-recoverable-metadata']){
  assert.ok(rows.has(id),id);assert.notEqual(rows.get(id).required,false);for(const dependency of ['collaboration-build','rich-browser-build','native-suggestion-room-host'])assert.ok(rows.get(dependency).index<rows.get(id).index);
 }
 assert.ok(rows.has('installed-local-metadata-materialization'));assert.ok(rows.get('recoverable-metadata-local-only-native').index<rows.get('installed-recoverable-metadata').index);
 assert.deepEqual(rows.get('installed-recoverable-metadata').artifacts,[{path:'target/recoverable-metadata-installed-consumer.json',fresh:true}]);assert.ok(rows.get('installed-recoverable-metadata').timeoutMs>=7200000);assert.equal(plan.v1Ready,false);
});
