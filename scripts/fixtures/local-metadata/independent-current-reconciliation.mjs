/** Keep the chosen document/comment Native policies literal across current
 * server/provider reads and both original future Undo/Redo histories. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {testMetadataMaterialization} from './materialization.mjs';
import {testLazyVersionReconciliation} from './lazy-version-reconciliation.mjs';
import {inspectionNativeRoot} from '../server-packet-inspection/native-root.mjs';

export async function testIndependentCurrentReconciliation({documentSegmented,reviewSegmented}){
 assert.equal(typeof documentSegmented,'boolean');assert.equal(typeof reviewSegmented,'boolean');
 const selected={document:documentSegmented?'segmented-v1':'original',review:reviewSegmented?'segmented-v1':'original'};
 let evidence;
 await testMetadataMaterialization('local-only-content',{
  reconcileAssets:true,cacheCatalogPackets:false,documentSegmented,reviewSegmented,verifyFutureHistories:true,nativeHostRoot:inspectionNativeRoot,
  async onReconciled(input){
   const policies=()=>input.sources.map(row=>({id:row.id,document:row.source.core.segmentedHistoryPolicy()??'original',review:row.source.core.reviewHistoryPolicy()}));
   const before=policies();assert.equal(before.length,7);
   for(const row of before){
    const expected=row.id==='original'?{document:'original',review:'original'}:row.id==='generation'?{document:'segmented-v1',review:'original'}:selected;
    assert.deepEqual({document:row.document,review:row.review},expected,row.id);
   }
   // All original current-read and no-download assertions are shared intact.
   await testLazyVersionReconciliation(input);
   assert.deepEqual(policies(),before);input.check();input.scope.check();
   const lazyPath=join(input.host.directory,'lazy-version-current-reconciliation-observation.json'),lazy=readFileSync(lazyPath);
   const report={format:'breditor/independent-current-reconciliation-observation',formatVersion:1,selected,participants:7,actualNativePolicies:before,policiesUnchanged:true,originalPendingPreserved:true,forbiddenBodyDownloads:0,providerAssets:3,uploadRoles:14,baseObservation:{file:lazyPath,sha256:createHash('sha256').update(lazy).digest('hex')},wholeRoomActivated:false};
   const file=join(input.host.directory,'independent-current-reconciliation-observation.json'),bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');
   writeFileSync(file,bytes,{flag:'wx',mode:0o600});assert.deepEqual(readFileSync(file),bytes);
   evidence={file,sha256:createHash('sha256').update(bytes).digest('hex'),...report};
  }
 });
 // Materialization returns only after the real original document/review
 // Undo/Redo loops for all seven clients and orderly Native host shutdown.
 assert.ok(evidence);console.log('INDEPENDENT_CURRENT_RECONCILIATION_NATIVE '+JSON.stringify({...evidence,futureDocumentAndReviewUndoRedo:true}));
}
