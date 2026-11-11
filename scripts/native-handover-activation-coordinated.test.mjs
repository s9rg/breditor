/** Actual inactive sealed successor becomes active through the genuine SDK
 * intent path; normal delivery and exact future histories follow afterward. */
import test from 'node:test';
import {testMetadataMaterialization} from './fixtures/local-metadata/materialization.mjs';
import {testColdCurrentReconciliation} from './fixtures/local-metadata/cold-current-reconciliation.mjs';
import {selectedDeliveryNativeHost} from './fixtures/selected-delivery/native-host.mjs';
import {nativeHandoverActivationRoot} from './fixtures/native-activation/handover-root.mjs';
import {testCoordinatedHandoverNativeActivation} from './fixtures/native-activation/handover-coordinated.mjs';
test('SDK activates an actual inactive handover target while preserving seven owners and fourteen offline suffixes',{timeout:7200000},()=>testMetadataMaterialization('local-only-content',{
 reconcileAssets:true,cacheCatalogPackets:false,documentSegmented:true,reviewSegmented:true,verifyFutureHistories:true,
 nativeHostRoot:nativeHandoverActivationRoot,
 nativeHostFactory:(root,options)=>selectedDeliveryNativeHost(root,{...options,nativeActivation:true,nativeHandoverActivation:true}),
 onRetainedReconciliation:input=>testColdCurrentReconciliation({...input,sealedHandover:true,onPending:testCoordinatedHandoverNativeActivation}),
}));
