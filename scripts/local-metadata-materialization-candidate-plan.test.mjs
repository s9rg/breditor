import test from 'node:test';import assert from 'node:assert/strict';import {candidateReleasePlan} from './candidate-release/plan.mjs';
for(const profile of ['functional','full'])test(profile+': release requires complete materialized Native inspection and independent installed recovery',()=>{
 const plan=candidateReleasePlan({profile}),rows=new Map(plan.checks.map((row,index)=>[row.id,{...row,index}]));
 for(const id of ['local-metadata-materialization-plan-contracts','local-metadata-materialization-private-types','local-metadata-materialization-boundaries','local-metadata-materialization-native','installed-local-metadata-materialization']){
  assert.ok(rows.has(id),id);assert.notEqual(rows.get(id).required,false);
  for(const dependency of ['collaboration-build','rich-browser-build','native-suggestion-room-host'])assert.ok(rows.get(dependency).index<rows.get(id).index);
 }
 const native=rows.get('local-metadata-materialization-native');assert.equal(native.args.length,6);
 for(const mode of ['opaque','content-addressed','remote-content','inspection','inspection-close'])assert.ok(native.args.includes('scripts/metadata-materialization-'+mode+'-native.test.mjs'));
 assert.ok(native.index<rows.get('installed-local-metadata-materialization').index);assert.ok(native.timeoutMs>=7200000);
 assert.deepEqual(rows.get('installed-local-metadata-materialization').artifacts,[{path:'target/local-metadata-materialization-installed-consumer.json',fresh:true}]);assert.equal(plan.v1Ready,false);
});
