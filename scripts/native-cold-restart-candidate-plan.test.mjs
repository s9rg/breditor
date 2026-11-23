/** Require the complete source and independent installed cold-recovery matrix. */
import test from 'node:test';import assert from 'node:assert/strict';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
import {candidateShardPlan} from './candidate-release/shards.mjs';
import {nativeColdTests,nativeColdTypes,nativeColdData,nativeColdCaseCount,nativeColdCaseIds,nativeColdReport,nativeColdSelection,nativeColdBuildReport} from './native-cold-restart-plan.mjs';
for(const profile of ['functional','full'])test(profile+': all cold Native recovery cases and independent packages are mandatory',()=>{
 const plan=candidateReleasePlan({profile}),rows=new Map(plan.checks.map((row,index)=>[row.id,{...row,index}]));
 const prior=rows.get('installed-independent-current-reconciliation'),build=rows.get('native-cold-restart-native-host');
 assert.ok(prior.index<build.index);
 assert.deepEqual(build.args,['scripts/build-native-cold-restart.mjs']);assert.deepEqual(build.artifacts,[{path:nativeColdBuildReport,fresh:true}]);
 for(const id of nativeColdCaseIds){
  const source=rows.get('native-cold-restart-source-'+id),installed=rows.get('installed-native-cold-restart-'+id);
  assert.ok(build.index<source.index&&source.index<installed.index);
  for(const [kind,row]of [['source',source],['installed',installed]]){
   assert.notEqual(row.required,false);
   assert.equal(row.requiresSharedRuntime,true);
   assert.deepEqual(row.args,['scripts/check-native-cold-restart-'+kind+'.mjs',id]);
   assert.deepEqual(row.artifacts,[{path:nativeColdReport(kind,id),fresh:true,retain:true}]);
   assert.ok(row.timeoutMs>nativeColdSelection(id).timeoutMs);
  }
  if(profile==='full')for(const [kind,row]of [['source',source],['installed',installed]]){
   const shard=candidateShardPlan(plan,'native-cold-restart-'+id+'-'+kind);
   assert.equal(shard.shard.stages.at(-1),row.id);
   assert.ok(shard.checks.some(check=>check.id===build.id));
   assert.ok(shard.checks.reduce((total,check)=>total+check.timeoutMs,0)<6*3600000);
  }
 }
 for(const id of ['current-server-packet-reconciliation-native','installed-current-server-packet-reconciliation','server-packet-recovery-native','installed-server-packet-recovery'])assert.ok(rows.has(id),id);
 assert.equal(plan.v1Ready,false);
});
test('five mandatory real cases retain strict public types and original byte fixtures',()=>{
 assert.equal(nativeColdCaseCount,5);assert.deepEqual(nativeColdTests,['native-cold-restart-authentication.test.mjs','native-cold-current-reconciliation.test.mjs']);
 assert.deepEqual(nativeColdCaseIds.map(id=>nativeColdSelection(id).pair),[null,'original/original','original/segmented-v1','segmented-v1/original','segmented-v1/segmented-v1']);
 assert.throws(()=>nativeColdSelection('missing'),/Unknown/);
 assert.ok(nativeColdTypes.includes('scripts/fixtures/editor-consumer/types-current-server-packet-reconciliation.ts'));
 assert.ok(nativeColdData.includes('scripts/fixtures/local-metadata/seven-family-packet-recovery.archive'));
});
