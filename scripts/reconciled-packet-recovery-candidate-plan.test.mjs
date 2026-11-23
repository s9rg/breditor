/** All byte/current association and reference-read checks remain mandatory. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {candidateReleasePlan} from './candidate-release/plan.mjs';
import {candidateShardPlan} from './candidate-release/shards.mjs';
import {
 reconciledPacketBuildReport,reconciledPacketCaseCount,reconciledPacketCaseIds,
 reconciledPacketReport,reconciledPacketSelection,reconciledPacketTests,reconciledPacketTypes,
} from './reconciled-packet-recovery-plan.mjs';
import {checkReconciledPacketEvidence} from './reconciled-packet-recovery-evidence.mjs';

for(const profile of ['functional','full'])test(profile+': all paired captures run from source and independent packages',()=>{
 const plan=candidateReleasePlan({profile}),rows=new Map(plan.checks.map((row,index)=>[row.id,{...row,index}]));
 const restart=rows.get('installed-native-cold-restart-both-segmented'),build=rows.get('reconciled-packet-native-host');
 assert.ok(restart.index<build.index);
 assert.deepEqual(build.args,['scripts/build-reconciled-packet-native.mjs']);
 assert.deepEqual(build.artifacts,[{path:reconciledPacketBuildReport,fresh:true}]);
 for(const id of reconciledPacketCaseIds){
  const source=rows.get('reconciled-packet-recovery-source-'+id),installed=rows.get('installed-reconciled-packet-recovery-'+id);
  assert.ok(build.index<source.index&&source.index<installed.index);
  for(const [kind,row] of [['source',source],['installed',installed]]){
   assert.notEqual(row.required,false);
   assert.equal(row.requiresSharedRuntime,true);
   assert.deepEqual(row.args,['scripts/check-reconciled-packet-recovery-'+kind+'.mjs',id]);
   assert.deepEqual(row.artifacts,[{path:reconciledPacketReport(kind,id),fresh:true,retain:true}]);
   assert.ok(row.timeoutMs>reconciledPacketSelection(id).timeoutMs);
   if(profile==='full'){
    const shard=candidateShardPlan(plan,'reconciled-packet-'+id+'-'+kind);
    assert.equal(shard.shard.stages.at(-1),row.id);
    assert.ok(shard.checks.some(check=>check.id===build.id));
    assert.ok(shard.checks.reduce((total,check)=>total+check.timeoutMs,0)<6*3600000);
   }
  }
 }
 for(const id of ['current-server-packet-reconciliation-native','installed-current-server-packet-reconciliation','server-packet-recovery-native','installed-server-packet-recovery'])assert.ok(rows.has(id),id);
 assert.equal(plan.v1Ready,false);
});

test('selected cases retain all strict contracts and original current-read compatibility',()=>{
 const selections=reconciledPacketCaseIds.map(reconciledPacketSelection);
 assert.equal(reconciledPacketCaseCount,21);
 assert.equal(selections.reduce((count,entry)=>count+entry.count,0),reconciledPacketCaseCount);
 assert.deepEqual([...new Set(selections.flatMap(entry=>entry.tests))],reconciledPacketTests);
 assert.deepEqual(reconciledPacketSelection().tests,reconciledPacketTests);
 assert.throws(()=>reconciledPacketSelection('unknown'),/Unknown/);
 assert.ok(reconciledPacketTypes.includes('scripts/fixtures/editor-consumer/types-reconciled-packet-recovery.ts'));
 assert.ok(reconciledPacketTypes.includes('scripts/fixtures/editor-consumer/types-archive-read-length.ts'));
});

test('selected Native checks require evidence from their named path',()=>{
 const compatibility='# LAZY_VERSION_RECONCILIATION_NATIVE {"currentKind":"checked","originalKind":"pending","cacheCalls":0,"forbiddenBodyDownloads":0}\n';
 assert.doesNotThrow(()=>checkReconciledPacketEvidence(compatibility,'compatibility'));
 assert.throws(()=>checkReconciledPacketEvidence(compatibility,'checked'));
 assert.throws(()=>checkReconciledPacketEvidence('', 'availability'));
 assert.throws(()=>checkReconciledPacketEvidence(compatibility,'contracts'));
});
