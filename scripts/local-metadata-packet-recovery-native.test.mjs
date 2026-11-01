
import test from 'node:test';
import {testMetadataMaterialization} from './fixtures/local-metadata/materialization.mjs';
import {testPacketRecovery} from './fixtures/local-metadata/packet-recovery.mjs';
import {metadataNativeRoot} from './fixtures/server-metadata/native-root.mjs';
test('genuine seven-family recovery preserves exact remote/local packets, intermediate-only image bytes and original Native histories',{timeout:7200000},async()=>testMetadataMaterialization('local-only-content',{reconcileAssets:true,nativeHostRoot:metadataNativeRoot,onReconciled:testPacketRecovery}));
