/** Independent policy integration augments the existing complete/current gates. */
import test from 'node:test';import assert from 'node:assert/strict';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
import {independentCurrentTests,independentCurrentTypes,independentCurrentData,independentCurrentCaseCount} from './independent-current-reconciliation-plan.mjs';
for(const profile of ['functional','full'])test(profile+': independent history current reads require source and independently installed execution',()=>{
 const plan=candidateReleasePlan({profile}),rows=new Map(plan.checks.map((row,index)=>[row.id,{...row,index}]));
 const build=rows.get('server-packet-inspection-native-host'),current=rows.get('installed-current-server-packet-reconciliation'),source=rows.get('independent-current-reconciliation-native'),installed=rows.get('installed-independent-current-reconciliation');
 for(const row of [build,current,source,installed]){assert.ok(row);assert.notEqual(row.required,false);}
 assert.ok(current.index>build.index);assert.ok(source.index>current.index);assert.ok(installed.index>source.index);
 assert.deepEqual(source.args,['scripts/check-independent-current-reconciliation-source.mjs']);assert.deepEqual(installed.args,['scripts/check-independent-current-reconciliation-installed.mjs']);
 assert.deepEqual(source.artifacts,[{path:'target/independent-current-reconciliation-source-qualification.json',fresh:true}]);assert.deepEqual(installed.artifacts,[{path:'target/independent-current-reconciliation-installed-consumer.json',fresh:true}]);
 for(const id of [
  'server-packet-recovery-native','installed-server-packet-recovery',
  'current-server-packet-reconciliation-native','installed-current-server-packet-reconciliation',
  'independent-current-reconciliation-native','installed-independent-current-reconciliation',
 ]){
  const row=rows.get(id);
  assert.equal(row?.requiresSharedRuntime,true,id);
  assert.ok(rows.get('paired-shared-runtime').index<row.index,id);
 }
 for(const id of ['metadata-reconciliation-native','installed-metadata-reconciliation'])assert.ok(rows.has(id),id);
 assert.equal(plan.v1Ready,false);
});
test('independent qualification requires all three explicit policy combinations through the real fixture and existing strict public types',()=>{
 assert.equal(independentCurrentCaseCount,3);assert.deepEqual(independentCurrentTests,['independent-current-reconciliation-matrix-native.test.mjs']);
 assert.ok(independentCurrentTypes.includes('scripts/fixtures/editor-consumer/types-current-server-packet-reconciliation.ts'));
 assert.ok(independentCurrentData.includes('scripts/fixtures/local-metadata/seven-family-packet-recovery.archive'));
});
