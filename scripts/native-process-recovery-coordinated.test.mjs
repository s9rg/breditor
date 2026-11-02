/** Actual process death plus durable intents, cold clients and original delivery. */
import test from 'node:test';
import {testMetadataMaterialization} from './fixtures/local-metadata/materialization.mjs';
import {nativeProcessHost} from './fixtures/native-process/host.mjs';
import {nativeProcessRoot} from './fixtures/native-process/native-root.mjs';
import {testColdCurrentReconciliation} from './fixtures/local-metadata/cold-current-reconciliation.mjs';
import {testProcessNativeActivation} from './fixtures/native-process/coordinated.mjs';
test('actual native process loss preserves unknown intent, fourteen offline suffixes and exact future histories',{timeout:7200000},()=>testMetadataMaterialization('local-only-content',{reconcileAssets:true,cacheCatalogPackets:false,verifyFutureHistories:true,nativeHostRoot:nativeProcessRoot,nativeHostFactory:nativeProcessHost,onRetainedReconciliation:input=>testColdCurrentReconciliation({...input,onPending:testProcessNativeActivation})}));
