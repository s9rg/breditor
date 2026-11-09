/** Actual SDK HTTP commits and publishes the real service; IPC observes only. */
import test from 'node:test';
import {testMetadataMaterialization} from './fixtures/local-metadata/materialization.mjs';
import {selectedDeliveryNativeHost} from './fixtures/selected-delivery/native-host.mjs';
import {nativePublicationPredecessorRoot} from './fixtures/native-publication/predecessor-root.mjs';
import {testColdCurrentReconciliation} from './fixtures/local-metadata/cold-current-reconciliation.mjs';
import {testCoordinatedNativePublication} from './fixtures/native-publication/coordinated.mjs';
test('real SDK publication retains seven cold owners and fourteen original offline document/comment suffixes',{timeout:7200000},()=>testMetadataMaterialization('local-only-content',{reconcileAssets:true,cacheCatalogPackets:false,verifyFutureHistories:true,nativeHostRoot:nativePublicationPredecessorRoot,nativeHostFactory:(root,options)=>selectedDeliveryNativeHost(root,{...options,nativeActivation:true,nativePublication:true}),onRetainedReconciliation:input=>testColdCurrentReconciliation({...input,onPending:testCoordinatedNativePublication})}));
