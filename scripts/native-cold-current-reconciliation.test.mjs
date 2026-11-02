/** Real controlled Native service restart and seven independently reopened SDK owners.
 * Synthetic local storage/locks; this does not certify process-crash durability. */
import test from 'node:test';
import {testMetadataMaterialization} from './fixtures/local-metadata/materialization.mjs';
import {testColdCurrentReconciliation} from './fixtures/local-metadata/cold-current-reconciliation.mjs';
import {selectedRestartNativeHost} from './fixtures/selected-delivery/native-restart-host.mjs';
import {coldNativeRoot} from './fixtures/selected-delivery/cold-native-root.mjs';
for(const [documentSegmented,reviewSegmented] of [[false,false],[false,true],[true,false],[true,true]]){
 test('Native epoch restart preserves seven cold owners: document='+documentSegmented+' review='+reviewSegmented,{timeout:7200000},()=>testMetadataMaterialization('local-only-content',{
  reconcileAssets:true,cacheCatalogPackets:false,documentSegmented,reviewSegmented,
  nativeHostFactory:selectedRestartNativeHost,nativeHostRoot:coldNativeRoot,
  onRetainedReconciliation:input=>testColdCurrentReconciliation({...input,restartNativeServer:true}),
  verifyFutureHistories:true,
 }));
}
