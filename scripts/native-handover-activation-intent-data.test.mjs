/** Complete cold handover bytes and durable new-family intent DATA. Native
 * activation and publication remain separately authenticated integration work. */
import test from 'node:test';
import {testMetadataMaterialization} from './fixtures/local-metadata/materialization.mjs';
import {testColdCurrentReconciliation} from './fixtures/local-metadata/cold-current-reconciliation.mjs';
import {retainActualHandoverActivationData} from './fixtures/native-activation/handover-intent-retention.mjs';
test('complete sealed handover capture survives durable activation-intent and disk reopen',{timeout:7200000},
 ()=>testMetadataMaterialization('local-only-content',{
  reconcileAssets:true,cacheCatalogPackets:false,documentSegmented:true,reviewSegmented:true,verifyFutureHistories:true,
  onRetainedReconciliation:input=>testColdCurrentReconciliation({...input,sealedHandover:true,onReconciled:retainActualHandoverActivationData}),
 }));
