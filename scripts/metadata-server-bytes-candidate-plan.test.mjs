import test from 'node:test';import assert from 'node:assert/strict';import {candidateReleasePlan} from './candidate-release/plan.mjs';
for(const profile of ['functional','full'])test(profile+': release requires selected server/inventory bytes and real Native continuation',()=>{
 const plan=candidateReleasePlan({profile}),rows=new Map(plan.checks.map((row,index)=>[row.id,{...row,index}]));
 for(const id of ['metadata-server-bytes-plan-contracts','metadata-server-bytes-private-types','metadata-server-bytes-component-contracts','metadata-server-bytes-native','installed-metadata-server-bytes']){
  assert.ok(rows.has(id),id);assert.notEqual(rows.get(id).required,false);for(const dependency of ['collaboration-build','rich-browser-build','native-suggestion-room-host'])assert.ok(rows.get(dependency).index<rows.get(id).index);
 }
 assert.ok(rows.has('installed-recoverable-metadata'));const native=rows.get('metadata-server-bytes-native');for(const kind of ['same','advanced'])assert.ok(native.args.includes('scripts/metadata-recovery-bytes-'+kind+'-server-native.test.mjs'));assert.ok(native.index<rows.get('installed-metadata-server-bytes').index);
 assert.deepEqual(rows.get('installed-metadata-server-bytes').artifacts,[{path:'target/metadata-server-bytes-installed-consumer.json',fresh:true}]);assert.ok(rows.get('installed-metadata-server-bytes').timeoutMs>=7200000);assert.equal(plan.v1Ready,false);
});
