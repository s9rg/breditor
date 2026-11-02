import {withArchiveReadDiagnostics} from './fixtures/archive-read-diagnostics.mjs';
/** Full actual managed image ACKs and two original protocol delivery passes,
 * then current complete reconciliation without downloading every version body. */
import test from 'node:test';
import {testMetadataMaterialization} from './fixtures/local-metadata/materialization.mjs';
import {testLazyVersionReconciliation} from './fixtures/local-metadata/lazy-version-reconciliation.mjs';
import {reconciledPacketNativeRoot} from './fixtures/reconciled-packet/native-root.mjs';
test('all seven real sources reconcile current Native/outbox/provider requirements while historical version caches retain original Pending',{timeout:7200000},()=>withArchiveReadDiagnostics(()=>testMetadataMaterialization('local-only-content',{reconcileAssets:true,cacheCatalogPackets:false,nativeHostRoot:reconciledPacketNativeRoot,onReconciled:testLazyVersionReconciliation})));
