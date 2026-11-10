/** Complete selected packet and raster bytes after handover and offline delivery. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {testMetadataMaterialization} from './fixtures/local-metadata/materialization.mjs';
import {testColdCurrentReconciliation} from './fixtures/local-metadata/cold-current-reconciliation.mjs';
import {coreReadStamp} from '../packages/breditor-collaboration/dist/core_read_stamp.js';

test('sealed handover retains complete recovery bytes after current metadata reconciliation',{timeout:7200000},
 () => testMetadataMaterialization('local-only-content',{
  reconcileAssets:true,cacheCatalogPackets:false,documentSegmented:true,reviewSegmented:true,verifyFutureHistories:true,
  onRetainedReconciliation:input=>testColdCurrentReconciliation({
   ...input,sealedHandover:true,
   async onReconciled({scope,sources,metadata,fresh,check}){
    const before=metadata.recovery(),native=sources.map(row=>coreReadStamp(row.source.core));
    const result=await metadata.captureReconciledServerPacketRecoveryAcrossHandover({
     host:fresh.delivery,path:fresh.path,server:fresh.server,inventory:fresh.inventory,transport:fresh.delivery,
    });
    check();scope.check();
    assert.deepEqual(result.handover,fresh.path.handoverSelection());
    assert.equal(result.capture.reconciliation.kind,'checked');
    assert.equal(result.capture.recovery.kind,'retained');
    assert.equal(result.capture.recovery.bundle.assets.kind,'retained');
    assert.deepEqual(result.capture.recovery.bundle.original.server.identity,fresh.actual.selection.source.server);
    assert.deepEqual(metadata.recovery().before,before.before);
    assert.deepEqual(metadata.recovery().current.lanes.map(row=>row.records),before.current.lanes.map(row=>row.records));
    assert.deepEqual(sources.map(row=>coreReadStamp(row.source.core)),native);
    console.log('METADATA_HANDOVER_BYTES_STEP complete-packets-rasters-and-native-files-retained-with-original-facts');
   },
  }),
 }));
