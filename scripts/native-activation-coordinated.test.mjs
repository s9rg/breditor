/** Genuine seven-family SDK -> Rust activation, followed by original histories. */
import test from 'node:test';
import {testMetadataMaterialization} from './fixtures/local-metadata/materialization.mjs';
import {selectedDeliveryNativeHost} from './fixtures/selected-delivery/native-host.mjs';
import {nativeActivationRoot} from './fixtures/native-activation/native-root.mjs';
import {testColdCurrentReconciliation} from './fixtures/local-metadata/cold-current-reconciliation.mjs';
import {testCoordinatedNativeActivation} from './fixtures/native-activation/coordinated.mjs';
test('real SDK activation preserves seven cold owners, fourteen offline suffixes and one native epoch',{timeout:7200000},()=>testMetadataMaterialization('local-only-content',{reconcileAssets:true,cacheCatalogPackets:false,verifyFutureHistories:true,nativeHostRoot:nativeActivationRoot,nativeHostFactory:(root,options)=>selectedDeliveryNativeHost(root,{...options,nativeActivation:true}),onRetainedReconciliation:input=>testColdCurrentReconciliation({...input,onPending:testCoordinatedNativeActivation})}));
