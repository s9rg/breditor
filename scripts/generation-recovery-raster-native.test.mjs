/** Genuine inactive Rust service, recovery data and subsequent SDK activation. */
import test from 'node:test';
import {testMetadataMaterialization} from './fixtures/local-metadata/materialization.mjs';
import {selectedDeliveryNativeHost} from './fixtures/selected-delivery/native-host.mjs';
import {recoveryRasterRoot} from './fixtures/recovery-raster/native-root.mjs';
import {testInactiveRecoveryRasters} from './fixtures/recovery-raster/inactive.mjs';
test('inactive Native recovery retains complete client/packet/image data before activation',{timeout:7200000},()=>testMetadataMaterialization('remote-content',{verifyFutureHistories:true,nativeHostRoot:recoveryRasterRoot,nativeHostFactory:(root,options)=>selectedDeliveryNativeHost(root,{...options,nativeActivation:true,inactiveRasters:true}),onRecoverable:testInactiveRecoveryRasters}));
