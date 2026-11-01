/** Full actual managed image ACKs and two original protocol delivery passes,
 * then current complete reconciliation without downloading every version body. */
import test from 'node:test';
import {testMetadataMaterialization} from './fixtures/local-metadata/materialization.mjs';
import {testLazyVersionReconciliation} from './fixtures/local-metadata/lazy-version-reconciliation.mjs';
import {inspectionNativeRoot} from './fixtures/server-packet-inspection/native-root.mjs';
test('all seven real sources reconcile current Native/outbox/provider requirements while historical version caches retain original Pending',{timeout:7200000},()=>testMetadataMaterialization('local-only-content',{reconcileAssets:true,cacheCatalogPackets:false,nativeHostRoot:inspectionNativeRoot,onReconciled:testLazyVersionReconciliation}));
